// @dsh/dynamic-agents — 动态AGENTS.md。
//
// 数据分两层：
//   - 全局：~/.dsh/dynamic-agents.json（$DSH_HOME 优先）——所有工作区共享的
//     上下文**库**（contexts 定义），**不含 selectedIds**；由本插件用 node fs
//     直管（ctx.fs 受工作区沙箱策略限制，写不到用户目录）。
//   - 工作区：<工作区>/.dsh/dynamic-agents.json —— contexts + selectedIds +
//     unlockedSessionIds + sessionSnapshots；**勾选状态（含全局规则的勾选）统一由
//     工作区文件的 selectedIds 控制**，全局规则以 `g-` 前缀 id 混存其中。
//
// 注入：全局在前、工作区在后；同组内按各自列表顺序（拖拽可调整）合并渲染。
//
// 会话隔离：会话首次组装系统提示时，把当时生效的规则固化为**会话快照**
// （sessionSnapshots[sessionId]）；此后其他会话修改规则库不会改变该会话的提示词，
// 锁定会话的面板也只展示这份快照，避免出现“提示词被更新”的错觉。会话解锁后，
// 本会话产生的修改会同步刷新自己的快照（下一次请求生效）；重新锁定时再次固化。
//
// Route 契约（POST /dsh-dynamic-agents/api，body { method, sessionId, ... }）：
//   getState             → 锁定会话返回其会话快照；否则返回实时规则库
//                          { global: {contexts, selectedIds}, workspace: {contexts, selectedIds, unlocked} }
//   setSelection         → 更新工作区勾选中的本地部分
//   setGlobalSelection   → 更新工作区勾选中的全局部分（g- 前缀）
//   setUnlocked          → 工作区会话解锁状态（重新锁定时固化新的会话快照）
//   addContext           → 工作区新增（默认勾选）
//   addGlobalContext     → 全局库新增（g- 前缀 id，自动勾选到当前工作区）
//   updateContext        → 工作区规则改名/改内容
//   updateGlobalContext  → 全局库规则改名/改内容
//   reorderContexts      → 工作区规则拖拽排序（orderedIds 完整顺序）
//   reorderGlobalContexts→ 全局库规则拖拽排序（orderedIds 完整顺序）
//   deleteContext        → 工作区删除
//   deleteGlobalContext  → 全局库删除（各工作区残留勾选由校验自动失效）
//   响应：200 { ok: true, data } 或 { ok: false, error }；405/400/500 同构错误。
//
// 配置刷新：工作区/全局配置文件均记录版本令牌，在新会话（session/created、
// agent/created 首回合前）与每次请求前按版本比对，变化才重新读盘；因此外部修改
// 配置文件后无需重启 dsh，新会话即可生效。刷新读取/解析失败时保留上一份状态。

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";

/** 行 id（patch 层 insert 的 id 与之一致）。 */
export const name = "dynamic-agents";

/** Host 服务依赖。 */
export const inject = ["webServer", "sessions", "fs", "sandboxPolicy", "systemPrompt"];

/** JSON route 路径（浏览器半区 fetch 同源地址）。 */
export const API_PATH = "/dsh-dynamic-agents/api";

/** 单次请求体上限。 */
const MAX_BODY_BYTES = 1024 * 1024;

/** 单条上下文名称/内容上限。 */
const MAX_NAME_LENGTH = 200;
const MAX_CONTENT_LENGTH = 64 * 1024;

/** 全局存储文件名（置于 $DSH_HOME 或 ~/.dsh 下）。 */
const GLOBAL_STORE_NAME = "dynamic-agents.json";

/** 全局上下文 id 前缀（区分工作区 selectedIds 中的全局/本地项）。 */
const GLOBAL_ID_PREFIX = "g-";

/** 会话快照最长保留时间：过期后下次加载时清理，避免历史/子代理会话快照无限增长。 */
const MAX_SNAPSHOT_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** 全局存储绝对路径（$DSH_HOME 优先，缺省 ~/.dsh）。 */
function globalStorePath() {
  const env = typeof process !== "undefined" && process.env ? process.env.DSH_HOME : undefined;
  const home = typeof env === "string" && env.trim() !== "" ? env.trim() : join(homedir(), ".dsh");
  return join(home, GLOBAL_STORE_NAME);
}

/** 生成全局上下文 id（g- 前缀）。 */
function newGlobalId() {
  return GLOBAL_ID_PREFIX + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/** 生成工作区上下文 id（无前缀）。 */
function newLocalId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// ---------- 勾选拆分/校验（围绕工作区 entry + 全局库） ----------
// 返回 { globalIds, localIds }：按 g- 前缀区分，并各自校验存在性。
function splitSelection(entry, global) {
  const globalContextIds = global === null ? null : new Set(global.contexts.map((c) => c.id));
  const localContextIds = new Set(entry.contexts.map((c) => c.id));
  const globalIds = [];
  const localIds = [];
  for (const id of entry.selectedIds) {
    if (id.startsWith(GLOBAL_ID_PREFIX)) {
      if (globalContextIds !== null && globalContextIds.has(id)) globalIds.push(id);
    } else if (localContextIds.has(id)) {
      localIds.push(id);
    }
  }
  return { globalIds, localIds };
}

// 将工作区 entry 的 selectedIds 收紧为合法集合（无效 g- 残留在此被清除）
function pruneSelection(entry, global) {
  const { globalIds, localIds } = splitSelection(entry, global);
  entry.selectedIds = localIds.concat(globalIds);
}

/** 按 orderedIds 重排列表：未知/重复 id 忽略，未出现的条目按原顺序追加，保证不丢规则。 */
function assignOrder(list, orderedIds) {
  const byId = new Map(list.map((c) => [c.id, c]));
  const next = [];
  for (const id of orderedIds) {
    if (typeof id !== "string") continue;
    const item = byId.get(id);
    if (item === undefined) continue;
    byId.delete(id);
    next.push(item);
  }
  for (const item of byId.values()) next.push(item);
  return next;
}

/** 只暴露上下文的稳定 JSON 字段，避免两层状态重复写映射逻辑。 */
function publicContextsOf(contexts) {
  return contexts.map((c) => ({ id: c.id, name: c.name, content: c.content }));
}

/** 工作区状态结构（纯 JSON，selectedIds 为本地部分）。 */
function workspaceStateOf(entry, global, sessionId) {
  return {
    contexts: publicContextsOf(entry.contexts),
    selectedIds: splitSelection(entry, global).localIds,
    unlocked: entry.unlockedSessionIds.includes(sessionId),
  };
}

/** 全局状态结构（纯 JSON，selectedIds 为当前工作区勾选的全局部分）。 */
function globalStateOf(global, entry) {
  return {
    contexts: publicContextsOf(global.contexts),
    selectedIds: splitSelection(entry, global).globalIds,
  };
}

/** 当前生效的注入规则（全局在前、工作区在后，均按各自列表顺序）。 */
function effectiveRulesOf(entry, global) {
  const selected = new Set(entry.selectedIds);
  const rules = [];
  if (global !== null) {
    for (const item of global.contexts) {
      if (!selected.has(item.id)) continue;
      rules.push({ id: item.id, scope: "global", name: item.name, content: item.content });
    }
  }
  for (const item of entry.contexts) {
    if (!selected.has(item.id)) continue;
    rules.push({ id: item.id, scope: "workspace", name: item.name, content: item.content });
  }
  return rules;
}

/** 把规则数组渲染为系统提示 section 文本。 */
function rulesTextOf(rules) {
  const parts = [];
  for (const rule of rules) {
    if (rule.content.trim()) parts.push(`## ${rule.name}\n\n${rule.content}`);
  }
  return parts.join("\n\n");
}

/** 会话快照 → 面板状态（锁定会话展示开始时的规则快照，只读）。 */
function snapshotStateOf(snapshot) {
  const globalContexts = [];
  const localContexts = [];
  for (const rule of snapshot.rules) {
    const item = { id: rule.id, name: rule.name, content: rule.content };
    if (rule.scope === "global") globalContexts.push(item);
    else localContexts.push(item);
  }
  return {
    global: { contexts: globalContexts, selectedIds: globalContexts.map((c) => c.id) },
    workspace: { contexts: localContexts, selectedIds: localContexts.map((c) => c.id), unlocked: false },
  };
}

/** 子代理会话不固化快照（短生命周期，不属于用户交互会话）。 */
function isSubagentSession(session) {
  const header = session && (session.header || session.meta);
  if (!header) return false;
  return header.origin === "subagent" || (typeof header.delegationDepth === "number" && header.delegationDepth > 0);
}

/** 清理过期会话快照（原地修改）。 */
function pruneSnapshots(snapshots) {
  const now = Date.now();
  for (const [sessionId, snapshot] of Object.entries(snapshots)) {
    if (snapshot && snapshot.updatedAt > 0 && now - snapshot.updatedAt > MAX_SNAPSHOT_AGE_MS) {
      delete snapshots[sessionId];
    }
  }
}

/** 校验并归一化工作区文件中的会话快照。 */
function sanitizeSnapshots(raw) {
  const snapshots = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return snapshots;
  for (const [sessionId, value] of Object.entries(raw)) {
    if (typeof sessionId !== "string" || sessionId === "") continue;
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const rules = Array.isArray(value.rules)
      ? value.rules
          .filter(
            (r) =>
              r &&
              typeof r.id === "string" &&
              (r.scope === "global" || r.scope === "workspace") &&
              typeof r.name === "string" &&
              typeof r.content === "string",
          )
          .map((r) => ({ id: r.id, scope: r.scope, name: r.name, content: r.content }))
      : [];
    snapshots[sessionId] = {
      updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
      rules,
    };
  }
  return snapshots;
}

/** 空条目。 */
function emptyEntry() {
  return { contexts: [], selectedIds: [], unlockedSessionIds: [], sessionSnapshots: {} };
}

/** 任意抛出的消息文本。 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/** 读取并校验新增上下文的公共输入。 */
function readContextInput(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!name) throw new Error("名称不能为空");
  if (name.length > MAX_NAME_LENGTH) throw new Error(`名称不能超过 ${MAX_NAME_LENGTH} 字符`);
  if (!content) throw new Error("内容不能为空");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`内容不能超过 ${MAX_CONTENT_LENGTH} 字符`);

  return { name, content };
}

/** 发送 JSON 响应（no-store）。 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

/**
 * Host 插件主体。
 * @param ctx - 宿主上下文（webServer/sessions/fs/sandboxPolicy/systemPrompt 已注入）。
 */
export function apply(ctx) {
  // ---------- 工作区层：内存缓存与写队列 ----------
  // 缓存键：工作区绝对路径；值：{ contexts, selectedIds, unlockedSessionIds }
  const cache = new Map();
  // 每工作区配置文件版本令牌（ctx.fs 的 FsInfo.version；null = 文件不存在）
  const workspaceVersions = new Map();
  // 每工作区刷新中 Promise（并发去重）
  const refreshing = new Map();
  // 每工作区的串行化写入队列（防止读-改-写交错）
  const writeQueues = new Map();

  // ---------- 全局层：单例缓存（node fs 直管，只有 contexts） ----------
  let globalEntry = null; // null = 未加载
  let globalVersion = null; // node stat 版本（mtime/ctime/size；null = 文件不存在）
  let globalRefreshing = null;
  let globalWriteQueue = Promise.resolve();

  // 配置文件路径：<工作区>/.dsh/dynamic-agents.json
  const storeTarget = (cwd) => ctx.fs.resolve(".dsh/dynamic-agents.json", { cwd });

  /** ctx.fs 文件版本令牌；文件不存在为 null。 */
  function workspaceVersionOf(info) {
    return info === undefined || info === null ? null : String(info.version);
  }

  // 从磁盘读取一个工作区的配置到缓存（文件缺失按空状态处理）。
  // 刷新时读取/解析失败保留上一份可用状态，避免空状态回写覆盖用户配置。
  // 本地 id 在此校验；g- 前缀 id 先宽松保留（全局库存在性在 pruneSelection 统一处理）。
  async function readWorkspace(cwd, reason) {
    let target;
    let info;
    try {
      target = await storeTarget(cwd);
      info = await ctx.fs.stat(target);
    } catch (e) {
      console.error("[dynamic-agents] 检查配置文件失败", { cwd, reason, error: String(e) });
      if (!cache.has(cwd)) cache.set(cwd, emptyEntry());
      return;
    }
    if (info === undefined) {
      cache.set(cwd, emptyEntry());
      workspaceVersions.set(cwd, null);
      console.log("[dynamic-agents] 工作区配置不存在，已按空状态处理", { cwd, reason, status: "empty" });
      return;
    }
    let text;
    try {
      text = await ctx.fs.readText(target);
    } catch (e) {
      console.error("[dynamic-agents] 读取配置失败", { cwd, reason, error: String(e) });
      if (!cache.has(cwd)) cache.set(cwd, emptyEntry());
      return;
    }
    let parsed = null;
    let corrupt = false;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      corrupt = true;
      console.error("[dynamic-agents] 配置文件损坏", { cwd, reason, error: String(e) });
    }
    const version = workspaceVersionOf(info);
    if (corrupt && cache.has(cwd)) {
      // 保留上一份有效状态，只推进版本，避免同一个坏文件被反复重试
      workspaceVersions.set(cwd, version);
      console.error("[dynamic-agents] 配置损坏，保留上一份状态", { cwd, reason, status: "kept" });
      return;
    }
    const contexts = Array.isArray(parsed && parsed.contexts)
      ? parsed.contexts.filter(
          (c) => c && typeof c.id === "string" && typeof c.name === "string" && typeof c.content === "string",
        )
      : [];
    const localIds = new Set(contexts.map((c) => c.id));
    const selectedIds = Array.isArray(parsed && parsed.selectedIds)
      ? parsed.selectedIds.filter((id) => typeof id === "string" && (id.startsWith(GLOBAL_ID_PREFIX) || localIds.has(id)))
      : [];
    const unlockedSessionIds = Array.isArray(parsed && parsed.unlockedSessionIds)
      ? parsed.unlockedSessionIds.filter((id) => typeof id === "string")
      : [];
    const sessionSnapshots = sanitizeSnapshots(parsed && parsed.sessionSnapshots);
    // 外部编辑可能没有 sessionSnapshots：保留内存里已有的快照，避免进行中会话的冻结状态丢失
    const previous = cache.get(cwd);
    if (previous !== undefined) {
      for (const [sessionId, snapshot] of Object.entries(previous.sessionSnapshots || {})) {
        if (sessionSnapshots[sessionId] === undefined) sessionSnapshots[sessionId] = snapshot;
      }
    }
    pruneSnapshots(sessionSnapshots);
    cache.set(cwd, { contexts, selectedIds, unlockedSessionIds, sessionSnapshots });
    workspaceVersions.set(cwd, version);
    console.log("[dynamic-agents] 配置已加载", {
      cwd,
      reason,
      contextCount: contexts.length,
      selectedCount: selectedIds.length,
      snapshotCount: Object.keys(sessionSnapshots).length,
      status: "ok",
    });
  }

  // 按文件版本决定是否重读；并发刷新合并为一次。
  function refreshWorkspace(cwd, reason) {
    const pending = refreshing.get(cwd);
    if (pending !== undefined) return pending;
    const task = (async () => {
      let info;
      try {
        info = await ctx.fs.stat(await storeTarget(cwd));
      } catch (e) {
        console.error("[dynamic-agents] 检查配置变化失败", { cwd, reason, error: String(e) });
        return;
      }
      const next = workspaceVersionOf(info);
      if (workspaceVersions.has(cwd) && workspaceVersions.get(cwd) === next) return;
      await readWorkspace(cwd, reason);
    })().finally(() => {
      refreshing.delete(cwd);
    });
    refreshing.set(cwd, task);
    return task;
  }

  // 确保某工作区缓存已加载（未缓存时先按版本加载）；解析值为缓存条目本身。
  function ensureCache(cwd) {
    if (cache.has(cwd)) return Promise.resolve(cache.get(cwd));
    return refreshWorkspace(cwd, "initial").then(() => {
      if (!cache.has(cwd)) cache.set(cwd, emptyEntry());
      return cache.get(cwd);
    });
  }

  // 将某工作区缓存落盘（原子写，自动创建 .dsh 目录）。
  // 必须按“会话”解析沙箱策略：workspaceRoot 才会指向该会话的工作区，
  // 否则回退到进程 cwd 的根目录，写入会被沙箱拒绝。
  async function persist(cwd, session) {
    const entry = cache.get(cwd);
    if (entry === undefined) return;
    const target = await storeTarget(cwd);
    const content = JSON.stringify(
      {
        version: 2,
        contexts: entry.contexts,
        selectedIds: entry.selectedIds,
        unlockedSessionIds: entry.unlockedSessionIds,
        sessionSnapshots: entry.sessionSnapshots,
      },
      null,
      2,
    );
    const policy = ctx.sandboxPolicy.resolve({ session });
    const outcome = await ctx.fs.writeText(target, content, undefined, undefined, policy);
    const version = outcome === undefined || outcome === null ? undefined : outcome.version;
    if (version !== undefined && version !== null) {
      workspaceVersions.set(cwd, String(version));
    } else {
      try {
        workspaceVersions.set(cwd, workspaceVersionOf(await ctx.fs.stat(target)));
      } catch (e) {
        console.error("[dynamic-agents] 记录配置版本失败", { cwd, error: String(e) });
      }
    }
    console.log("[dynamic-agents] 已持久化", { cwd, contextCount: entry.contexts.length, selectedCount: entry.selectedIds.length, status: "ok" });
  }

  // 按工作区串行化落盘
  function enqueuePersist(cwd, session) {
    const previous = writeQueues.get(cwd) || Promise.resolve();
    const next = previous.then(() => persist(cwd, session));
    writeQueues.set(cwd, next.catch(() => {})); // 队列自身吞错，避免断链
    return next;
  }

  // ---------- 全局层：加载与持久化（node fs 直管，只有 contexts） ----------
  /** node stat 的全局文件版本；文件不存在为 null。 */
  function globalVersionOf(stats) {
    return stats === undefined || stats === null ? null : `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`;
  }

  async function readGlobal(reason) {
    const file = globalStorePath();
    let stats;
    let statFailed = false;
    try {
      stats = await stat(file);
    } catch (e) {
      if (e && e.code !== "ENOENT") {
        console.error("[dynamic-agents] 检查全局配置失败", { file, reason, error: String(e) });
        statFailed = true;
      }
      stats = undefined;
    }
    if (statFailed) {
      if (globalEntry === null) globalEntry = { contexts: [] };
      return;
    }
    let parsed = null;
    let corrupt = false;
    if (stats !== undefined) {
      try {
        const text = await readFile(file, "utf8");
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          corrupt = true;
          console.error("[dynamic-agents] 全局配置文件损坏", { file, reason, error: String(e) });
        }
      } catch (e) {
        console.error("[dynamic-agents] 读取全局配置失败", { file, reason, error: String(e) });
        if (globalEntry === null) globalEntry = { contexts: [] };
        return;
      }
    }
    const version = globalVersionOf(stats);
    if (corrupt && globalEntry !== null) {
      // 保留上一份有效状态，只推进版本，避免同一个坏文件被反复重试
      globalVersion = version;
      console.error("[dynamic-agents] 全局配置损坏，保留上一份状态", { file, reason, status: "kept" });
      return;
    }
    const contexts = Array.isArray(parsed && parsed.contexts)
      ? parsed.contexts.filter(
          (c) => c && typeof c.id === "string" && typeof c.name === "string" && typeof c.content === "string",
        )
      : [];
    globalEntry = { contexts };
    globalVersion = version;
    console.log("[dynamic-agents] 全局配置已加载", { file, reason, contextCount: contexts.length, status: "ok" });
  }

  // 按文件版本决定是否重读；并发刷新合并为一次。
  function refreshGlobal(reason) {
    if (globalRefreshing !== null) return globalRefreshing;
    const task = (async () => {
      const file = globalStorePath();
      let stats;
      try {
        stats = await stat(file);
      } catch (e) {
        if (e && e.code === "ENOENT") {
          stats = undefined;
        } else {
          console.error("[dynamic-agents] 检查全局配置变化失败", { file, reason, error: String(e) });
          return;
        }
      }
      const next = globalVersionOf(stats);
      if (globalEntry !== null && globalVersion === next) return;
      await readGlobal(reason);
    })().finally(() => {
      globalRefreshing = null;
    });
    globalRefreshing = task;
    return task;
  }

  // 确保全局缓存已加载（未缓存时先按版本加载）；解析值为全局条目本身。
  function ensureGlobal() {
    if (globalEntry !== null) return Promise.resolve(globalEntry);
    return refreshGlobal("initial").then(() => globalEntry || { contexts: [] });
  }

  // 全局层原子落盘（写临时文件后 rename；只写 contexts）
  async function persistGlobal() {
    if (globalEntry === null) return;
    const file = globalStorePath();
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${Date.now()}`;
    await writeFile(tmp, JSON.stringify({ version: 1, contexts: globalEntry.contexts }, null, 2), "utf8");
    await rename(tmp, file);
    try {
      globalVersion = globalVersionOf(await stat(file));
    } catch (e) {
      console.error("[dynamic-agents] 记录全局配置版本失败", { file, error: String(e) });
    }
    console.log("[dynamic-agents] 全局已持久化", { file, contextCount: globalEntry.contexts.length, status: "ok" });
  }

  // 全局库也必须串行落盘，避免新增/删除并发时覆盖或争用临时文件。
  function enqueueGlobalPersist() {
    const next = globalWriteQueue.then(() => persistGlobal());
    globalWriteQueue = next.catch(() => {});
    return next;
  }

  // ---------- 会话/工作区解析 ----------
  function sessionOf(sessionId) {
    const session = ctx.sessions.get(sessionId);
    if (session === undefined) throw new Error("无法解析会话");
    return session;
  }

  function cwdOfSession(session) {
    const header = session && (session.header || session.meta);
    const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
    if (!cwd) throw new Error("无法解析会话的工作区路径");
    return cwd;
  }

  // ---------- 注入：系统提示 section（每次模型组装时求值） ----------
  // 全局勾选内容在前、工作区勾选内容在后；同组内按列表顺序合并。
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: "dynamic-agents:rules", // 全局唯一 section 名
        order: 50, // persona(0) 之后、工具指引(100+) 之前
        text: (context) => {
          const agent = context && context.agent;
          if (!agent || !agent.session) return "";
          const header = agent.session.header || agent.session.meta;
          const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
          if (!cwd) return "";
          const entry = cache.get(cwd);
          if (entry === undefined) {
            // 插件热重载后缓存可能尚未就绪：后台加载，下一次组装即可正常注入并固化快照
            Promise.all([ensureGlobal(), ensureCache(cwd)]).catch((e) =>
              console.error("[dynamic-agents] 提示词组装前加载配置失败", { cwd, error: String(e) }),
            );
            return "";
          }
          if (entry.sessionSnapshots === undefined) entry.sessionSnapshots = {};
          // 子代理会话跟随实时规则库，不固化快照，避免规则修改被内部会话长期冻结
          if (isSubagentSession(agent.session)) return rulesTextOf(effectiveRulesOf(entry, globalEntry));
          const sessionId = agent.session.id;
          let snapshot = entry.sessionSnapshots[sessionId];
          if (snapshot === undefined) {
            // 会话首次组装提示词：固化当时生效的规则，此后其他会话的修改不再影响本会话
            snapshot = { updatedAt: Date.now(), rules: effectiveRulesOf(entry, globalEntry) };
            entry.sessionSnapshots[sessionId] = snapshot;
            enqueuePersist(cwd, agent.session).catch((e) =>
              console.error("[dynamic-agents] 保存会话规则快照失败", {
                cwd,
                sessionId: String(sessionId),
                error: String(e),
              }),
            );
            console.log("[dynamic-agents] 已固化会话规则快照", {
              cwd,
              sessionId: String(sessionId),
              ruleCount: snapshot.rules.length,
              status: "ok",
            });
          }
          return rulesTextOf(snapshot.rules);
        },
      }),
    "dynamic-agents: prompt section",
  );

  // ---------- 预热：会话发布（含启动恢复）时按版本刷新对应工作区与全局配置 ----------
  ctx.on("session/created", (session) => {
    const header = session && (session.header || session.meta);
    const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
    if (cwd) {
      refreshWorkspace(cwd, "session")
        .then(() => ensureCache(cwd))
        .catch((e) => console.error("[dynamic-agents] 工作区配置刷新失败", { cwd, error: String(e) }));
    }
    refreshGlobal("session")
      .then(() => ensureGlobal())
      .catch((e) => console.error("[dynamic-agents] 全局配置刷新失败", { error: String(e) }));
  });

  // ---------- 竞态加固：会话首个回合前刷新配置并等待缓存就绪 ----------
  // agent/created 为 serial 事件：监听完成后才放行该 agent 的首个回合。
  ctx.on("agent/created", async ({ agent }) => {
    await refreshGlobal("agent");
    await ensureGlobal();
    if (!agent || !agent.session) return;
    const header = agent.session.header || agent.session.meta;
    const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
    if (cwd) {
      await refreshWorkspace(cwd, "agent");
      await ensureCache(cwd);
    }
  });

  // ---------- 请求处理 ----------
  const requireSession = (body) => {
    if (!body || typeof body.sessionId !== "string") throw new Error("缺少 sessionId");
    return sessionOf(body.sessionId);
  };

  // 读取前按文件版本刷新：外部修改的配置无需重启即可生效。
  // 刷新失败只记录日志并沿用现有缓存。
  async function loadLiveState(session) {
    const cwd = cwdOfSession(session);
    await refreshGlobal("request");
    await refreshWorkspace(cwd, "request");
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    return { cwd, entry, global };
  }

  // 已解锁会话的规则修改同步刷新自己的会话快照，使下一次请求与面板保持一致。
  function syncUnlockedSnapshot(entry, global, session) {
    if (!entry.unlockedSessionIds.includes(session.id)) return false;
    entry.sessionSnapshots[session.id] = { updatedAt: Date.now(), rules: effectiveRulesOf(entry, global) };
    return true;
  }

  // 查询某会话工作区的上下文状态（含全局层）。
  // 锁定会话返回开始时的规则快照；未锁定/新会话返回实时规则库。
  async function handleGetState(body) {
    const session = requireSession(body);
    const { entry, global } = await loadLiveState(session);
    const snapshot = entry.sessionSnapshots[session.id];
    if (snapshot !== undefined && !entry.unlockedSessionIds.includes(session.id)) {
      return snapshotStateOf(snapshot);
    }
    pruneSelection(entry, global);
    return {
      global: globalStateOf(global, entry),
      workspace: workspaceStateOf(entry, global, session.id),
    };
  }

  // 更新工作区勾选中的本地部分（保留现有全局勾选）
  async function handleSetSelection(body) {
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    pruneSelection(entry, global);
    const { globalIds } = splitSelection(entry, global);
    const localIds = Array.isArray(body.selectedIds)
      ? body.selectedIds.filter((id) => typeof id === "string" && !id.startsWith(GLOBAL_ID_PREFIX) && entry.contexts.some((c) => c.id === id))
      : [];
    // 勾选集合按规则列表顺序保存，保持文件内顺序稳定
    const selectedLocal = new Set(localIds);
    entry.selectedIds = entry.contexts
      .filter((c) => selectedLocal.has(c.id))
      .map((c) => c.id)
      .concat(globalIds);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 更新工作区勾选中的全局部分（g- 前缀；保留现有本地勾选）
  async function handleSetGlobalSelection(body) {
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    pruneSelection(entry, global);
    const { localIds } = splitSelection(entry, global);
    const globalIds = Array.isArray(body.selectedIds)
      ? body.selectedIds.filter((id) => typeof id === "string" && id.startsWith(GLOBAL_ID_PREFIX) && global.contexts.some((c) => c.id === id))
      : [];
    // 全局勾选按全局库列表顺序保存
    const selectedGlobal = new Set(globalIds);
    const orderedGlobalIds = global.contexts.filter((c) => selectedGlobal.has(c.id)).map((c) => c.id);
    entry.selectedIds = localIds.concat(orderedGlobalIds);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 解锁/重新锁定当前会话（解锁状态按会话持久化在工作区文件）
  async function handleSetUnlocked(body) {
    const session = requireSession(body);
    const unlocked = body.unlocked === true;
    const { cwd, entry, global } = await loadLiveState(session);
    entry.unlockedSessionIds = entry.unlockedSessionIds.filter((id) => id !== session.id);
    if (unlocked) {
      entry.unlockedSessionIds.push(session.id);
    } else {
      // 重新锁定：把当前实时规则固化为新的会话快照（与解锁期间的修改一致）
      entry.sessionSnapshots[session.id] = { updatedAt: Date.now(), rules: effectiveRulesOf(entry, global) };
    }
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 工作区新增上下文（默认勾选，便于“添加即用”）
  async function handleAddContext(body) {
    const session = requireSession(body);
    const { name, content } = readContextInput(body);
    const { cwd, entry, global } = await loadLiveState(session);
    const id = newLocalId();
    entry.contexts.push({ id, name, content });
    if (!entry.selectedIds.includes(id)) entry.selectedIds.push(id);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库新增上下文（g- 前缀 id；自动勾选到当前会话工作区）
  async function handleAddGlobalContext(body) {
    const session = requireSession(body);
    const { name, content } = readContextInput(body);
    const { cwd, entry, global } = await loadLiveState(session);
    const id = newGlobalId();
    global.contexts.push({ id, name, content });
    await enqueueGlobalPersist();
    // 自动勾选到当前工作区
    pruneSelection(entry, global);
    if (!entry.selectedIds.includes(id)) entry.selectedIds.push(id);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 工作区删除上下文（同时从勾选集合移除）
  async function handleDeleteContext(body) {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    entry.contexts = entry.contexts.filter((c) => c.id !== id);
    entry.selectedIds = entry.selectedIds.filter((x) => x !== id);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库删除（各工作区残留 g- 勾选由后续 pruneSelection 自动失效）
  async function handleDeleteGlobalContext(body) {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    global.contexts = global.contexts.filter((c) => c.id !== id);
    await enqueueGlobalPersist();
    pruneSelection(entry, global); // 清理当前工作区的残留勾选
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 工作区规则改名/改内容（保留 id 与其它字段）
  async function handleUpdateContext(body) {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const { name, content } = readContextInput(body);
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    const item = entry.contexts.find((c) => c.id === id);
    if (item === undefined) throw new Error("上下文不存在或已被删除");
    item.name = name;
    item.content = content;
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库规则改名/改内容（保留 id 与其它字段）
  async function handleUpdateGlobalContext(body) {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const { name, content } = readContextInput(body);
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    const item = global.contexts.find((c) => c.id === id);
    if (item === undefined) throw new Error("上下文不存在或已被删除");
    item.name = name;
    item.content = content;
    await enqueueGlobalPersist();
    if (syncUnlockedSnapshot(entry, global, session)) await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 工作区规则拖拽排序（orderedIds 为完整顺序；未知/重复忽略，缺项追加）
  async function handleReorderContexts(body) {
    if (!Array.isArray(body.orderedIds)) throw new Error("缺少排序结果");
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    pruneSelection(entry, global);
    entry.contexts = assignOrder(entry.contexts, body.orderedIds);
    // 选中集合中的本地部分跟随列表顺序；全局勾选仍追加在后
    const selected = new Set(entry.selectedIds);
    const globalIds = entry.selectedIds.filter((id) => id.startsWith(GLOBAL_ID_PREFIX));
    entry.selectedIds = entry.contexts
      .filter((c) => selected.has(c.id))
      .map((c) => c.id)
      .concat(globalIds);
    syncUnlockedSnapshot(entry, global, session);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库拖拽排序（全局顺序由所有工作区共享）
  async function handleReorderGlobalContexts(body) {
    if (!Array.isArray(body.orderedIds)) throw new Error("缺少排序结果");
    const session = requireSession(body);
    const { cwd, entry, global } = await loadLiveState(session);
    global.contexts = assignOrder(global.contexts, body.orderedIds);
    await enqueueGlobalPersist();
    if (syncUnlockedSnapshot(entry, global, session)) await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  const handlers = {
    getState: handleGetState,
    setSelection: handleSetSelection,
    setGlobalSelection: handleSetGlobalSelection,
    setUnlocked: handleSetUnlocked,
    addContext: handleAddContext,
    addGlobalContext: handleAddGlobalContext,
    updateContext: handleUpdateContext,
    updateGlobalContext: handleUpdateGlobalContext,
    reorderContexts: handleReorderContexts,
    reorderGlobalContexts: handleReorderGlobalContexts,
    deleteContext: handleDeleteContext,
    deleteGlobalContext: handleDeleteGlobalContext,
  };

  // ---------- JSON route：浏览器半区调用 ----------
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: API_PATH,
        handler: async (req, res) => {
          if (req.method !== "POST") {
            sendJson(res, 405, { ok: false, error: `method ${req.method ?? "?"} not allowed` });
            return;
          }
          // 收集请求体（JSON），超限按 400 拒绝
          let raw = "";
          try {
            for await (const chunk of req) {
              raw += chunk;
              if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
                sendJson(res, 400, { ok: false, error: "request body too large" });
                return;
              }
            }
          } catch (e) {
            sendJson(res, 400, { ok: false, error: `cannot read request body: ${messageOf(e)}` });
            return;
          }
          let body = null;
          try {
            body = JSON.parse(raw === "" ? "{}" : raw);
          } catch (e) {
            sendJson(res, 400, { ok: false, error: `cannot parse request body: ${messageOf(e)}` });
            return;
          }
          const method = typeof body.method === "string" ? body.method : "";
          const handler = handlers[method];
          if (handler === undefined) {
            sendJson(res, 400, { ok: false, error: `unknown method: ${method || "(empty)"}` });
            return;
          }
          try {
            const data = await handler(body);
            sendJson(res, 200, { ok: true, data });
          } catch (e) {
            console.error("[dynamic-agents] 请求处理失败", { method, error: messageOf(e) });
            sendJson(res, 200, { ok: false, error: messageOf(e) });
          }
        },
      }),
    "dynamic-agents: api route",
  );
}
