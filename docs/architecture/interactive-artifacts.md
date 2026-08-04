# Corepedia 交互制品架构

状态：设计提案
日期：2026-08-04
适用仓库：

- `Cypherrr0/corepedia`：内容、画板源文件和自定义网页源码的唯一事实源。
- `Cypherrr0/Cypherrr0.github.io`：校验、渲染、静态导出和 GitHub Pages 发布。

## 1. 决策摘要

Wiki 正文中的“画板”不应被定义成某一个固定 SDK，而应被定义成一种可扩展的 **交互制品（Interactive Artifact）**：

- `excalidraw` 是首个内置渲染器，负责手绘风格画板、流程图和自由布局。
- `h5` 是通用渲染器，接受作者自行实现并预先打包的网页，可承载小游戏、仿真器、数据探索器、WebGL 场景和未来尚未选定的 SDK。
- 正文只保存受控制品引用，不直接接受任意 `iframe`、`script` 或外部 URL。
- 每个制品都有一个独立网页路由；正文嵌入和“全屏打开”加载同一个渲染器网页，因此没有截图、SVG 转换或二次实现造成的保真度损失。
- 网页端“只读”指 **不能修改 Corepedia 内容或向服务端保存状态**，不限制读者在本地进行拖拽、缩放、点击、游戏和仿真。
- H5 合规不能靠静态扫描单独保证。发布门禁由 manifest 权限声明、构建期校验、浏览器冒烟测试和运行时 iframe 隔离共同组成。

推荐先实现：

1. Excalidraw 只读渲染；
2. 默认断网、无持久化的单文件 H5；
3. 通用 renderer registry；
4. Markdown 制品引用；
5. 构建期 fail-closed 校验。

不建议把 tldraw 作为首发依赖。它的定制能力很强，但当前 SDK 默认许可证只允许开发环境，公开生产使用需要有效的 hobby、trial 或 commercial license key。Excalidraw 使用 MIT 许可证，更符合当前公开静态站。

## 2. 当前架构约束

网站当前使用：

- Next.js `16.2.2` App Router；
- React `19.2.4`；
- `output: "export"` 静态导出；
- GitHub Pages 托管；
- 构建时通过 `COREPEDIA_WIKI_PATH` 读取私有 Corepedia checkout；
- `unified + remark + rehype` 将 Markdown 转换为 HTML；
- 只发布 `wikis/tech`、`wikis/writing` 和 `wikis/learning`；
- 内容哈希媒体路由发布被正文引用的本地图片；
- 页面正文目前通过 `dangerouslySetInnerHTML` 渲染构建期生成的 HTML。

当前媒体安全边界是正确的：

- Markdown 不执行原始 HTML；
- SVG 会拒绝 `script`、`iframe`、`object`、事件处理器和远程引用；
- 私有域名链接不会直接暴露；
- 不应为了画板支持而放开全局 `rehype-raw` 或允许正文任意写入 `iframe`。

因此，交互制品必须是一个窄接口，而不是“允许 Markdown 执行 HTML”。

### 2.1 威胁模型

v1 面向 **本人编写、保留源码、经过审查的制品**。门禁主要防止误配置、意外联网、依赖漂移、越权 API 和明显危险代码进入公开站点。

它不承诺把任意第三方或主动恶意 JavaScript 自动证明为安全。浏览器 sandbox、CSP、静态扫描和有限时长的动态测试都是纵深防御，不能替代代码来源信任与人工审查。

因此：

- 第三方 H5 不得直接复制进 Corepedia 后发布；
- 必须能追溯源码、依赖 lockfile 和构建方式；
- 无法审查或来源不明的制品只能保存 preview，不能执行；
- 若未来需要运行低信任代码，应使用独立 runtime origin、真实 HTTP 安全响应头和更强的网络出口控制，不能继续依赖 GitHub Pages 同源路径；
- 合规状态表示“满足当前发布策略”，不表示“对任意恶意代码形成数学或形式化安全证明”。

## 3. 最高保真方案

### 3.1 选择 H5，而不是转换格式

这里的 H5 指一个浏览器原生网页制品。它可以在内部使用：

- DOM、CSS 和 JavaScript；
- Canvas 2D；
- SVG；
- WebGL / WebGPU；
- WebAssembly；
- Web Worker；
- React、Vue、Svelte、Three.js、PixiJS、Phaser 或任意未来 SDK。

作者使用什么框架不属于发布协议。发布协议只消费打包后的网页制品。

这是最高保真方案，因为：

- 不把交互内容转换成图片、视频或 SVG；
- 不在正文中重新实现一遍交互；
- 独立页面和正文使用同一个 `/artifacts/<id>/embed/`；
- 两处只改变 viewport 尺寸，不改变业务代码、状态机或渲染逻辑。

### 3.2 路由模型

每个通过校验的制品生成两个静态路由：

```text
/artifacts/<id>/         # 阅读器外壳：标题、说明、全屏画布、返回正文
/artifacts/<id>/embed/   # 唯一渲染器网页：供正文和独立页共同加载
```

正文和独立页都使用：

```html
<iframe src="/artifacts/<id>/embed/"></iframe>
```

独立页不是直接打开作者提交的原始 `index.html`。否则用户可以绕过 iframe 沙箱。原始 H5 会被编码为静态数据，由受控运行器加载到内层 sandbox iframe。

### 3.3 渲染器注册表

前端维护一个固定注册表，而 Markdown 和 Corepedia 不依赖具体 React 组件：

```ts
type ArtifactKind = "excalidraw" | "h5";

type ArtifactRenderer = {
  kind: ArtifactKind;
  validate: (artifact: ArtifactSource) => ValidationResult;
  render: React.ComponentType<ArtifactRenderProps>;
};
```

以后增加 `react-flow`、`three-scene`、`observable` 或其他优化渲染器时，只增加注册项，不改变正文引用语法和仓储边界。

任何未识别的 `kind` 都必须校验失败，不能回退成任意 HTML。

## 4. Corepedia 存储设计

### 4.1 默认使用页面 sidecar

画板首先属于一篇知识页，应和页面共同移动。沿用现有 `cover` sidecar 规则：

```text
wikis/tech/llm/agent-loop.md
wikis/tech/llm/agent-loop/
├── cover.png
└── artifacts/
    ├── overview/
    │   ├── artifact.json
    │   ├── scene.excalidraw
    │   └── preview.png
    └── scheduler-game/
        ├── artifact.json
        ├── preview.png
        ├── source/
        │   ├── package.json
        │   ├── package-lock.json
        │   └── src/
        └── dist/
            └── index.html
```

规则：

- `artifact.json` 是稳定接口；
- `preview.png` 是 Obsidian、无 JavaScript、打印、分享卡片和加载失败时的降级内容；
- Excalidraw 保存原生 `.excalidraw` JSON，不保存不可编辑的导出图作为主文件；
- 自写网页源码和 lockfile 保存在 `source/`；
- 网站只读取预先生成的 `dist/index.html`，绝不在网站部署任务中执行制品自己的 `npm install`、`postinstall` 或 build script；
- `node_modules`、缓存和开发服务器产物不得进入仓库。

未来若一个制品被多篇页面复用，可增加 `wikis/artifacts/<id>/` 共享目录；v1 不需要先引入全局资产库。

### 4.2 Manifest

建议 `artifact.json` v1：

```json
{
  "schemaVersion": 1,
  "id": "agent-loop-overview",
  "kind": "excalidraw",
  "title": "Agent Loop Overview",
  "description": "展示模型、工具、状态与评估器之间的循环。",
  "entry": "scene.excalidraw",
  "preview": "preview.png",
  "aspectRatio": "16 / 10",
  "height": {
    "inline": 560,
    "stage": 820
  },
  "activation": "visible",
  "capabilities": [],
  "network": []
}
```

H5 游戏示例：

```json
{
  "schemaVersion": 1,
  "id": "scheduler-game",
  "kind": "h5",
  "title": "Scheduler Game",
  "description": "通过本地交互理解调度和资源竞争。",
  "entry": "dist/index.html",
  "preview": "preview.png",
  "aspectRatio": "16 / 9",
  "height": {
    "inline": 520,
    "stage": 860
  },
  "activation": "click",
  "capabilities": ["fullscreen", "pointer-lock", "worker", "wasm"],
  "network": []
}
```

约束：

- `id` 全站唯一，发布后不随标题变化；
- 所有路径必须相对 manifest，解析后仍位于该制品目录；
- `network` 默认且优先保持空数组；
- 能力采用显式 allowlist，未知能力直接失败；
- `description` 和 `preview` 必填，交互不能成为正文唯一的信息载体。

## 5. Markdown 嵌入协议

推荐使用受控 fenced block：

````md
```artifact
id: agent-loop-overview
```
````

选择它的原因：

- 不打开原始 HTML；
- 不与图片、代码或 Obsidian wikilink 混淆；
- `remark` 能稳定识别 fenced code 节点；
- 未安装网站渲染器时，Markdown 仍能以可读文本暴露制品 ID；
- 将来可增加少量展示参数，但不能在正文覆盖安全权限。

允许的正文参数应保持很少：

```text
id       必填，只能引用已经校验的制品
caption  可选，覆盖正文下方图注
height   可选，只能在 manifest 声明的安全范围内调整
```

`kind`、`entry`、`network`、`capabilities` 和 sandbox 权限不能由正文传入。

渲染流程：

1. remark 插件识别 `artifact` code block；
2. 根据页面路径和 registry 解析制品 ID；
3. 生成受控 `<figure>`、标题、预览和 iframe；
4. 若制品不存在或未通过校验，构建失败，不回退执行正文内容。

## 6. Excalidraw 内置渲染器

采用 `@excalidraw/excalidraw` 自托管 React 组件，而不是嵌入 `excalidraw.com`：

- `viewModeEnabled={true}` 强制只读；
- 允许平移、缩放、选择链接和全屏；
- 隐藏编辑工具、库、保存、协作和导出入口；
- `initialData` 从 Corepedia 的 `.excalidraw` 文件读取；
- 动态导入 SDK，只在 Excalidraw 制品路由加载，避免把大型依赖加入普通 Wiki 首屏；
- 固定 SDK 版本和 lockfile；
- 不上传 scene 到第三方服务。

Excalidraw 自身支持 embeddable 元素，但首版应遵循：

- 不接受 scene 中任意 `http(s)` iframe；
- `validateEmbeddable` 默认拒绝；
- 后续只允许 `artifact:<id>` 内部引用；
- 通过 `renderEmbeddable` 把内部引用交回 Corepedia 的 H5 运行器。

这样未来可以在 Excalidraw 画板里嵌入一个经过校验的小游戏或仿真器，而不是放开任意网站。

## 7. 通用 H5 运行器

### 7.1 作者侧

作者可以使用任意技术栈开发。发布前只需要产出一个自包含的 `dist/index.html`：

- JavaScript、CSS、字体和小型媒体尽量内联；
- 不依赖 CDN；
- 不要求网站仓库安装作者选用的 SDK；
- 可通过 Vite、Webpack、esbuild 或自定义脚本生成；
- 复杂项目保留源码和 lockfile，保证可重建。

单文件是 v1 的发布协议，不是作者侧技术限制。它显著简化内容寻址、离线运行、CSP 和路径安全。

### 7.2 发布侧

部署时不把 `dist/index.html` 原样复制到公开目录：

1. 校验器读取并规范化 HTML；
2. 生成内容哈希；
3. 将 HTML 作为 JSON / Base64 数据发布；
4. 受控 `H5ArtifactRunner` 读取数据；
5. runner 注入固定 CSP 后，通过 `srcdoc` 加载到内层 iframe；
6. 内层 iframe 使用 `sandbox`，默认只授予 `allow-scripts`，不授予 `allow-same-origin`。

因此作者脚本在 opaque origin 中运行，不能读取站点 cookie、localStorage、父页面 DOM 或注册同源 Service Worker。

GitHub Pages 不能为单个制品配置完整的自定义响应头。Tier A 依赖规范化后的 meta CSP、iframe sandbox 和浏览器测试，适合受信作者的离线制品；需要严格 HTTP CSP、`Permissions-Policy` 或更强网络控制时必须升级到 Tier B。

### 7.3 默认 CSP

概念上的默认策略：

```text
default-src 'none'
script-src 'unsafe-inline' blob:
style-src 'unsafe-inline'
img-src data: blob:
font-src data:
media-src data: blob:
connect-src 'none'
worker-src 'none'
frame-src 'none'
object-src 'none'
base-uri 'none'
form-action 'none'
```

声明 `worker`、`wasm` 等能力时，生成器只放宽对应指令。网络能力不是首版默认能力。

### 7.4 权限模型

默认拒绝：

- 网络请求和 WebSocket；
- cookie、localStorage、IndexedDB；
- Service Worker；
- camera、microphone、geolocation；
- clipboard read/write；
- popup、top navigation 和外部协议；
- form submit、payment、USB、Bluetooth、Serial；
- download；
- 父页面 DOM 访问。

按 manifest 可批准：

- `fullscreen`；
- `pointer-lock`；
- `worker`；
- `wasm`；
- `audio`，但仍服从浏览器的用户手势限制。

若未来确实需要联网、跨源隔离、多文件资源或持久化，应启用第二运行等级：

```text
Tier A: opaque-srcdoc
  当前默认。GitHub Pages 可用，离线、最小权限，覆盖大多数画板和小游戏。

Tier B: isolated-origin
  部署到独立 origin，并配置真实 HTTP CSP / Permissions-Policy。
  用于获批网络、复杂 WASM、跨源隔离或大资源场景。
```

不能在主站同源页面上同时授予作者脚本 `allow-scripts` 和 `allow-same-origin`。MDN 明确警告这种组合会使 sandbox 失去安全意义。

## 8. Host Bridge

H5 与宿主只通过版本化 `postMessage` 协议通信：

```ts
type HostToArtifact =
  | { type: "corepedia:init"; version: 1; theme: "paper"; locale: "zh-CN" }
  | { type: "corepedia:visibility"; visible: boolean }
  | { type: "corepedia:motion"; reduced: boolean };

type ArtifactToHost =
  | { type: "artifact:ready"; version: 1 }
  | { type: "artifact:resize"; height: number }
  | { type: "artifact:request-fullscreen" }
  | { type: "artifact:error"; message: string };
```

宿主必须校验：

- `event.source` 是当前 iframe；
- 消息 type 和字段符合 schema；
- 高度在 manifest 限制内；
- 消息不能携带 HTML、函数或可执行代码；
- fullscreen 仍要求真实用户手势。

不提供“写回 Corepedia”消息。以后若支持读者个人进度，只能由宿主提供命名空间化、限额和可清除的本地存储桥，不能变成内容修改 API。

## 9. 合规校验

### 9.1 静态门禁

所有制品在静态导出前检查：

- manifest schema、版本、ID 唯一性；
- 引用页面是否属于公开 roots；
- 路径穿越和 symlink 逃逸；
- entry、preview 和声明文件是否存在；
- 文件数量、单文件大小和总包大小；
- HTML 禁止 `<base>`、meta refresh、form 和嵌套远程 iframe；
- JavaScript 禁止 Service Worker、`window.open`、`top`、`opener`、cookie 和未批准存储 API；
- 外部 script、stylesheet、font、image 和动态 import；
- `eval`、`new Function` 等动态代码执行必须有明确策略，默认拒绝；
- Excalidraw JSON 结构、元素数量、嵌入 URL 和资源大小；
- 预览图尺寸和可解码性。

静态扫描负责尽早发现违规和误用，但不把它描述为恶意 JavaScript 的安全边界。

### 9.2 浏览器门禁

用 Playwright 对每个新或变更制品执行：

- 独立路由和 embed 路由都能加载；
- 规定时间内发送 `artifact:ready`；
- 无未处理异常和严重 console error；
- 默认网络模式下没有外部请求；
- 不能读取父页面 DOM 和站点存储；
- 不能发生 top navigation、popup 或下载；
- iframe 能响应 resize 和 visibility；
- 键盘可进入和退出，Esc 可解除 pointer lock / fullscreen；
- `prefers-reduced-motion` 下没有强制连续动画；
- 桌面和移动 viewport 截图可读；
- bundle 和启动时间没有超过预算。

安全策略违规应 fail closed：本次部署失败，线上继续保留上一版站点。

“没有外部请求”是对受审代码和测试覆盖范围的发布约束，不是对恶意 JavaScript 的绝对证明。测试必须覆盖 iframe 自导航等绕过路径；检测到导航离开 `srcdoc`、未知资源请求或未声明 origin 时立即终止制品并使构建失败。

### 9.3 运行时防护

- H5 始终在内层 sandbox 中；
- `loading="lazy"`；
- 默认 `activation: "click"` 或进入 viewport 后才启动；
- 页面不可见时发送 pause / visibility 消息；
- 同一正文只允许一个高负载制品活跃；
- 错误时显示 preview、说明和“无法加载交互版本”，不显示空白框。

## 10. 构建与跨仓读取

目标链路：

```text
Corepedia commit
  -> Corepedia workflow 校验引用并发送 repository_dispatch
  -> 网站 workflow 临时 checkout 两个仓库
  -> 扫描公开 Markdown 中的 artifact 引用
  -> 只收集被公开页面引用的制品
  -> 运行静态和浏览器合规门禁
  -> 生成 artifact registry、哈希数据和静态路由
  -> next build
  -> GitHub Pages
```

重要边界：

- 网站仓库不复制或提交 Corepedia 内容；
- CI checkout 是临时的；
- 未被公开页面引用的制品不发布；
- 不从 `sources`、`ideas`、`logs` 或 `fragments` 自动发布制品；
- 站点没有 Corepedia 写 token；
- 制品构建不在持有 GitHub App 私钥或写权限的步骤执行；
- 网站 CI 只安装前端仓库 lockfile 中固定的依赖。

当前网站 workflow 已监听 `repository_dispatch: corepedia-updated`。Corepedia 当前分支没有对应 workflow，因此实现阶段需要补上发送 dispatch 的一侧，否则内容提交后不会自动触发网站重建。

## 11. 前端代码边界

建议新增：

```text
app/artifacts/[artifactId]/page.tsx
app/artifacts/[artifactId]/embed/page.tsx
components/artifacts/artifact-frame.tsx
components/artifacts/excalidraw-renderer.tsx
components/artifacts/h5-artifact-runner.tsx
lib/artifacts/catalog.ts
lib/artifacts/schema.ts
lib/artifacts/validate.ts
lib/artifacts/markdown-plugin.ts
scripts/validate-artifacts.mjs
```

现有 `lib/wiki.ts` 继续负责页面、链接、公式和媒体。制品扫描与策略放在 `lib/artifacts`，避免把一个文件继续扩大成所有内容类型的总入口。

普通 Wiki 页面仍是 Server Component。只有 artifact frame 和具体 renderer 是 Client Component。Excalidraw 使用 client-side dynamic import，普通文章不加载 SDK。

## 12. SDK 调研结论

数据为 2026-08-04 快照：

| 方案 | GitHub stars | 许可证 | 只读 | 自定义能力 | 结论 |
|---|---:|---|---|---|---|
| Excalidraw | 128,930 | MIT | 原生 `viewModeEnabled` | 自由画板强，业务节点中等 | 首发内置 |
| tldraw | 49,576 | 自定义 tldraw license | 原生 readonly | 无限画布与 custom shape 最强 | 技术优秀，但生产需 license key |
| React Flow / XYFlow | 37,904 | MIT | 可关闭拖拽、连线和选择 | 结构化节点、流程和应用 UI 强 | 后续内置，或先通过 H5 使用 |
| LogicFlow | 11,617 | Apache-2.0 | 可配置 | 业务流程、ER、UML 强 | 中文生态备选 |
| draw.io | 7,280 | Apache-2.0 | viewer / embed | 通用图表丰富 | 更适合兼容导入，不匹配首发视觉 |
| AntV X6 | 6,649 | MIT | 可配置 | SVG/HTML 节点和业务图编辑强 | 企业流程备选 |

最终选择不是“只用 Excalidraw”：

```text
内置视觉画板：Excalidraw
通用能力底座：受控 H5
未来结构化图：React Flow renderer（按实际内容需要再增加）
```

H5 底座使未来选择 SDK 不再是架构迁移，只是某个制品的作者侧实现或新的优化 renderer。

## 13. 分阶段实施

### Phase 1：协议与最小闭环

- 定义 manifest schema 和 fenced block；
- 扫描公开页面引用；
- 生成 registry 和两类静态路由；
- 实现 preview fallback；
- 增加 Corepedia -> website dispatch；
- 用一个最小 H5 验证双仓静态发布。

### Phase 2：Excalidraw

- 安装并固定 `@excalidraw/excalidraw`；
- 动态加载、只读 UI、主题适配；
- scene / files 校验；
- 导出或更新 preview；
- 桌面、移动和 reduced motion 验证。

### Phase 3：通用 H5 沙箱

- 单文件 pack 规范；
- srcdoc runner、CSP、Permissions Policy 和 sandbox；
- postMessage bridge；
- Playwright 网络、逃逸和交互测试；
- 示例小游戏验证 Canvas、键盘、音频和 fullscreen。

### Phase 4：能力扩展

- Excalidraw 内嵌 `artifact:<id>`；
- React Flow 优化 renderer；
- 按需建设独立 runtime origin；
- 大资源、WASM 和批准网络能力；
- 制品模板、脚手架和本地预览命令。

## 14. 验收标准

首个版本完成时应同时满足：

1. 同一制品在正文和独立页的渲染逻辑完全相同；
2. Excalidraw 可平移、缩放和全屏，但不能编辑或保存；
3. 自写小游戏可以运行并保持本地临时状态；
4. H5 无法访问父 DOM 或站点存储，受审制品在默认策略下不产生外部网络请求；
5. Markdown 不能直接注入 `script` 或任意 iframe；
6. 未通过校验的制品不会进入 Pages artifact；
7. 无 JavaScript、打印和加载失败时都有 preview 和文字说明；
8. 普通 Wiki 页面不会下载 Excalidraw 或 H5 runtime；
9. Corepedia 是唯一内容源，网站仓库仍只保存展示与发布代码；
10. 新增 renderer 不需要修改现有 Markdown 协议。

## 15. 参考

- Excalidraw React API props：<https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/>
- Excalidraw repository：<https://github.com/excalidraw/excalidraw>
- tldraw read-only example：<https://tldraw.dev/examples/readonly>
- tldraw license：<https://tldraw.dev/community/license>
- React Flow API：<https://reactflow.dev/api-reference/react-flow>
- MDN iframe sandbox：<https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe>
- MDN CSP sandbox：<https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox>
- Next.js static export：`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`
- Next.js lazy loading：`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`
