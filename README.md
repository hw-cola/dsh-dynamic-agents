# @dsh/dynamic-agents

DSH Web 动态上下文插件：在聊天输入框上方 Dock 提供「动态AGENTS.md」下拉多选控件，按全局/工作区维护可勾选的上下文规则，注入会话系统提示。

## 功能

### 功能一：输入框上方的上下文多选控件

输入框上方 Dock 常驻一个「动态AGENTS.md」下拉按钮，始终可见（会话开始前、中、后均不消失），并显示当前已勾选数量徽标：

- 面板分「全局」与「当前工作区」两组，各自支持勾选、新增、删除（二次确认）、查看完整内容；
- 新增规则需填写名称与内容，名称保存后即注入会话系统提示，无需重启；
- 面板自适应定位：窗口缩放、滚动或内容变化时自动保持在视口内，手机端下同样可用。

### 功能二：两级规则库（全局共享 + 工作区独立）

- **全局规则库**：`~/.dsh/dynamic-agents.json`（`$DSH_HOME` 环境变量优先），所有工作区共享的规则定义，不含勾选状态；
- **工作区规则库**：`<工作区>/.dsh/dynamic-agents.json`，存放该工作区的规则、勾选状态与会话解锁状态；
- 全局规则的勾选也由工作区文件控制（全局规则 id 带 `g-` 前缀），因此不同工作区可以各自勾选不同的全局规则；
- 新增到全局库的规则会自动勾选到当前工作区；删除全局规则后，各工作区的残留勾选自动失效，不会残留无效引用。

### 功能三：勾选规则注入会话系统提示

- 勾选内容按「全局在前、工作区在后」的顺序合并，以 `## 规则名` + 规则内容的形式注入会话系统提示；
- 同工作区的新会话自动沿用上次勾选结果；
- 会话首个回合开始前会等待配置加载完成，避免首回合漏注入。

### 功能四：会话开始后锁定编辑

- 会话已有聊天记录后，控件保持显示但进入锁定态：勾选、新增、删除均不可操作，以保证会话系统提示缓存命中率；
- 解锁需二次确认（会提示可能影响缓存命中率）；解锁状态按会话持久化，可随时重新锁定；
- 刷新页面或切换会话不影响锁定状态。

## 安装

前置要求：本机已安装 [dsh](https://github.com/deepseek-ai/deepseek-harness) 与 [pnpm](https://pnpm.io/)（`dsh plugin` 通过 pnpm 安装插件）。

### GitHub 直装

```sh
dsh plugin --profile web add "git+https://github.com/hw-cola/dsh-dynamic-agents.git"
```

钉到指定版本（按 tag 锁定）：

```sh
dsh plugin --profile web add "git+https://github.com/hw-cola/dsh-dynamic-agents.git#v1.0.0"
```

### 本地开发

```sh
dsh plugin --profile web add "link:${PATH}/dsh-dynamic-agents"
```

> `${PATH}`为下载源码的路径

## 更新

```sh
dsh plugin --profile web update @dsh/dynamic-agents
```

若 pnpm 对 git 依赖的更新不生效，先卸载再重新安装：

```sh
dsh plugin --profile web remove @dsh/dynamic-agents
dsh plugin --profile web add "git+https://github.com/hw-cola/dsh-dynamic-agents.git"
```

## 卸载

```sh
dsh plugin --profile web remove @dsh/dynamic-agents
```

安装后请重启 `dsh web`（让插件的 cordis 补丁层生效）并刷新浏览器页面；卸载后刷新页面即可恢复原生布局。

> 卸载不会自动删除数据文件：全局规则库（`~/.dsh/dynamic-agents.json`）与工作区规则库（`<工作区>/.dsh/dynamic-agents.json`）需手动清理。

> 兼容性：插件在 DSH `0.1.1-rc.2` 上开发测试。客户端 API 仍在迭代，DSH 大版本升级后若功能异常，请检查本仓库是否有对应适配版本。