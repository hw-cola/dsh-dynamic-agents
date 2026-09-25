// @dsh/dynamic-agents — 动态AGENTS.md。
//
// 数据分两层：
//   - 全局：~/.dsh/dynamic-agents.json（$DSH_HOME 优先）——所有工作区共享的
//     上下文**库**（contexts 定义），**不含 selectedIds**；由本插件用 node fs
//     直管（ctx.fs 受工作区沙箱策略限制，写不到用户目录）。
//   - 工作区：<工作区>/.dsh/dynamic-agents.json —— contexts + selectedIds +
//     unlockedSessionIds；**勾选状态（含全局规则的勾选）统一由工作区文件的
//     selectedIds 控制**，全局规则以 `g-` 前缀 id 混存其中。
//
// 注入：全局勾选内容在前、工作区勾选内容在后合并渲染（都来自工作区 selectedIds）。
//
// Route 契约（POST /dsh-dynamic-agents/api，body { method, sessionId, ... }）：
//   getState             → { global: {contexts, selectedIds}, workspace: {contexts, selectedIds, unlocked} }
//   setSelection         → 更新工作区勾选中的本地部分
//   setGlobalSelection   → 更新工作区勾选中的全局部分（g- 前缀）
//   setUnlocked          → 工作区会话解锁状态
//   addContext           → 工作区新增（默认勾选）
//   addGlobalContext     → 全局库新增（g- 前缀 id，自动勾选到当前工作区）
//   deleteContext        → 工作区删除
//   deleteGlobalContext  → 全局库删除（各工作区残留勾选由校验自动失效）
//   响应：200 { ok: true, data } 或 { ok: false, error }；405/400/500 同构错误。

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

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

/** 空条目。 */
function emptyEntry() {
  return { contexts: [], selectedIds: [], unlockedSessionIds: [] };
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
  // 每工作区的串行化写入队列（防止读-改-写交错）
  const writeQueues = new Map();
  // 每工作区的加载中 Promise（并发去重）
  const loading = new Map();

  // ---------- 全局层：单例缓存（node fs 直管，只有 contexts） ----------
  let globalEntry = null; // null = 未加载
  let globalLoading = null;
  let globalWriteQueue = Promise.resolve();

  // 配置文件路径：<工作区>/.dsh/dynamic-agents.json
  const storeTarget = (cwd) => ctx.fs.resolve(".dsh/dynamic-agents.json", { cwd });

  // 从磁盘加载一个工作区的配置到缓存（文件缺失/损坏时按空状态处理）。
  // 本地 id 在此校验；g- 前缀 id 先宽松保留（全局库存在性在 pruneSelection 统一处理）。
  async function loadIntoCache(cwd) {
    try {
      const target = await storeTarget(cwd);
      const info = await ctx.fs.stat(target);
      if (info === undefined) {
        cache.set(cwd, emptyEntry());
        return;
      }
      const text = await ctx.fs.readText(target);
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.error("[dynamic-agents] 配置文件损坏，已按空状态重置", { cwd, error: String(e) });
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
      cache.set(cwd, { contexts, selectedIds, unlockedSessionIds });
      console.log("[dynamic-agents] 缓存已加载", { cwd, contextCount: contexts.length, selectedCount: selectedIds.length, status: "ok" });
    } catch (e) {
      console.error("[dynamic-agents] 读取配置失败，已按空状态处理", { cwd, error: String(e) });
      cache.set(cwd, emptyEntry());
    }
  }

  // 确保某工作区缓存已加载（并发去重）；解析值为缓存条目本身。
  // 注意：loadIntoCache 只负责写入 cache，其自身解析值为 undefined，
  // 因此这里必须取 cache.get(cwd) 作为解析值。
  function ensureCache(cwd) {
    if (cache.has(cwd)) return Promise.resolve(cache.get(cwd));
    let pending = loading.get(cwd);
    if (pending === undefined) {
      pending = loadIntoCache(cwd).then(() => cache.get(cwd)).finally(() => loading.delete(cwd));
      loading.set(cwd, pending);
    }
    return pending;
  }

  // 将某工作区缓存落盘（原子写，自动创建 .dsh 目录）。
  // 必须按“会话”解析沙箱策略：workspaceRoot 才会指向该会话的工作区，
  // 否则回退到进程 cwd 的根目录，写入会被沙箱拒绝。
  async function persist(cwd, session) {
    const entry = cache.get(cwd);
    if (entry === undefined) return;
    const target = await storeTarget(cwd);
    const content = JSON.stringify(
      { version: 1, contexts: entry.contexts, selectedIds: entry.selectedIds, unlockedSessionIds: entry.unlockedSessionIds },
      null,
      2,
    );
    const policy = ctx.sandboxPolicy.resolve({ session });
    await ctx.fs.writeText(target, content, undefined, undefined, policy);
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
  async function loadGlobal() {
    const file = globalStorePath();
    let parsed = null;
    try {
      const text = await readFile(file, "utf8");
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.error("[dynamic-agents] 全局配置文件损坏，已按空状态重置", { file, error: String(e) });
      }
    } catch (e) {
      if (e && e.code !== "ENOENT") {
        console.error("[dynamic-agents] 读取全局配置失败，已按空状态处理", { file, error: String(e) });
      }
    }
    const contexts = Array.isArray(parsed && parsed.contexts)
      ? parsed.contexts.filter(
          (c) => c && typeof c.id === "string" && typeof c.name === "string" && typeof c.content === "string",
        )
      : [];
    globalEntry = { contexts };
    console.log("[dynamic-agents] 全局缓存已加载", { file, contextCount: contexts.length, status: "ok" });
  }

  // 确保全局缓存已加载（并发去重）；解析值为全局条目本身。
  // 注意：loadGlobal 只负责写入 globalEntry，其自身解析值为 undefined，
  // 因此这里必须取 globalEntry 作为解析值。
  function ensureGlobal() {
    if (globalEntry !== null) return Promise.resolve(globalEntry);
    if (globalLoading === null) {
      globalLoading = loadGlobal().then(() => globalEntry).finally(() => {
        globalLoading = null;
      });
    }
    return globalLoading;
  }

  // 全局层原子落盘（写临时文件后 rename；只写 contexts）
  async function persistGlobal() {
    if (globalEntry === null) return;
    const file = globalStorePath();
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${Date.now()}`;
    await writeFile(tmp, JSON.stringify({ version: 1, contexts: globalEntry.contexts }, null, 2), "utf8");
    await rename(tmp, file);
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
  // 全局勾选内容在前、工作区勾选内容在后（都来自工作区 selectedIds）。
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
          if (entry === undefined || entry.selectedIds.length === 0) return "";
          const parts = [];
          const g = globalEntry;
          // 全局部分（g- 前缀，存在于全局库）
          for (const id of entry.selectedIds) {
            if (!id.startsWith(GLOBAL_ID_PREFIX) || g === null) continue;
            const item = g.contexts.find((c) => c.id === id);
            if (item && item.content.trim()) parts.push(`## ${item.name}\n\n${item.content}`);
          }
          // 本地部分
          for (const id of entry.selectedIds) {
            if (id.startsWith(GLOBAL_ID_PREFIX)) continue;
            const item = entry.contexts.find((c) => c.id === id);
            if (item && item.content.trim()) parts.push(`## ${item.name}\n\n${item.content}`);
          }
          return parts.join("\n\n");
        },
      }),
    "dynamic-agents: prompt section",
  );

  // ---------- 预热：会话发布（含启动恢复）时加载对应工作区与全局配置 ----------
  ctx.on("session/created", (session) => {
    const header = session && (session.header || session.meta);
    const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
    if (cwd) {
      ensureCache(cwd).catch((e) => console.error("[dynamic-agents] 预热失败", { cwd, error: String(e) }));
    }
    ensureGlobal().catch((e) => console.error("[dynamic-agents] 全局预热失败", { error: String(e) }));
  });

  // ---------- 竞态加固：会话首个回合前等待缓存就绪 ----------
  // agent/created 为 serial 事件：监听完成后才放行该 agent 的首个回合。
  ctx.on("agent/created", async ({ agent }) => {
    await ensureGlobal();
    if (!agent || !agent.session) return;
    const header = agent.session.header || agent.session.meta;
    const cwd = header && typeof header.cwd === "string" ? header.cwd : "";
    if (cwd) {
      await ensureCache(cwd);
    }
  });

  // ---------- 请求处理 ----------
  const requireSession = (body) => {
    if (!body || typeof body.sessionId !== "string") throw new Error("缺少 sessionId");
    return sessionOf(body.sessionId);
  };

  // 查询某会话工作区的上下文状态（含全局层）
  async function handleGetState(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    pruneSelection(entry, global);
    return {
      global: globalStateOf(global, entry),
      workspace: workspaceStateOf(entry, global, session.id),
    };
  }

  // 更新工作区勾选中的本地部分（保留现有全局勾选）
  async function handleSetSelection(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    pruneSelection(entry, global);
    const { globalIds } = splitSelection(entry, global);
    const localIds = Array.isArray(body.selectedIds)
      ? body.selectedIds.filter((id) => typeof id === "string" && !id.startsWith(GLOBAL_ID_PREFIX) && entry.contexts.some((c) => c.id === id))
      : [];
    entry.selectedIds = localIds.concat(globalIds);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 更新工作区勾选中的全局部分（g- 前缀；保留现有本地勾选）
  async function handleSetGlobalSelection(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    pruneSelection(entry, global);
    const { localIds } = splitSelection(entry, global);
    const globalIds = Array.isArray(body.selectedIds)
      ? body.selectedIds.filter((id) => typeof id === "string" && id.startsWith(GLOBAL_ID_PREFIX) && global.contexts.some((c) => c.id === id))
      : [];
    entry.selectedIds = localIds.concat(globalIds);
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 解锁/重新锁定当前会话（解锁状态按会话持久化在工作区文件）
  async function handleSetUnlocked(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const unlocked = body.unlocked === true;
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    entry.unlockedSessionIds = entry.unlockedSessionIds.filter((id) => id !== session.id);
    if (unlocked) entry.unlockedSessionIds.push(session.id);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 工作区新增上下文（默认勾选，便于“添加即用”）
  async function handleAddContext(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const { name, content } = readContextInput(body);

    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    const id = newLocalId();
    entry.contexts.push({ id, name, content });
    if (!entry.selectedIds.includes(id)) entry.selectedIds.push(id);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库新增上下文（g- 前缀 id；自动勾选到当前会话工作区）
  async function handleAddGlobalContext(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const { name, content } = readContextInput(body);

    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    const id = newGlobalId();
    global.contexts.push({ id, name, content });
    await enqueueGlobalPersist();
    // 自动勾选到当前工作区
    pruneSelection(entry, global);
    if (!entry.selectedIds.includes(id)) entry.selectedIds.push(id);
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  // 工作区删除上下文（同时从勾选集合移除）
  async function handleDeleteContext(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    entry.contexts = entry.contexts.filter((c) => c.id !== id);
    entry.selectedIds = entry.selectedIds.filter((x) => x !== id);
    await enqueuePersist(cwd, session);
    return workspaceStateOf(entry, global, session.id);
  }

  // 全局库删除（各工作区残留 g- 勾选由后续 pruneSelection 自动失效）
  async function handleDeleteGlobalContext(body) {
    const session = requireSession(body);
    const cwd = cwdOfSession(session);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("缺少上下文 id");
    const [entry, global] = await Promise.all([ensureCache(cwd), ensureGlobal()]);
    global.contexts = global.contexts.filter((c) => c.id !== id);
    await enqueueGlobalPersist();
    pruneSelection(entry, global); // 清理当前工作区的残留勾选
    await enqueuePersist(cwd, session);
    return globalStateOf(global, entry);
  }

  const handlers = {
    getState: handleGetState,
    setSelection: handleSetSelection,
    setGlobalSelection: handleSetGlobalSelection,
    setUnlocked: handleSetUnlocked,
    addContext: handleAddContext,
    addGlobalContext: handleAddGlobalContext,
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
