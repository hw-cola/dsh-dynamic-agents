// @dsh/dynamic-agents — 动态AGENTS.md。
//
// 下拉面板分「全局」与「当前工作区」两组，各自可勾选（支持全选/取消全选）、
// 新增、编辑、删除、查看；规则行带拖拽手柄，可拖动排序或用 ↑/↓ 键调整同组顺序；
// 控件只注册在空白会话的 New Session 行，会话开始后随该行一起卸载；
// 通信为同源 fetch（POST /dsh-dynamic-agents/api）。
//
// 视觉与交互对齐 DSH 官方风格：面板卡片复用官方 Menu 卡片的设计令牌
// （specific-menu 背景、prominent 阴影、16px 圆角、11px 分组标题），
// 定位/关闭复用官方 primitives 的 useAnchoredPosition /
// useDismissOnOutsidePointer，按钮使用官方 Button，输入框/文本域自绘并对齐官方视觉；
// 面板 portal 到 document.body（官方菜单同款 z-index 1100，可叠于模态弹窗之上）。

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
      // ---------- New Session 行控件与触发按钮 ----------
      // 控件只在空白会话的 New Session 行（Hero）内联显示；会话开始后该行整体卸载。
      ".ctxinj-root{position:relative;display:inline-flex;align-items:center;flex:none;max-width:100%}",
      ".ctxinj-trigger{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;max-width:min(100%,240px);min-height:28px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;font-size:13px;font-weight:500;line-height:20px;outline:none;overflow:hidden;white-space:nowrap}",
      ".ctxinj-trigger:hover,.ctxinj-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
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
      // ---------- 滚动区与分组 ----------
      ".ctxinj-scroll{overflow-y:auto;flex:0 1 auto;min-height:0}",
      ".ctxinj-group{padding:2px 0 4px}",
      ".ctxinj-group-head{display:flex;align-items:center;gap:4px;padding:6px 8px 2px}",
      ".ctxinj-group-title{flex:1;min-width:0;font-size:11px;line-height:15px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a8f99)}",
      // 分组头/行内的小型文字按钮（官方 tokens：次级文字 + hover 灰底）。
      ".ctxinj-mini-btn{border:none;background:none;color:var(--dsw-alias-label-secondary,#8a8f99);font-size:12px;line-height:18px;padding:1px 6px;border-radius:6px;cursor:pointer;white-space:nowrap}",
      ".ctxinj-mini-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,#1f2329)}",
      ".ctxinj-mini-btn:disabled{opacity:.4;cursor:default}",
      // 确认删除：错误色实底胶囊。
      ".ctxinj-mini-solid-danger{background:var(--dsw-alias-state-error-primary,#d93026);color:var(--dsw-alias-label-primary-foreground,#fff)}",
      ".ctxinj-group-empty{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:2px 8px 6px}",
      // ---------- 规则行 ----------
      ".ctxinj-row{position:relative;display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer}",
      ".ctxinj-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      // 勾选框为自绘样式（appearance:none）：应用主题的 brand-primary 在浅色下是
      // 近黑墨色（#0f1115），观感过重；这里用应用自身的 DeepSeek 蓝（发送按钮同款
      // --dsw-static-deepseek-500），未勾选为细边圆角方框，悬停描边变蓝。
      ".ctxinj-check{appearance:none;-webkit-appearance:none;flex:none;box-sizing:border-box;width:16px;height:16px;margin:2px 0 0;border:1.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.16));border-radius:5px;background-color:var(--dsw-alias-bg-layer-1,#fff);cursor:pointer;transition:background-color .12s,border-color .12s}",
      ".ctxinj-check:hover{border-color:var(--dsw-static-deepseek-500,#4176e6)}",
      ".ctxinj-check:checked{border-color:var(--dsw-static-deepseek-500,#4176e6);background-color:var(--dsw-static-deepseek-500,#4176e6);background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-6.5' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-size:12px 12px;background-position:center;background-repeat:no-repeat}",
      ".ctxinj-check:focus-visible{outline:2px solid var(--dsw-static-deepseek-500,#4176e6);outline-offset:2px}",
      ".ctxinj-check:disabled{opacity:.4;cursor:default}",
      ".ctxinj-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".ctxinj-row-name{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,#1f2329);word-break:break-all}",
      ".ctxinj-row-preview{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}",
      ".ctxinj-expanded{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow-y:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#8a8f99);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));border-radius:8px;padding:6px 8px;margin-top:2px}",
      // 行内操作为常驻小图标按钮（查看/删除）：占位紧凑，静止时三级灰不抢视觉，
      // 悬停行/按钮时显色；无悬停位移、无空置右侧列。
      ".ctxinj-row-actions{display:flex;align-items:flex-start;gap:2px;flex:none}",
      ".ctxinj-row-icon-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary,#b3b8c2);cursor:pointer;padding:0;flex:none;transition:color .12s,background-color .12s}",
      ".ctxinj-row-icon-btn:hover{color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-row-icon-btn.ctxinj-row-icon-danger:hover{color:var(--dsw-alias-state-error-primary,#d93026);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,48,38,.1))}",
      ".ctxinj-row-icon-btn:disabled{opacity:.4;cursor:default}",
      // ---------- 拖拽排序与编辑态 ----------
      // 手柄独立接收指针事件：只在手柄上禁用触屏滚动，面板其余区域照常滚动。
      ".ctxinj-row-grip{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary,#b3b8c2);cursor:grab;padding:0;flex:none;touch-action:none;-webkit-touch-callout:none;transition:color .12s,background-color .12s}",
      ".ctxinj-row-grip:hover:not(:disabled){color:var(--dsw-alias-label-secondary,#8a8f99);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
      ".ctxinj-row-grip:active:not(:disabled){cursor:grabbing}",
      ".ctxinj-row-grip:focus-visible{outline:2px solid var(--dsw-static-deepseek-500,#4176e6);outline-offset:1px}",
      ".ctxinj-row-grip:disabled{opacity:.4;cursor:default}",
      // 拖拽中：原行保留占位但隐藏，由 portal 到 body 的悬浮副本跟随鼠标。
      ".ctxinj-panel-dragging{user-select:none}",
      ".ctxinj-row-dragging{visibility:hidden}",
      ".ctxinj-row-ghost{position:fixed;z-index:1102;box-sizing:border-box;display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary,#1f2329);pointer-events:none;opacity:.97;transform:scale(1.01)}",
      // 正在编辑的行给一层浅底色，和底部表单呼应。
      ".ctxinj-row-editing{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08))}",
      // ---------- 状态行 ----------
      ".ctxinj-status{color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px;padding:8px}",
      ".ctxinj-error{color:var(--dsw-alias-state-error-primary,#d93026);font-size:12px;line-height:18px;padding:4px 8px;word-break:break-all}",
      // ---------- 新增/编辑表单（面板底部固定区） ----------
      ".ctxinj-form{display:flex;flex-direction:column;gap:8px;padding:8px;margin-top:2px;min-width:0;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}",
      // 单行输入框：自绘并强制 border-box，避免官方 Input 的盒模型把右边界顶出面板。
      ".ctxinj-input{box-sizing:border-box;width:100%;min-width:0;height:34px;padding:5px 8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-family:inherit;font-size:14px;line-height:22px;outline:none}",
      ".ctxinj-input:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
      ".ctxinj-input::placeholder{color:var(--dsw-alias-label-dimmed,#b3b8c2)}",
      // 与官方 Input 一致的文本域视觉（.5px l4 边框、8px 圆角、layer-1 底、品牌色 focus）。
      ".ctxinj-textarea{box-sizing:border-box;width:100%;min-width:0;resize:vertical;min-height:88px;padding:5px 8px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.35));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-family:inherit;font-size:14px;line-height:22px;outline:none}",
      ".ctxinj-textarea:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
      ".ctxinj-textarea::placeholder{color:var(--dsw-alias-label-dimmed,#b3b8c2)}",
      ".ctxinj-form-actions{display:flex;justify-content:flex-end;gap:8px}",
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
    const icon = React.createElement(primitives.IconContextInjectionOutlineMedium, { size: 16 });
    const chevronGlyph = React.createElement(primitives.IconChevronDownOutlineMedium, { size: 12 });
    // 行内图标用内联 SVG（不新增 primitives 依赖）：拖拽手柄（6 点）与编辑铅笔。
    const gripGlyph = React.createElement("svg", {
      width: 14,
      height: 14,
      viewBox: "0 0 16 16",
      "aria-hidden": true,
      fill: "currentColor",
    },
      React.createElement("circle", { cx: 6, cy: 4, r: 1.15 }),
      React.createElement("circle", { cx: 10, cy: 4, r: 1.15 }),
      React.createElement("circle", { cx: 6, cy: 8, r: 1.15 }),
      React.createElement("circle", { cx: 10, cy: 8, r: 1.15 }),
      React.createElement("circle", { cx: 6, cy: 12, r: 1.15 }),
      React.createElement("circle", { cx: 10, cy: 12, r: 1.15 }),
    );
    const pencilGlyph = React.createElement("svg", {
      width: 14,
      height: 14,
      viewBox: "0 0 16 16",
      "aria-hidden": true,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
      React.createElement("path", { d: "M11.2 2.6l2.2 2.2L5.4 12.8l-2.9.7.7-2.9 8-8z" }),
      React.createElement("path", { d: "M9.8 4l2.2 2.2" }),
    );

    /** 分组标题（仅用于面板文案）。 */
    const SCOPE_TITLES = { global: "全局", workspace: "当前工作区" };

    /** 弹出面板与触发按钮的间距 / 视口安全边距（px）。 */
    const PANEL_GAP = 4;
    const VIEWPORT_MARGIN = 12;

    // 主组件：触发按钮 + 下拉多选面板（全局/工作区两组）
    // 只注册在空白会话的 New Session 行；会话开始后该行卸载，控件随之消失。
    function ContextInjectView(props) {
      const { sessionId } = props;
      const [open, setOpen] = React.useState(false);
      // data = { global: {contexts, selectedIds}, workspace: {contexts, selectedIds} }
      const [data, setData] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState("");
      // 底部表单：null | { scope: "global"|"workspace", id: string|null }（id 为空表示新增）
      const [form, setForm] = React.useState(null);
      const [name, setName] = React.useState("");
      const [content, setContent] = React.useState("");
      const [saving, setSaving] = React.useState(false);
      const [confirmKey, setConfirmKey] = React.useState(null); // `${scope}:${id}`
      const [busyKey, setBusyKey] = React.useState(null);
      const [expandedKey, setExpandedKey] = React.useState(null);
      // 拖拽中的行（悬浮副本几何 + 原行隐藏）；可变状态放在 dragRef。
      const [drag, setDrag] = React.useState(null);
      // 触发按钮引用：锚定点；面板 portal 节点引用：官方定位/关闭 hooks 使用。
      const triggerRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const rootRef = React.useRef(null);
      // 规则列表滚动容器引用（拖拽自动滚动与行矩形计算）。
      const scrollRef = React.useRef(null);
      // 跟随鼠标的悬浮行副本（通过直接改 style.top 逐帧移动，避免每帧重渲染）。
      const ghostRef = React.useRef(null);
      // 拖拽可变上下文：{ scope, id, pointerId, startX/Y, lastY, rowRect, active, contexts,
      //   order, snapshotContexts/Order, frame, listeners }；null = 未拖拽。
      const dragRef = React.useRef(null);
      // 拖拽/点击手柄后吞掉一次 click，避免误触发行勾选。
      const suppressClickRef = React.useRef(false);
      // 合并同一会话的重复刷新，并令旧响应失效。
      const refreshRef = React.useRef({ nextId: 0, sessionId: null, promise: null });

      // 关闭弹窗并复位全部临时交互状态
      function closePopup() {
        setOpen(false);
        setConfirmKey(null);
        setExpandedKey(null);
      }

      // 点击外部关闭（官方 hook）：portal 面板视为面板内部，不误关；
      // 表单（新增/编辑）打开时点击外部不关闭，保护草稿。
      primitives.useDismissOnOutsidePointer(
        rootRef,
        open,
        (next) => {
          if (next !== false) return;
          if (form !== null) return;
          closePopup();
        },
        panelRef,
      );

      // Escape 关闭面板（官方菜单同款键盘行为）；拖拽中只取消拖拽。
      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          if (dragRef.current !== null) {
            event.preventDefault();
            finishDrag(true);
            return;
          }
          closePopup();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [open]);

      // 面板打开时挂载 portal 节点；定位交给官方 useAnchoredPosition
      // （锚定触发按钮、向下展开、右边缘对齐按钮右边缘、6px 间距、12px 视口安全边距）。
      const panelPosition = primitives.useAnchoredPosition({
        open,
        anchorRef: triggerRef,
        panelRef,
        side: "bottom",
        align: "end",
        gap: PANEL_GAP,
        margin: VIEWPORT_MARGIN,
      });

      // 面板高度按触发按钮下方可用空间动态封顶：规则多时面板内部滚动，
      // 避免面板超出视口；与官方下拉菜单一样向下展开。
      const [maxPanelHeight, setMaxPanelHeight] = React.useState(null);
      React.useLayoutEffect(() => {
        if (!open) {
          setMaxPanelHeight(null);
          return;
        }
        const compute = () => {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const available = window.innerHeight - rect.bottom - VIEWPORT_MARGIN - PANEL_GAP - 12;
          setMaxPanelHeight(Math.max(240, Math.min(640, Math.round(available))));
        };
        compute();
        window.addEventListener("scroll", compute, true);
        window.addEventListener("resize", compute);
        return () => {
          window.removeEventListener("scroll", compute, true);
          window.removeEventListener("resize", compute);
        };
      }, [open]);

      // 从 Host 拉取当前会话工作区的上下文状态（含全局层）。
      function refresh() {
        const requestSessionId = sessionId;
        const pending = refreshRef.current;
        if (pending.promise && pending.sessionId === requestSessionId) {
          return pending.promise;
        }

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

      // 勾选集合变更（乐观更新，失败回滚）。
      // selectedIds 为该组完整目标集合：单行勾选与全选/取消全选共用此路径，
      // Host 侧 setSelection/setGlobalSelection 各自保留另一组的勾选。
      async function applySelection(scope, selectedIds) {
        if (!data) return;
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
          // 只合并勾选集合，保留本地列表顺序（避免拖拽期间被旧 contexts 覆盖）
          setData((current) => current
            ? Object.assign({}, current, { [scope]: Object.assign({}, current[scope], { selectedIds: state.selectedIds }) })
            : current);
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

      // ---------- 底部表单：新增 / 编辑共用 ----------
      function openAdd(scope) {
        setForm({ scope, id: null });
        setName("");
        setContent("");
        setError("");
      }

      function openEdit(scope, item) {
        setForm({ scope, id: item.id });
        setName(item.name);
        setContent(item.content);
        setError("");
        setConfirmKey(null);
      }

      function closeForm() {
        setForm(null);
        setName("");
        setContent("");
        setError("");
      }

      // 新增或编辑提交（按 form.id 区分）
      async function submitForm() {
        const target = form;
        if (target === null) return;
        if (!name.trim() || !content.trim()) {
          setError("名称与内容均不能为空");
          return;
        }
        setSaving(true);
        setError("");
        try {
          const payload = { sessionId, name: name.trim(), content };
          let state;
          if (target.id === null) {
            const method = target.scope === "global" ? "addGlobalContext" : "addContext";
            state = await apiCall(method, payload);
          } else {
            const method = target.scope === "global" ? "updateGlobalContext" : "updateContext";
            state = await apiCall(method, Object.assign({ id: target.id }, payload));
          }
          const scope = target.scope;
          setData((current) => current ? Object.assign({}, current, { [scope]: state }) : current);
          setForm(null);
          setName("");
          setContent("");
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setSaving(false);
        }
      }

      // ---------- 拖拽排序 ----------
      // 还原某组的 contexts（拖拽失败/取消时回滚）
      function restoreContexts(scope, contexts) {
        setData((current) => current
          ? Object.assign({}, current, { [scope]: Object.assign({}, current[scope], { contexts }) })
          : current);
      }

      // 持久化排序结果；成功响应忽略（本地顺序即最终顺序），失败回滚。
      function persistOrder(scope, order, snapshotContexts) {
        const method = scope === "global" ? "reorderGlobalContexts" : "reorderContexts";
        apiCall(method, { sessionId, orderedIds: order }).catch((e) => {
          restoreContexts(scope, snapshotContexts);
          setError(String(e && e.message ? e.message : e));
        });
      }

      // 键盘 ↑/↓：移动一位并立即持久化
      function moveBy(scope, id, delta) {
        if (data === null || dragRef.current !== null) return;
        const group = data[scope];
        if (!group) return;
        const index = group.contexts.findIndex((c) => c.id === id);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= group.contexts.length) return;
        const contexts = group.contexts.slice();
        const [item] = contexts.splice(index, 1);
        contexts.splice(target, 0, item);
        setData((current) => current
          ? Object.assign({}, current, { [scope]: Object.assign({}, current[scope], { contexts }) })
          : current);
        persistOrder(scope, contexts.map((c) => c.id), group.contexts);
      }

      // 根据指针位置重排：越过多少行中线就落到对应位置
      function applyTarget(scope, id, clientY) {
        const current = dragRef.current;
        const scroller = scrollRef.current;
        if (current === null || scroller === null) return;
        const nodes = Array.from(scroller.querySelectorAll('[data-ctxinj-scope="' + scope + '"]'));
        if (nodes.length === 0) return;
        const from = nodes.findIndex((node) => node.getAttribute("data-ctxinj-id") === id);
        if (from < 0 || !current.contexts[from] || current.contexts[from].id !== id) return;
        let crossed = 0;
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (clientY > rect.top + rect.height / 2) crossed += 1;
        }
        let dest = crossed > from ? crossed - 1 : crossed;
        if (dest < 0) dest = 0;
        if (dest > nodes.length - 1) dest = nodes.length - 1;
        if (dest === from) return;
        const contexts = current.contexts.slice();
        const [item] = contexts.splice(from, 1);
        contexts.splice(dest, 0, item);
        current.contexts = contexts;
        current.order = contexts.map((c) => c.id);
        setData((data0) => data0
          ? Object.assign({}, data0, { [scope]: Object.assign({}, data0[scope], { contexts }) })
          : data0);
      }

      // 结束拖拽：清理监听/rAF，按需回滚；返回被结束的拖拽上下文。
      function finishDrag(revert) {
        const current = dragRef.current;
        if (current === null) return null;
        dragRef.current = null;
        if (current.listeners !== null) {
          window.removeEventListener("pointermove", current.listeners.move);
          window.removeEventListener("pointerup", current.listeners.up);
          window.removeEventListener("pointercancel", current.listeners.cancel);
          window.removeEventListener("blur", current.listeners.blur);
        }
        if (current.frame !== 0) window.cancelAnimationFrame(current.frame);
        setDrag(null);
        if (revert) restoreContexts(current.scope, current.snapshotContexts);
        // 略延迟重置：吞掉 pointerup 之后紧跟的 click，避免误触发行勾选。
        window.setTimeout(() => { suppressClickRef.current = false; }, 100);
        return current;
      }

      // 手柄 pointerdown：移动超过 4px 才进入拖拽，避免误触
      function beginDrag(event, scope, id) {
        if (dragRef.current !== null) return;
        const group = data && data[scope];
        if (!group) return;
        const row = event.currentTarget && typeof event.currentTarget.closest === "function"
          ? event.currentTarget.closest("[data-ctxinj-id]")
          : null;
        const rowRect = row === null ? null : row.getBoundingClientRect();
        if (rowRect === null) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = true;
        const current = {
          scope,
          id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastY: event.clientY,
          rowRect,
          active: false,
          contexts: group.contexts.slice(),
          order: group.contexts.map((c) => c.id),
          snapshotContexts: group.contexts.slice(),
          snapshotOrder: group.contexts.map((c) => c.id),
          frame: 0,
          listeners: null,
        };
        const onMove = (moveEvent) => {
          if (dragRef.current !== current || moveEvent.pointerId !== current.pointerId) return;
          moveEvent.preventDefault();
          current.lastY = moveEvent.clientY;
          if (!current.active) {
            const distance = Math.abs(moveEvent.clientX - current.startX) + Math.abs(moveEvent.clientY - current.startY);
            if (distance < 4) return;
            current.active = true;
            // 进入拖拽：原行隐藏，悬浮副本从原位置出现并由 tick 逐帧跟随指针。
            setDrag({
              scope: current.scope,
              id: current.id,
              left: rowRect.left,
              top: rowRect.top,
              width: rowRect.width,
            });
          }
          applyTarget(current.scope, current.id, moveEvent.clientY);
        };
        const onUp = (upEvent) => {
          if (dragRef.current !== current || upEvent.pointerId !== current.pointerId) return;
          const moved = current.active && current.order.join("\u0000") !== current.snapshotOrder.join("\u0000");
          const scope0 = current.scope;
          const order = current.order.slice();
          const snapshotContexts = current.snapshotContexts;
          finishDrag(false);
          if (moved) persistOrder(scope0, order, snapshotContexts);
        };
        const onCancel = (cancelEvent) => {
          if (dragRef.current !== current || cancelEvent.pointerId !== current.pointerId) return;
          finishDrag(true);
        };
        // 指针移出窗口/窗口失焦时取消拖拽，避免收不到 pointerup 后卡在拖拽态。
        const onBlur = () => {
          if (dragRef.current === current) finishDrag(true);
        };
        // 拖到滚动区上下边缘时自动滚动，并用最后的指针位置重新计算落点。
        const tick = () => {
          if (dragRef.current !== current) return;
          // 悬浮副本逐帧跟随指针（直接改 style，不触发 React 重渲染）。
          const ghost = ghostRef.current;
          if (current.active && ghost !== null) {
            ghost.style.top = Math.round(current.rowRect.top + (current.lastY - current.startY)) + "px";
          }
          const scroller = scrollRef.current;
          if (scroller !== null) {
            const rect = scroller.getBoundingClientRect();
            const edge = 28;
            let delta = 0;
            if (current.lastY < rect.top + edge) delta = -12;
            else if (current.lastY > rect.bottom - edge) delta = 12;
            if (delta !== 0) {
              const before = scroller.scrollTop;
              scroller.scrollTop = before + delta;
              if (scroller.scrollTop !== before) applyTarget(current.scope, current.id, current.lastY);
            }
          }
          current.frame = window.requestAnimationFrame(tick);
        };
        current.listeners = { move: onMove, up: onUp, cancel: onCancel, blur: onBlur };
        dragRef.current = current;
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        window.addEventListener("blur", onBlur);
        current.frame = window.requestAnimationFrame(tick);
      }

      // 组件卸载时兜底清理拖拽监听与 rAF。
      React.useEffect(() => () => {
        const current = dragRef.current;
        if (current === null) return;
        dragRef.current = null;
        if (current.listeners !== null) {
          window.removeEventListener("pointermove", current.listeners.move);
          window.removeEventListener("pointerup", current.listeners.up);
          window.removeEventListener("pointercancel", current.listeners.cancel);
          window.removeEventListener("blur", current.listeners.blur);
        }
        if (current.frame !== 0) window.cancelAnimationFrame(current.frame);
      }, []);

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
          if (form !== null && form.scope === scope && form.id === id) closeForm();
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setBusyKey(null);
        }
      }

      // 会话变化（含首次挂载）时拉取数据：让触发按钮在未打开时也能显示数量
      React.useEffect(() => {
        refresh();
      }, [sessionId]);

      // 打开面板时再次拉取最新数据
      React.useEffect(() => {
        if (open) refresh();
      }, [open]);

      // 切换会话时重置面板状态
      React.useEffect(() => {
        if (dragRef.current !== null) finishDrag(false);
        setOpen(false);
        setData(null);
        setError("");
        setForm(null);
        setConfirmKey(null);
        setExpandedKey(null);
        setName("");
        setContent("");
      }, [sessionId]);

      const count = data ? data.global.selectedIds.length + data.workspace.selectedIds.length : 0;

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

      if (!open) return React.createElement("div", { className: "ctxinj-root", ref: rootRef }, trigger);

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
              const editing = form !== null && form.scope === scope && form.id === c.id;
              const dragging = drag !== null && drag.scope === scope && drag.id === c.id;
              const preview = c.content.replace(/\s+/g, " ").slice(0, 120);
              const rowMain = React.createElement("span", { className: "ctxinj-row-main" },
                React.createElement("span", { className: "ctxinj-row-name" }, c.name),
                expanded
                  ? React.createElement("div", { className: "ctxinj-expanded" }, c.content)
                  : React.createElement("span", { className: "ctxinj-row-preview" }, preview),
              );
              const actions = React.createElement("span", { className: "ctxinj-row-actions" },
                React.createElement("button", {
                  type: "button",
                  className: "ctxinj-row-grip",
                  title: "拖动排序（也可按 ↑ ↓ 调整）",
                  "aria-label": "拖动排序，或按上下方向键调整",
                  onClick: (e) => e.stopPropagation(),
                  onPointerDown: (e) => beginDrag(e, scope, c.id),
                  onKeyDown: (e) => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    e.stopPropagation();
                    moveBy(scope, c.id, e.key === "ArrowUp" ? -1 : 1);
                  },
                }, gripGlyph),
                React.createElement("button", { type: "button", className: "ctxinj-row-icon-btn", title: expanded ? "收起内容" : "查看完整内容", onClick: (e) => { e.stopPropagation(); setExpandedKey(expanded ? null : key); } },
                  React.createElement(expanded ? primitives.IconCloseOutlineMedium : primitives.IconInspectOutlineMedium, { size: 14 }),
                ),
                React.createElement("button", { type: "button", className: "ctxinj-row-icon-btn", title: editing ? "取消编辑" : "编辑", onClick: (e) => { e.stopPropagation(); if (editing) closeForm(); else openEdit(scope, c); } },
                  pencilGlyph,
                ),
                confirmKey === key
                  ? React.createElement("span", { className: "ctxinj-row-actions" },
                      React.createElement("button", { type: "button", className: "ctxinj-mini-btn ctxinj-mini-solid-danger", disabled: busyKey === key, onClick: (e) => { e.stopPropagation(); remove(scope, c.id); } }, busyKey === key ? "删除中…" : "确认删除"),
                      React.createElement("button", { type: "button", className: "ctxinj-mini-btn", onClick: (e) => { e.stopPropagation(); setConfirmKey(null); } }, "取消"),
                    )
                  : React.createElement("button", { type: "button", className: "ctxinj-row-icon-btn ctxinj-row-icon-danger", title: "删除", onClick: (e) => { e.stopPropagation(); setConfirmKey(key); } },
                      React.createElement(primitives.IconTrashOutlineMedium, { size: 14 }),
                    ),
              );
              const rowClassName = [
                "ctxinj-row",
                dragging ? "ctxinj-row-dragging" : "",
                editing ? "ctxinj-row-editing" : "",
              ].filter(Boolean).join(" ");
              return React.createElement("div", {
                key: key,
                className: rowClassName,
                "data-ctxinj-scope": scope,
                "data-ctxinj-id": c.id,
                // 勾选框自身的点击已由 onChange 处理；放行会与行点击双重触发、净效果为零
                onClick: (e) => {
                  if (suppressClickRef.current) return;
                  if (e.target instanceof HTMLInputElement) return;
                  toggle(scope, c.id, !selected);
                },
              },
                React.createElement("input", {
                  type: "checkbox",
                  className: "ctxinj-check",
                  checked: selected,
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
                  title: allSelected ? "取消勾选该组全部规则" : "勾选该组全部规则",
                  onClick: () => toggleSelectAll(scope),
                }, allSelected ? "取消全选" : "全选")
              : null,
            React.createElement("button", { type: "button", className: "ctxinj-mini-btn", onClick: () => { if (form !== null && form.id === null && form.scope === scope) { closeForm(); } else { openAdd(scope); } } }, "新增"),
          ),
          rows,
        );
      }

      const panel = React.createElement("div", {
        ref: panelRef,
        className: drag !== null ? "ctxinj-panel ctxinj-panel-dragging" : "ctxinj-panel",
        role: "dialog",
        "aria-label": "动态AGENTS.md",
        style: Object.assign(
          { visibility: panelPosition ? "visible" : "hidden" },
          maxPanelHeight ? { maxHeight: maxPanelHeight + "px" } : {},
          panelPosition || {},
        ),
      },
        React.createElement("div", { className: "ctxinj-head" },
          React.createElement("span", { className: "ctxinj-head-title" }, "动态AGENTS.md"),
          React.createElement("span", { className: "ctxinj-head-count" }, "共 " + String(count) + " 项"),
        ),
        error ? React.createElement("div", { className: "ctxinj-error" }, error) : null,
        loading
          ? React.createElement("div", { className: "ctxinj-status" }, "加载中…")
          : React.createElement("div", { className: "ctxinj-scroll", ref: scrollRef },
              renderGroup("global", "全局"),
              renderGroup("workspace", "当前工作区"),
            ),
        form !== null ? React.createElement("div", { className: "ctxinj-form" },
          React.createElement("div", { className: "ctxinj-group-head" },
            React.createElement("span", { className: "ctxinj-group-title" },
              form.id === null ? "新增到" + SCOPE_TITLES[form.scope] : "编辑" + SCOPE_TITLES[form.scope] + "规则"),
          ),
          React.createElement("input", {
            className: "ctxinj-input",
            placeholder: "规则名称（必填）",
            maxLength: 200,
            value: name,
            onChange: (e) => setName(e.target.value),
          }),
          React.createElement("textarea", { className: "ctxinj-textarea", placeholder: "规则内容（必填，将注入到会话上下文中）", value: content, onChange: (e) => setContent(e.target.value), rows: 4 }),
          React.createElement("div", { className: "ctxinj-form-actions" },
            React.createElement(primitives.Button, { type: "button", variant: "primary", size: "sm", disabled: saving, onClick: submitForm }, saving ? "保存中…" : form.id === null ? "保存" : "保存修改"),
            React.createElement(primitives.Button, { type: "button", variant: "ghost", size: "sm", onClick: closeForm }, "取消"),
          ),
        ) : null,
      );

      // 拖拽时 portal 到 body 的悬浮行副本：跟随指针，不被面板与滚动容器裁剪。
      const ghostData = drag === null || data === null ? null : data[drag.scope] || null;
      const ghostContext = ghostData === null ? null : ghostData.contexts.find((c) => c.id === drag.id) || null;
      const ghostSelected = ghostData !== null && ghostContext !== null && ghostData.selectedIds.includes(drag.id);
      const ghost = drag !== null && ghostContext !== null
        ? React.createElement("div", {
            ref: ghostRef,
            className: "ctxinj-row ctxinj-row-ghost",
            style: { left: drag.left + "px", top: drag.top + "px", width: drag.width + "px" },
            "aria-hidden": true,
          },
            React.createElement("input", {
              type: "checkbox",
              className: "ctxinj-check",
              checked: ghostSelected,
              readOnly: true,
              tabIndex: -1,
              "aria-hidden": true,
            }),
            React.createElement("span", { className: "ctxinj-row-main" },
              React.createElement("span", { className: "ctxinj-row-name" }, ghostContext.name),
              React.createElement("span", { className: "ctxinj-row-preview" }, ghostContext.content.replace(/\s+/g, " ").slice(0, 120)),
            ),
            // 静态操作图标，仅用于让悬浮副本与真实行视觉一致。
            React.createElement("span", { className: "ctxinj-row-actions" },
              React.createElement("span", { className: "ctxinj-row-grip" }, gripGlyph),
              React.createElement("span", { className: "ctxinj-row-icon-btn" }, React.createElement(primitives.IconInspectOutlineMedium, { size: 14 })),
              React.createElement("span", { className: "ctxinj-row-icon-btn" }, pencilGlyph),
              React.createElement("span", { className: "ctxinj-row-icon-btn ctxinj-row-icon-danger" }, React.createElement(primitives.IconTrashOutlineMedium, { size: 14 })),
            ),
          )
        : null;

      return React.createElement("div", { className: "ctxinj-root", ref: rootRef }, trigger,
        typeof ReactDOM.createPortal === "function"
          ? ReactDOM.createPortal(panel, document.body)
          : panel,
        ghost === null
          ? null
          : typeof ReactDOM.createPortal === "function"
            ? ReactDOM.createPortal(ghost, document.body)
            : ghost,
      );
    }

    /** Client 插件主体：注册空白会话 New Session 行的选项控件。 */
    function apply(ctx) {
      injectStyles();
      const slots = ctx.get("slots");
      if (slots === undefined) {
        console.warn("dynamic-agents: slots service unavailable — 动态AGENTS.md控件未注册");
        return;
      }
      // 只挂在空白会话的 New Session 行；会话开始后 Hero 行整体卸载，控件自然消失。
      // 规则在首次组装系统提示词时固定，控件本身没有额外的状态分支。
      slots.inject("conversation.hero.options", () => slots.register(
        { name: "conversation.hero.options", id: "ctx-inject", order: 100, label: "动态AGENTS.md" },
        (slotProps) => {
          const direct = typeof slotProps.sessionId === "string" ? slotProps.sessionId : "";
          const fromSession = slotProps.session && typeof slotProps.session === "object"
            ? (typeof slotProps.session.id === "string"
                ? slotProps.session.id
                : typeof slotProps.session.sessionId === "string"
                  ? slotProps.session.sessionId
                  : "")
            : "";
          const sessionId = direct || fromSession;
          if (!sessionId) return null;
          return React.createElement(ContextInjectView, { sessionId });
        },
      ));
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
