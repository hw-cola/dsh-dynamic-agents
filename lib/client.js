// @dsh/dynamic-agents — 动态AGENTS.md。
//
// 下拉面板分「全局」与「当前工作区」两组，各自可勾选（支持全选/取消全选）、
// 新增、删除、查看，锁定时两组均禁编辑；通信为同源 fetch
// （POST /dsh-dynamic-agents/api）。
//
// 视觉与交互对齐 DSH 官方风格：面板卡片复用官方 Menu 卡片的设计令牌
// （specific-menu 背景、prominent 阴影、16px 圆角、11px 分组标题），
// 定位/关闭复用官方 primitives 的 useAnchoredPosition /
// useDismissOnOutsidePointer，按钮与输入框直接使用官方 Button / Input
// 组件；面板 portal 到 document.body（官方菜单同款 z-index 1100，
// 可叠于模态弹窗之上）。

window.__ModuleLoader__.load({
  id: "@dsh/dynamic-agents",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var ReactDOM = require("react-dom");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Host JSON route（与 Host 半区 API_PATH 一致）。 */
    const API_PATH = "/dsh-dynamic-agents/api";

    /** 调用 Host JSON route，返回 data；失败抛错。 */
    async function apiCall(method, payload) {
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ method }, payload)),
        cache: "no-store",
      });
      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`请求失败(${response.status})`);
      }
      if (!response.ok || data.ok !== true) {
        throw new Error(typeof data.error === "string" ? data.error : `请求失败(${response.status})`);
      }
      return data.data;
    }

    /** 包内样式标签（幂等注入）。 */
    const STYLE_TAG = "@dsh/dynamic-agents/styles";
    const STYLE = [
      // ---------- Dock 行与触发按钮 ----------
      ".ctxinj-root{position:relative;display:flex;align-items:center;box-sizing:border-box;width:min(calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px)),100%);max-width:var(--dsh-composer-card-max-width,780px);margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px);flex:none}",
      // Hero 控件行已有自身缩进；未开始会话减少重复的左侧内缩。
      ".ctxinj-root-blank{padding-left:2px}",
      ".ctxinj-trigger{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;max-width:min(100%,240px);min-height:28px;padding:0 8px;border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;font-size:13px;font-weight:500;line-height:20px;outline:none;overflow:hidden;white-space:nowrap}",
      // 会话已开始（有聊天正文）时，触发按钮给不透明背景（亮色下即白色），避免透明底与聊天文字视觉重叠。
      ".ctxinj-root-start .ctxinj-trigger{background:var(--dsw-alias-bg-layer-1,#fff)}",
      // 悬停/展开的灰色用 background-image 渐变叠加在底色之上（而非替换背景色）：
      // 已开始=白底+半透明灰→不透明浅灰，聊天文字不透出；空白态=透明底+半透明灰→保持原半透明观感。
      ".ctxinj-trigger:hover,.ctxinj-trigger[aria-expanded=true]{background-image:linear-gradient(var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12)),var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12)))}",
      ".ctxinj-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3,rgba(128,128,128,.35))}",
      ".ctxinj-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      // 徽标行高取 15 而非 16：11px 字体的数字墨迹在 15px 内容区内中心偏低
      // （基线 12 - 墨迹半高 4 = 8.5），16px 徽标配 15px 行盒恰好让墨迹垂直居中。
      ".ctxinj-badge{display:inline-block;box-sizing:border-box;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-label-caption,#8a8f99);color:var(--dsw-alias-bg-layer-1,#fff);font-size:11px;font-weight:500;line-height:15px;text-align:center;white-space:nowrap}",
      ".ctxinj-chevron{display:inline-flex;flex:none;color:var(--dsw-alias-label-caption,#8a8f99);transition:transform .12s}",
      ".ctxinj-chevron-open{transform:rotate(180deg)}",
      // ---------- 面板卡片（官方 Menu 卡片设计令牌） ----------
      // portal 到 document.body 的 fixed 卡片；z-index 1100 与官方 portal 菜单一致，
      // 保证能叠在模态弹窗（z 1000）之上。
      ".ctxinj-panel{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);padding:3px;overflow:hidden;border-radius:16px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#fff));backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);color:var(--dsw-alias-label-primary,#1f2329)}",
      ".ctxinj-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 4px}",
      ".ctxinj-head-title{font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329)}",
      ".ctxinj-head-count{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,#8a8f99)}",
      // ---------- 锁定行 ----------
      ".ctxinj-lock-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));font-size:12px;line-height:18px}",
      ".ctxinj-lock-notice{flex:1;min-width:0;color:var(--dsw-alias-label-secondary,#8a8f99);word-break:break-all}",
      ".ctxinj-lock-row-confirm{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,48,38,.06))}",
      // ---------- 滚动区与分组 ----------
      ".ctxinj-scroll{overflow-y:auto;flex:0 1 auto;min-height:0}",
      ".ctxinj-group{padding:2px 0 4px}",
      ".ctxinj-group-head{display:flex;align-items:center;gap:4px;padding:6px 8px 2px}",
      ".ctxinj-group-title{flex:1;min-width:0;font-size:11px;line-height:15px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a8f99)}",
      // 分组头/行内的小型文字按钮（官方 tokens：次级文字 + hover 灰底）。
      ".ctxinj-mini-btn{border:none;background:none;color:var(--dsw-alias-label-secondary,#8a8f99);font-size:12px;line-height:18px;padding:1px 6px;border-radius:6px;cursor:pointer;white-space:nowrap}",
      ".ctxinj-mini-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,#1f2329)}",
      ".ctxinj-mini-btn:disabled{opacity:.4;cursor:default}",
      // 行内危险动作：错误色文字 + 危险 hover 底；确认态为错误色实底胶囊。
      ".ctxinj-mini-danger{color:var(--dsw-alias-state-error-primary,#d93026)}",
      ".ctxinj-mini-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,48,38,.1));color:var(--dsw-alias-state-error-primary,#d93026)}",
      ".ctxinj-mini-solid-danger{background:var(--dsw-alias-state-error-primary,#d93026);color:var(--dsw-alias-label-primary-foreground,#fff)}",
      ".ctxinj-mini-solid-danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary,#d93026);color:var(--dsw-alias-label-primary-foreground,#fff)}",
      ".ctxinj-group-empty{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:2px 8px 6px}",
      // ---------- 规则行 ----------
      ".ctxinj-row{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer}",
      ".ctxinj-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-row-locked{cursor:default}",
      ".ctxinj-row-locked:hover{background:transparent}",
      // 与官方 Checkbox 一致的原生勾选框视觉（16px、品牌色 accent、焦点环）。
      ".ctxinj-check{flex:none;width:16px;height:16px;margin:2px 0 0;accent-color:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer}",
      ".ctxinj-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:2px}",
      ".ctxinj-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".ctxinj-row-name{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,#1f2329);word-break:break-all}",
      ".ctxinj-row-preview{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}",
      ".ctxinj-expanded{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow-y:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));border-radius:8px;padding:6px 8px;margin-top:2px}",
      ".ctxinj-row-actions{display:flex;align-items:flex-start;gap:2px;flex:none}",
      // 删除按钮仅在行悬停时出现（保持可占位避免布局跳动）。
      ".ctxinj-del-btn{visibility:hidden}",
      ".ctxinj-row:hover .ctxinj-del-btn{visibility:visible}",
      ".ctxinj-row:hover .ctxinj-del-btn:disabled{visibility:hidden}",
      // ---------- 状态行 ----------
      ".ctxinj-status{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:8px}",
      ".ctxinj-error{color:var(--dsw-alias-state-error-primary,#d93026);font-size:12px;line-height:18px;padding:4px 8px;word-break:break-all}",
      // ---------- 新增表单（面板底部固定区） ----------
      ".ctxinj-form{display:flex;flex-direction:column;gap:8px;padding:8px;margin-top:2px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}",
      // 与官方 Input 一致的文本域视觉（.5px l4 边框、8px 圆角、layer-1 底、品牌色 focus）。
      ".ctxinj-textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:88px;padding:5px 8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-family:inherit;font-size:14px;line-height:22px;outline:none}",
      ".ctxinj-textarea:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
      ".ctxinj-textarea::placeholder{color:var(--dsw-alias-label-dimmed,#b3b8c2)}",
      ".ctxinj-input-wrap{display:flex;width:100%}",
      ".ctxinj-form-actions{display:flex;justify-content:flex-end;gap:8px}",
      // 官方 Button 之上的危险色变体（重复类名抬高优先级，覆盖 primary 底色）。
      ".ctxinj-btn-danger.ctxinj-btn-danger{background:var(--dsw-alias-state-error-primary,#d93026);color:var(--dsw-alias-label-primary-foreground,#fff)}",
      ".ctxinj-btn-danger.ctxinj-btn-danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary,#d93026);color:var(--dsw-alias-label-primary-foreground,#fff)}",
      // 手机端保留完整选择器文案、数量和下拉箭头，避免仅凭图标难以识别。
      // 用 CSS media query 而非 JS 检测视口：自动响应 resize/旋转，零脚本开销。
      "@media (max-width: 768px) {" +
        ".ctxinj-trigger > .ctxinj-trigger-label{display:inline}" +
        ".ctxinj-trigger .ctxinj-chevron{display:inline-flex}" +
        ".ctxinj-trigger{width:auto;min-width:0;max-width:min(100%,240px);padding:0 8px;justify-content:flex-start}" +
      "}",
    ].join("\n");

    /** 幂等注入包内样式。 */
    function injectStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector(`style[data-plugin-css="${STYLE_TAG}"]`) !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "@dsh/dynamic-agents";
      tag.dataset.pluginCss = STYLE_TAG;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    // 上下文注入图标（官方 IconContextInjection：文档+向下注入箭头，语义契合）。
    const icon = React.createElement(primitives.IconContextInjectionOutlineMedium, { size: 14 });
    const chevronGlyph = React.createElement(primitives.IconChevronDownOutlineMedium, { size: 12 });

    /** 面板底部固定区（新增表单）的取消按钮文案键。 */
    const SCOPE_TITLES = { global: "全局", workspace: "当前工作区" };

    // 主组件：触发按钮 + 下拉多选面板（全局/工作区两组）
    // props.started：会话是否已开始（日志非空），由槽位层根据 SessionSnapshot.blank 派生
    function ContextInjectView(props) {
      const { sessionId, started } = props;
      const [open, setOpen] = React.useState(false);
      // data = { global: {contexts, selectedIds}, workspace: {contexts, selectedIds, unlocked} }
      const [data, setData] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState("");
      const [addingScope, setAddingScope] = React.useState(null); // null | "global" | "workspace"
      const [name, setName] = React.useState("");
      const [content, setContent] = React.useState("");
      const [saving, setSaving] = React.useState(false);
      const [confirmKey, setConfirmKey] = React.useState(null); // `${scope}:${id}`
      const [busyKey, setBusyKey] = React.useState(null);
      const [confirmUnlock, setConfirmUnlock] = React.useState(false);
      const [unlockSaving, setUnlockSaving] = React.useState(false);
      const [expandedKey, setExpandedKey] = React.useState(null);
      // 触发按钮引用：锚定点；面板 portal 节点引用：官方定位/关闭 hooks 使用。
      const triggerRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const rootRef = React.useRef(null);
      // 合并同一会话的重复刷新，并令旧会话响应失效。
      const refreshRef = React.useRef({ nextId: 0, sessionId: null, promise: null });

      // 锁定判定：会话已开始且未显式解锁（unlocked 按会话持久化在工作区存储）
      const locked = started && !(data && data.workspace.unlocked);

      // 关闭弹窗并复位全部临时交互状态
      function closePopup() {
        setOpen(false);
        setConfirmKey(null);
        setConfirmUnlock(false);
        setExpandedKey(null);
      }

      // 点击外部关闭（官方 hook）：portal 面板视为面板内部，不误关；
      // 编辑状态（新增表单打开）下点击外部不关闭，保护草稿。
      primitives.useDismissOnOutsidePointer(
        rootRef,
        open,
        (next) => {
          if (next !== false) return;
          if (addingScope !== null) return;
          closePopup();
        },
        panelRef,
      );

      // Escape 关闭面板（官方菜单同款键盘行为）
      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          closePopup();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [open]);

      // 面板打开时挂载 portal 节点；定位交给官方 useAnchoredPosition
      // （锚定触发按钮、向上展开、4px 间距、12px 视口安全边距，自动跟随滚动/缩放）。
      const panelPosition = primitives.useAnchoredPosition({
        open,
        anchorRef: triggerRef,
        panelRef,
        side: "top",
        align: "start",
        gap: 4,
        margin: 12,
      });

      // 从 Host 拉取当前会话工作区的上下文状态（含全局层）。
      function refresh() {
        const requestSessionId = sessionId;
        const pending = refreshRef.current;
        if (pending.promise && pending.sessionId === requestSessionId) return pending.promise;

        const requestId = pending.nextId + 1;
        pending.nextId = requestId;
        pending.sessionId = requestSessionId;
        setLoading(true);
        setError("");

        const promise = apiCall("getState", { sessionId: requestSessionId })
          .then((state) => {
            if (refreshRef.current.nextId === requestId && sessionId === requestSessionId) {
              setData(state);
            }
          })
          .catch((e) => {
            if (refreshRef.current.nextId === requestId && sessionId === requestSessionId) {
              setError(String(e && e.message ? e.message : e));
            }
          })
          .finally(() => {
            if (refreshRef.current.nextId === requestId && sessionId === requestSessionId) {
              setLoading(false);
              refreshRef.current.promise = null;
            }
          });
        pending.promise = promise;
        return promise;
      }

      // 勾选集合变更（乐观更新，失败回滚）；锁定时不允许。
      // selectedIds 为该组完整目标集合：单行勾选与全选/取消全选共用此路径，
      // Host 侧 setSelection/setGlobalSelection 各自保留另一组的勾选。
      async function applySelection(scope, selectedIds) {
        if (!data || locked) return;
        const group = data[scope];
        if (!group) return;
        const prev = data;
        const next = Object.assign({}, data, {
          [scope]: Object.assign({}, group, { selectedIds }),
        });
        setData(next);
        setError("");
        try {
          const method = scope === "global" ? "setGlobalSelection" : "setSelection";
          const state = await apiCall(method, { sessionId, selectedIds });
          setData((current) => current ? Object.assign({}, current, { [scope]: state }) : current);
        } catch (e) {
          setData(prev);
          setError(String(e && e.message ? e.message : e));
        }
      }

      // 单行勾选/取消勾选
      function toggle(scope, id, checked) {
        if (!data) return;
        const group = data[scope];
        if (!group) return;
        const selectedIds = checked
          ? (group.selectedIds.includes(id) ? group.selectedIds : group.selectedIds.concat(id))
          : group.selectedIds.filter((x) => x !== id);
        return applySelection(scope, selectedIds);
      }

      // 全选/取消全选：全部勾选时一键清空，否则勾选该组全部规则
      function toggleSelectAll(scope) {
        if (!data) return;
        const group = data[scope];
        if (!group || group.contexts.length === 0) return;
        const allSelected = group.contexts.every((c) => group.selectedIds.includes(c.id));
        return applySelection(scope, allSelected ? [] : group.contexts.map((c) => c.id));
      }

      // 解锁/重新锁定（解锁后持久化到工作区存储）
      async function setUnlocked(unlocked) {
        setUnlockSaving(true);
        setError("");
        try {
          const state = await apiCall("setUnlocked", { sessionId, unlocked });
          setData((current) => current ? Object.assign({}, current, { workspace: state }) : current);
          setConfirmUnlock(false);
          if (!unlocked) setAddingScope(null); // 重新锁定时收起未保存的新增表单
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setUnlockSaving(false);
        }
      }

      // 新增上下文（按所在组调用对应 API）
      async function submitAdd() {
        if (addingScope !== "global" && addingScope !== "workspace") return;
        if (!name.trim() || !content.trim()) {
          setError("名称与内容均不能为空");
          return;
        }
        setSaving(true);
        setError("");
        try {
          const method = addingScope === "global" ? "addGlobalContext" : "addContext";
          const state = await apiCall(method, { sessionId, name: name.trim(), content });
          setData((current) => current ? Object.assign({}, current, { [addingScope]: state }) : current);
          setAddingScope(null);
          setName("");
          setContent("");
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setSaving(false);
        }
      }

      // 删除上下文（按所在组调用对应 API）
      async function remove(scope, id) {
        const key = `${scope}:${id}`;
        setBusyKey(key);
        setError("");
        try {
          const method = scope === "global" ? "deleteGlobalContext" : "deleteContext";
          const state = await apiCall(method, { sessionId, id });
          setData((current) => current ? Object.assign({}, current, { [scope]: state }) : current);
          setConfirmKey(null);
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setBusyKey(null);
        }
      }

      // 会话变化（含首次挂载）时拉取数据：让触发按钮在未打开时也能显示已选数量
      React.useEffect(() => {
        refresh();
      }, [sessionId]);

      // 打开面板时再次拉取最新数据
      React.useEffect(() => {
        if (open) refresh();
      }, [open]);

      // 切换会话时重置面板状态
      React.useEffect(() => {
        setOpen(false);
        setData(null);
        setError("");
        setAddingScope(null);
        setConfirmKey(null);
        setConfirmUnlock(false);
        setExpandedKey(null);
        setName("");
        setContent("");
      }, [sessionId]);

      const count = data ? data.global.selectedIds.length + data.workspace.selectedIds.length : 0;
      const rootClassName = started ? "ctxinj-root ctxinj-root-start" : "ctxinj-root ctxinj-root-blank";

      const trigger = React.createElement("button", {
        ref: triggerRef,
        type: "button",
        className: "ctxinj-trigger",
        onClick: () => setOpen((value) => !value),
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        title: "选择要注入当前会话的上下文规则",
      }, icon,
        React.createElement("span", { className: "ctxinj-trigger-label" }, "动态AGENTS.md"),
        count > 0 ? React.createElement("span", { className: "ctxinj-badge" }, String(count)) : null,
        React.createElement("span", { className: open ? "ctxinj-chevron ctxinj-chevron-open" : "ctxinj-chevron", "aria-hidden": true }, chevronGlyph),
      );

      if (!open) return React.createElement("div", { className: rootClassName, ref: rootRef }, trigger);

      // 锁状态行（仅会话已开始时显示）：确认解锁 / 锁定 / 已解锁 ——
      // confirmUnlock 分支必须优先于 locked 分支渲染，否则点击解锁后确认框被遮蔽
      const lockRow = started
        ? (confirmUnlock
            ? React.createElement("div", { className: "ctxinj-lock-row ctxinj-lock-row-confirm" },
                React.createElement("span", { className: "ctxinj-lock-notice" }, "解锁后可修改上下文，但下一次请求将缓存未命中、响应可能变慢，确认解锁？"),
                React.createElement(primitives.Button, { type: "button", variant: "primary", size: "sm", className: "ctxinj-btn-danger", disabled: unlockSaving, onClick: () => setUnlocked(true) }, unlockSaving ? "确认中…" : "确认解锁"),
                React.createElement(primitives.Button, { type: "button", variant: "ghost", size: "sm", onClick: () => setConfirmUnlock(false) }, "取消"),
              )
            : locked
              ? React.createElement("div", { className: "ctxinj-lock-row" },
                  React.createElement("span", { className: "ctxinj-lock-notice" }, "🔒 会话已开始，上下文已锁定（保护缓存命中率）"),
                  React.createElement(primitives.Button, { type: "button", variant: "ghost", size: "sm", onClick: () => setConfirmUnlock(true) }, "解锁"),
                )
              : React.createElement("div", { className: "ctxinj-lock-row" },
                  React.createElement("span", { className: "ctxinj-lock-notice" }, "🔓 已解锁（修改将影响缓存命中率）"),
                  React.createElement(primitives.Button, { type: "button", variant: "ghost", size: "sm", onClick: () => setUnlocked(false) }, "锁定"),
                ))
        : null;

      // 单个分组：标题（+ 全选/取消全选、新增）+ 行列表
      function renderGroup(scope, title) {
        const group = data && data[scope];
        const hasRows = !!(group && group.contexts.length > 0);
        const allSelected = hasRows && group.contexts.every((c) => group.selectedIds.includes(c.id));
        const rows = hasRows
          ? group.contexts.map((c) => {
              const key = `${scope}:${c.id}`;
              const selected = group.selectedIds.includes(c.id);
              const expanded = expandedKey === key;
              const preview = c.content.replace(/\s+/g, " ").slice(0, 120);
              const rowMain = React.createElement("span", { className: "ctxinj-row-main" },
                React.createElement("span", { className: "ctxinj-row-name" }, c.name),
                expanded
                  ? React.createElement("div", { className: "ctxinj-expanded" }, c.content)
                  : React.createElement("span", { className: "ctxinj-row-preview" }, preview),
              );
              const actions = React.createElement("span", { className: "ctxinj-row-actions" },
                React.createElement("button", { type: "button", className: "ctxinj-mini-btn", title: expanded ? "收起内容" : "查看完整内容", onClick: (e) => { e.stopPropagation(); setExpandedKey(expanded ? null : key); } }, expanded ? "收起" : "查看"),
                confirmKey === key
                  ? React.createElement("span", { className: "ctxinj-row-actions" },
                      React.createElement("button", { type: "button", className: "ctxinj-mini-btn ctxinj-mini-solid-danger", disabled: busyKey === key || locked, onClick: (e) => { e.stopPropagation(); remove(scope, c.id); } }, busyKey === key ? "删除中…" : "确认删除"),
                      React.createElement("button", { type: "button", className: "ctxinj-mini-btn", onClick: (e) => { e.stopPropagation(); setConfirmKey(null); } }, "取消"),
                    )
                  : React.createElement("button", { type: "button", className: "ctxinj-mini-btn ctxinj-mini-danger ctxinj-del-btn", title: "删除", disabled: locked, onClick: (e) => { e.stopPropagation(); setConfirmKey(key); } }, "删除"),
              );
              return React.createElement("div", {
                key: key,
                className: locked ? "ctxinj-row ctxinj-row-locked" : "ctxinj-row",
                onClick: () => { if (!locked) toggle(scope, c.id, !selected); },
              },
                React.createElement("input", {
                  type: "checkbox",
                  className: "ctxinj-check",
                  checked: selected,
                  disabled: locked,
                  "aria-label": c.name,
                  onChange: (e) => { e.stopPropagation(); toggle(scope, c.id, e.target.checked); },
                }),
                rowMain,
                actions,
              );
            })
          : [React.createElement("div", { className: "ctxinj-group-empty", key: `${scope}:empty` }, "暂无上下文，点击「新增」创建")];
        return React.createElement("div", { className: "ctxinj-group", key: scope },
          React.createElement("div", { className: "ctxinj-group-head" },
            React.createElement("span", { className: "ctxinj-group-title" }, title),
            hasRows
              ? React.createElement("button", {
                  type: "button",
                  className: "ctxinj-mini-btn",
                  disabled: locked,
                  title: allSelected ? "取消勾选该组全部规则" : "勾选该组全部规则",
                  onClick: () => toggleSelectAll(scope),
                }, allSelected ? "取消全选" : "全选")
              : null,
            React.createElement("button", { type: "button", className: "ctxinj-mini-btn", disabled: locked, onClick: () => { setAddingScope(addingScope === scope ? null : scope); setError(""); } }, "新增"),
          ),
          rows,
        );
      }

      const panel = React.createElement("div", {
        ref: panelRef,
        className: "ctxinj-panel",
        role: "dialog",
        "aria-label": "动态AGENTS.md",
        style: Object.assign(
          { visibility: panelPosition ? "visible" : "hidden" },
          panelPosition || {},
        ),
      },
        React.createElement("div", { className: "ctxinj-head" },
          React.createElement("span", { className: "ctxinj-head-title" }, "动态AGENTS.md"),
          React.createElement("span", { className: "ctxinj-head-count" }, "共 " + String(count) + " 项"),
        ),
        lockRow,
        error ? React.createElement("div", { className: "ctxinj-error" }, error) : null,
        loading
          ? React.createElement("div", { className: "ctxinj-status" }, "加载中…")
          : React.createElement("div", { className: "ctxinj-scroll" },
              renderGroup("global", "全局"),
              renderGroup("workspace", "当前工作区"),
            ),
        addingScope !== null ? React.createElement("div", { className: "ctxinj-form" },
          React.createElement("div", { className: "ctxinj-group-head" },
            React.createElement("span", { className: "ctxinj-group-title" }, "新增到" + SCOPE_TITLES[addingScope]),
          ),
          React.createElement(primitives.Input, {
            className: "ctxinj-input-wrap",
            placeholder: "规则名称（必填）",
            maxLength: 200,
            value: name,
            onChange: (e) => setName(e.target.value),
          }),
          React.createElement("textarea", { className: "ctxinj-textarea", placeholder: "规则内容（必填，将注入到会话上下文中）", value: content, onChange: (e) => setContent(e.target.value), rows: 4 }),
          React.createElement("div", { className: "ctxinj-form-actions" },
            React.createElement(primitives.Button, { type: "button", variant: "primary", size: "sm", disabled: saving || locked, onClick: submitAdd }, saving ? "保存中…" : "保存"),
            React.createElement(primitives.Button, { type: "button", variant: "ghost", size: "sm", onClick: () => { setAddingScope(null); setError(""); } }, "取消"),
          ),
        ) : null,
      );

      return React.createElement("div", { className: rootClassName, ref: rootRef }, trigger,
        typeof ReactDOM.createPortal === "function"
          ? ReactDOM.createPortal(panel, document.body)
          : panel,
      );
    }

    /** Client 插件主体：注册输入框上方 Dock，始终保持在输入卡片之前。 */
    function apply(ctx) {
      injectStyles();
      const slots = ctx.get("slots");
      if (slots === undefined) {
        console.warn("dynamic-agents: slots service unavailable — 动态AGENTS.md控件未注册");
        return;
      }
      slots.inject("conversation.input.dock", () => slots.register(
        { name: "conversation.input.dock", id: "ctx-inject", order: 100 },
        (slotProps) => {
          const { sessionId, useSessions, session } = slotProps;
          if (typeof sessionId !== "string" || typeof useSessions !== "function") return null;
          // 当前会话所属工作区路径（无工作区则不渲染）
          const cwd = useSessions((s) => (s.byId[sessionId] ? s.byId[sessionId].cwd : undefined));
          if (typeof cwd !== "string" || !cwd) return null;
          // 会话是否已开始：SessionSnapshot.blank === false（日志非空）
          const started = !!(session && session.blank === false);
          return React.createElement(ContextInjectView, { sessionId, started });
        },
      ));
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
