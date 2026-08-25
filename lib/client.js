// @dsh/dynamic-agents — 动态AGENTS.md。
//
// 下拉面板分「全局」与「当前工作区」两组，各自可勾选/新增/删除/查看，
// 锁定时两组均禁编辑；通信为同源 fetch（POST /dsh-dynamic-agents/api）。

window.__ModuleLoader__.load({
  id: "@dsh/dynamic-agents",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
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
      ".ctxinj-badge{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-label-caption,#8a8f99);color:#fff;font-size:11px;line-height:16px;text-align:center}",
      ".ctxinj-chevron{color:var(--dsw-alias-label-caption,#8a8f99);flex:none;transition:transform .12s}",
      ".ctxinj-chevron-open{transform:rotate(180deg)}",
      ".ctxinj-menu{box-sizing:border-box;position:absolute;z-index:20;left:0;right:auto;bottom:calc(100% + 8px);width:min(380px,calc(100vw - 32px));max-height:min(520px,calc(100vh - 96px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-inverted,rgba(128,128,128,.3));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#fff));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary,#1f2329)}",
      ".ctxinj-menu-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px;font-size:13px;font-weight:600}",
      ".ctxinj-add-btn{border:none;background:none;color:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font-size:12px;padding:2px 4px;border-radius:6px}",
      ".ctxinj-add-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-add-btn:disabled{opacity:.55;cursor:default}",
      ".ctxinj-lock-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.15));font-size:12px;line-height:18px}",
      ".ctxinj-lock-notice{flex:1;min-width:0;color:var(--dsw-alias-label-secondary,#8a8f99);word-break:break-all}",
      ".ctxinj-lock-row-confirm{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,48,38,.06))}",
      ".ctxinj-btn-small{padding:2px 10px;font-size:12px}",
      ".ctxinj-scroll{overflow-y:auto;flex:1;min-height:0}",
      ".ctxinj-group{padding:2px 6px 4px}",
      ".ctxinj-group-head{display:flex;align-items:center;justify-content:space-between;padding:8px 6px 2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#8a8f99)}",
      ".ctxinj-group-head .ctxinj-add-btn{font-weight:400}",
      ".ctxinj-group-empty{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:4px 6px 6px}",
      ".ctxinj-row{display:flex;align-items:flex-start;gap:8px;padding:7px 6px;border-radius:8px;cursor:pointer}",
      ".ctxinj-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-row-locked{cursor:default}",
      ".ctxinj-row-locked:hover{background:transparent}",
      ".ctxinj-row input[type=checkbox]{margin-top:3px;accent-color:var(--dsw-alias-brand-primary,#4f6ef7);flex:none}",
      ".ctxinj-row-main{display:flex;flex-direction:column;min-width:0;flex:1}",
      ".ctxinj-row-name{font-size:13px;font-weight:500;line-height:20px;word-break:break-all}",
      ".ctxinj-row-preview{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}",
      ".ctxinj-expanded{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow-y:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.15));border-radius:8px;padding:6px 8px;margin-top:4px}",
      ".ctxinj-view-btn{flex:none;border:none;background:none;color:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px}",
      ".ctxinj-view-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-del-btn{flex:none;visibility:hidden;border:none;background:none;color:var(--dsw-alias-label-caption,#8a8f99);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px}",
      ".ctxinj-row:hover .ctxinj-del-btn{visibility:visible}",
      ".ctxinj-del-btn:hover{color:var(--dsw-alias-state-error-primary,#d93026);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,48,38,.1))}",
      ".ctxinj-del-btn:disabled{opacity:.4;cursor:default}",
      ".ctxinj-row-actions{display:flex;gap:6px;flex:none}",
      ".ctxinj-confirm-btn{border:none;border-radius:6px;background:var(--dsw-alias-state-error-primary,#d93026);color:#fff;font-size:12px;padding:2px 8px;cursor:pointer;white-space:nowrap}",
      ".ctxinj-confirm-btn:disabled{opacity:.55;cursor:default}",
      ".ctxinj-cancel-btn{border:none;background:none;color:var(--dsw-alias-label-secondary,#8a8f99);cursor:pointer;font-size:12px;padding:2px 8px;border-radius:6px}",
      ".ctxinj-status{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:10px 8px}",
      ".ctxinj-error{color:var(--dsw-alias-state-error-primary,#d93026);font-size:12px;line-height:18px;padding:6px 10px;word-break:break-all}",
      ".ctxinj-form{display:flex;flex-direction:column;gap:8px;padding:8px 10px 10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.15))}",
      ".ctxinj-input,.ctxinj-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px;padding:6px 8px;outline:none;font-family:inherit}",
      ".ctxinj-input:focus,.ctxinj-textarea:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
      ".ctxinj-textarea{resize:vertical;min-height:72px}",
      ".ctxinj-form-actions{display:flex;justify-content:flex-end;gap:8px}",
      ".ctxinj-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;color:var(--dsw-alias-label-primary,#1f2329);border-radius:8px;font-size:12px;padding:4px 12px;cursor:pointer}",
      ".ctxinj-btn-primary{border-color:var(--dsw-alias-brand-primary,#4f6ef7);background:var(--dsw-alias-brand-primary,#4f6ef7);color:#fff}",
      ".ctxinj-btn:disabled{opacity:.55;cursor:default}",
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

    // 与工具执行行的 Read 图标保持一致（IconBrowseOutline16，14px 绘制尺寸）。
    const icon = React.createElement(primitives.IconBrowseOutline16, { size: 14 });

    const chevron = (open) => React.createElement("svg", { width: 14, height: 14, viewBox: "0 0 12 12", "aria-hidden": true, className: open ? "ctxinj-chevron ctxinj-chevron-open" : "ctxinj-chevron" },
      React.createElement("path", { d: "M3 4.5l3 3 3-3", stroke: "currentColor", strokeWidth: 1.2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
    );

    // 主组件：触发按钮 + 下拉多选面板（全局/工作区两组）
    // props.started：会话是否已开始（日志非空），由槽位层根据 ConversationSnapshot.blank 派生
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
      // 组件根节点引用：用于判断点击是否发生在弹窗/触发按钮内部
      const rootRef = React.useRef(null);
      // 触发按钮引用：用于测量弹框可用空间
      const triggerRef = React.useRef(null);
      // 合并同一会话的重复刷新，并令旧会话响应失效。
      const refreshRef = React.useRef({ nextId: 0, sessionId: null, promise: null });
      // 弹框动态定位：{ maxHeight, maxWidth, left, top } | null
      // null 表示未测量，使用 CSS 默认值（向上、静态 max-height）
      const [menuPos, setMenuPos] = React.useState(null);

      // 锁定判定：会话已开始且未显式解锁（unlocked 按会话持久化在工作区存储）
      const locked = started && !(data && data.workspace.unlocked);

      // 关闭弹窗并复位全部临时交互状态
      function closePopup() {
        setOpen(false);
        setConfirmKey(null);
        setConfirmUnlock(false);
        setExpandedKey(null);
      }

      // 点击外部关闭：文档级 mousedown（不依赖 position:fixed 遮罩，避免被祖先容器限制）；
      // 编辑状态（新增表单打开）下点击外部不关闭，保护草稿。
      React.useEffect(() => {
        if (!open) return;
        const onMouseDown = (event) => {
          if (rootRef.current && rootRef.current.contains(event.target)) return;
          if (addingScope !== null) return;
          closePopup();
        };
        if (typeof document !== "undefined") {
          document.addEventListener("mousedown", onMouseDown);
          return () => document.removeEventListener("mousedown", onMouseDown);
        }
      }, [open, addingScope]);

      // 弹框动态定位：打开时测量 trigger 与视口四边的距离，
      // 计算安全矩形内的最终位置与尺寸，避免弹框超出任一边界。
      // 同时尊重 overflow 祖先的可见范围。
      // useLayoutEffect 在绘制前同步执行，避免用户看到位置闪烁。
      React.useLayoutEffect(() => {
        if (!open) {
          setMenuPos(null);
          return;
        }
        const trigger = triggerRef.current;
        const root = rootRef.current;
        if (!trigger) return;

        const GAP = 8;          // 弹框与 trigger 的间距（与原 bottom:calc(100% + 8px) 的 8px 一致）
        const MARGIN = 8;       // 距视口边缘的安全间距
        const MAX_LIMIT = 520;  // max-height 上限（与原 CSS 一致）
        const MIN_PREFER = 240; // 偏好方向（向上）的最小可用高度阈值

        const updateMenuPos = (nextPosition) => {
          setMenuPos((previous) => previous
            && previous.maxHeight === nextPosition.maxHeight
            && previous.maxWidth === nextPosition.maxWidth
            && previous.left === nextPosition.left
            && previous.top === nextPosition.top
            ? previous
            : nextPosition);
        };

        const compute = () => {
          const rect = trigger.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const spaceAbove = Math.max(0, rect.top - GAP - MARGIN);
          const spaceBelow = Math.max(0, vh - rect.bottom - GAP - MARGIN);
          const direction = spaceAbove >= MIN_PREFER || spaceAbove >= spaceBelow ? "up" : "down";
          const availableHeight = direction === "up" ? spaceAbove : spaceBelow;
          const maxHeight = Math.max(1, Math.min(availableHeight, MAX_LIMIT, vh - MARGIN * 2));

          // 默认使用视口安全矩形；如果祖先设置了 overflow，则进一步收紧到其可见范围。
          let clipLeft = MARGIN;
          let clipRight = vw - MARGIN;
          if (root) {
            let anc = root.parentElement;
            while (anc && anc !== document.body) {
              const style = getComputedStyle(anc);
              if (style.overflowX !== "visible" || style.overflow !== "visible") {
                const clipRect = anc.getBoundingClientRect();
                clipLeft = Math.max(clipLeft, Math.ceil(clipRect.left) + 2);
                clipRight = Math.min(clipRight, Math.floor(clipRect.right) - 2);
                break;
              }
              anc = anc.parentElement;
            }
          }

          const rootRect = root ? root.getBoundingClientRect() : rect;
          const menuEl = root ? root.querySelector(".ctxinj-menu") : null;
          const measuredWidth = menuEl ? menuEl.getBoundingClientRect().width : 380;
          const measuredHeight = menuEl ? menuEl.getBoundingClientRect().height : maxHeight;
          const availableWidth = Math.max(1, clipRight - clipLeft);
          const menuWidth = Math.min(measuredWidth, availableWidth);
          const menuHeight = Math.min(measuredHeight, maxHeight);

          // Dock 根节点与输入卡片同宽，菜单按触发器左侧对齐，再对四边做 clamp。
          const preferredLeft = rect.left;
          const preferredTop = direction === "up"
            ? rect.top - GAP - menuHeight
            : rect.bottom + GAP;
          const left = Math.min(Math.max(preferredLeft, clipLeft), clipRight - menuWidth);
          const top = Math.min(Math.max(preferredTop, MARGIN), vh - MARGIN - menuHeight);

          updateMenuPos({
            maxHeight,
            maxWidth: availableWidth,
            left: Math.round(left - rootRect.left),
            top: Math.round(top - rootRect.top),
          });
        };

        let frameId = null;
        const scheduleCompute = () => {
          if (frameId !== null) return;
          if (typeof window.requestAnimationFrame !== "function") {
            compute();
            return;
          }
          frameId = window.requestAnimationFrame(() => {
            frameId = null;
            compute();
          });
        };

         compute();
        // 窗口或祖先滚动时重算，保证弹框持续位于视口安全区域内。
        window.addEventListener("resize", scheduleCompute);
        window.addEventListener("scroll", scheduleCompute, true);
        const menuEl = root && root.querySelector(".ctxinj-menu");
        const resizeObserver = typeof window.ResizeObserver === "function" && menuEl
          ? new window.ResizeObserver(scheduleCompute)
          : null;
        if (resizeObserver && menuEl) resizeObserver.observe(menuEl);
        return () => {
           window.removeEventListener("resize", scheduleCompute);
           window.removeEventListener("scroll", scheduleCompute, true);
           if (resizeObserver) resizeObserver.disconnect();
           if (frameId !== null && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frameId);
         };
      }, [open]);

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

      // 勾选/取消勾选（乐观更新，失败回滚）；锁定时不允许
      async function toggle(scope, id, checked) {
        if (!data || locked) return;
        const group = data[scope];
        if (!group) return;
        const prev = data;
        const selectedIds = checked
          ? (group.selectedIds.includes(id) ? group.selectedIds : group.selectedIds.concat(id))
          : group.selectedIds.filter((x) => x !== id);
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
        "aria-haspopup": "menu",
        "aria-expanded": open,
        title: "选择要注入当前会话的上下文规则",
      }, icon,
        React.createElement("span", { className: "ctxinj-trigger-label" }, "动态AGENTS.md"),
        count > 0 ? React.createElement("span", { className: "ctxinj-badge" }, String(count)) : null,
        chevron(open),
      );

      if (!open) return React.createElement("div", { className: rootClassName, ref: rootRef }, trigger);

      // 锁状态行（仅会话已开始时显示）：确认解锁 / 锁定 / 已解锁 ——
      // confirmUnlock 分支必须优先于 locked 分支渲染，否则点击解锁后确认框被遮蔽
      const lockRow = started
        ? (confirmUnlock
            ? React.createElement("div", { className: "ctxinj-lock-row ctxinj-lock-row-confirm" },
                React.createElement("span", { className: "ctxinj-lock-notice" }, "解锁后可修改上下文，但下一次请求将缓存未命中、响应可能变慢，确认解锁？"),
                React.createElement("button", { type: "button", className: "ctxinj-btn ctxinj-btn-small ctxinj-btn-primary", disabled: unlockSaving, onClick: () => setUnlocked(true) }, unlockSaving ? "确认中…" : "确认解锁"),
                React.createElement("button", { type: "button", className: "ctxinj-btn ctxinj-btn-small", onClick: () => setConfirmUnlock(false) }, "取消"),
              )
            : locked
              ? React.createElement("div", { className: "ctxinj-lock-row" },
                  React.createElement("span", { className: "ctxinj-lock-notice" }, "🔒 会话已开始，上下文已锁定（保护缓存命中率）"),
                  React.createElement("button", { type: "button", className: "ctxinj-btn ctxinj-btn-small", onClick: () => setConfirmUnlock(true) }, "解锁"),
                )
              : React.createElement("div", { className: "ctxinj-lock-row" },
                  React.createElement("span", { className: "ctxinj-lock-notice" }, "🔓 已解锁（修改将影响缓存命中率）"),
                  React.createElement("button", { type: "button", className: "ctxinj-btn ctxinj-btn-small", onClick: () => setUnlocked(false) }, "锁定"),
                ))
        : null;

      // 单个分组：标题 + 行列表
      function renderGroup(scope, title) {
        const group = data && data[scope];
        const rows = group && group.contexts.length > 0
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
                React.createElement("button", { type: "button", className: "ctxinj-view-btn", title: expanded ? "收起内容" : "查看完整内容", onClick: (e) => { e.stopPropagation(); setExpandedKey(expanded ? null : key); } }, expanded ? "收起" : "查看"),
                confirmKey === key
                  ? React.createElement("span", { className: "ctxinj-row-actions" },
                      React.createElement("button", { type: "button", className: "ctxinj-confirm-btn", disabled: busyKey === key || locked, onClick: (e) => { e.stopPropagation(); remove(scope, c.id); } }, busyKey === key ? "删除中…" : "确认删除"),
                      React.createElement("button", { type: "button", className: "ctxinj-cancel-btn", onClick: (e) => { e.stopPropagation(); setConfirmKey(null); } }, "取消"),
                    )
                  : React.createElement("button", { type: "button", className: "ctxinj-del-btn", title: "删除", disabled: locked, onClick: (e) => { e.stopPropagation(); setConfirmKey(key); } }, "删除"),
              );
              return React.createElement("div", {
                key: key,
                className: locked ? "ctxinj-row ctxinj-row-locked" : "ctxinj-row",
                onClick: () => { if (!locked) toggle(scope, c.id, !selected); },
              },
                React.createElement("input", {
                  type: "checkbox",
                  checked: selected,
                  disabled: locked,
                  onChange: (e) => { e.stopPropagation(); toggle(scope, c.id, e.target.checked); },
                }),
                rowMain,
                actions,
              );
            })
          : [];
        return React.createElement("div", { className: "ctxinj-group", key: scope },
          React.createElement("div", { className: "ctxinj-group-head" },
            React.createElement("span", null, title),
            React.createElement("button", { type: "button", className: "ctxinj-add-btn", disabled: locked, onClick: () => { setAddingScope(addingScope === scope ? null : scope); setError(""); } }, "新增"),
          ),
          rows.length > 0
            ? rows
            : React.createElement("div", { className: "ctxinj-group-empty" }, "暂无上下文，点击「新增」创建"),
        );
      }

      // 根据测量结果构建内联定位样式；menuPos 为 null 时回退到 CSS 默认位置。
      const menuStyle = menuPos ? {
        maxHeight: menuPos.maxHeight + "px",
        maxWidth: menuPos.maxWidth + "px",
        left: menuPos.left + "px",
        top: menuPos.top + "px",
        right: "auto",
        bottom: "auto",
      } : undefined;

      return React.createElement("div", { className: rootClassName, ref: rootRef }, trigger,
        React.createElement("div", {  className: "ctxinj-menu", role: "menu", "aria-label": "动态AGENTS.md", style: menuStyle },
          React.createElement("div", { className: "ctxinj-menu-head" },
            React.createElement("span", null, "动态AGENTS.md"),
            React.createElement("span", { className: "ctxinj-trigger-label" }, "共 " + String(count) + " 项"),
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
            React.createElement("div", { className: "ctxinj-group-head" }, "新增到" + (addingScope === "global" ? "全局" : "当前工作区")),
            React.createElement("input", { className: "ctxinj-input", placeholder: "规则名称（必填）", value: name, onChange: (e) => setName(e.target.value) }),
            React.createElement("textarea", { className: "ctxinj-textarea", placeholder: "规则内容（必填，将注入到会话上下文中）", value: content, onChange: (e) => setContent(e.target.value), rows: 4 }),
            React.createElement("div", { className: "ctxinj-form-actions" },
              React.createElement("button", { type: "button", className: "ctxinj-btn ctxinj-btn-primary", disabled: saving || locked, onClick: submitAdd }, saving ? "保存中…" : "保存"),
              React.createElement("button", { type: "button", className: "ctxinj-btn", onClick: () => { setAddingScope(null); setError(""); } }, "取消"),
            ),
          ) : null,
        ),
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
          // 会话是否已开始：ConversationSnapshot.blank === false（日志非空）
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
