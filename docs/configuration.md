# 配置格式

Project Map 使用一份 manifest 聚合一个或多个项目。配置文件当前只支持 JSON；所有路径必须是相对路径，不能逃出 `--root` 指定的工作区。

## Manifest

默认 manifest 是工作区根目录下的 `project-map.json`：

```json
{
  "projects": [
    "field-notes/project.json",
    "dispatch/project.json"
  ]
}
```

`projects` 中的路径相对 manifest 所在目录。项目 `id` 必须唯一，并匹配 `^[a-z][a-z0-9-]*$`。建议把 LikeC4 文件放在项目目录的 `architecture/` 子目录，并把生成目录放在 `dist/`，避免构建产物被当作模型输入。

## 项目配置

每个 `project.json` 描述展示信息、模型入口和展示映射。下面是精简结构；可运行的完整配置见 `examples/field-notes/project.json`。

```json
{
  "id": "field-notes",
  "name": "Field Notes",
  "observedAt": "2026-01-15",
  "modelPath": "architecture",
  "likec4Project": "fieldnotes",
  "domainKind": "area",
  "domainPresentation": {
    "collect": {"color": "#2875e8", "icon": "clipboard", "order": 0}
  },
  "layers": [
    {"id": "touchpoint", "label": "Touchpoint", "description": "User-facing", "kinds": ["interface"]}
  ],
  "statusPath": "status.json",
  "flows": [
    {"viewId": "note_to_digest", "title": "Note to digest", "scope": "Example", "conclusion": "No real acceptance recorded."}
  ],
  "states": []
}
```

路径解析规则统一如下：

- `modelPath` 和 `statusPath` 相对当前 `project.json`。
- `states[].sourcePath` 相对当前 `project.json`，当前接受 Mermaid `.mmd` 源文件。
- `recentWork.source.path`、`status.json` 中的 `evidence[].path`，以及 LikeC4 `metadata { source '...' }` 内用分号分隔的每个路径，都相对当前 `project.json`。
- 路径可以带 `#标题` 或 `:符号名` 定位提示；验证文件存在时只检查前面的文件部分。
- 路径不得包含 `..` 段；证据与状态资源必须留在对应 `project.json` 所在目录内。模型目录内不允许符号链接，避免构建时读取目录以外的模型。LikeC4 配置应只使用自己信任的本地文件。

常用字段：

| 字段 | 含义 |
| --- | --- |
| `id`, `name` | 稳定机器 ID 和展示名称 |
| `subtitle`, `scope`, `notice` | 项目说明与展示范围 |
| `observedAt` | 状态记录所对应的观察日期，不是构建时间 |
| `modelPath`, `likec4Project` | LikeC4 项目目录与项目名 |
| `domainKind` | 作为矩阵领域的 LikeC4 element kind |
| `domainPresentation` | 领域颜色、图标和顺序；颜色为 6 位十六进制 |
| `layers` | 展示层以及对应的 LikeC4 element kinds |
| `modulePresentation` | 可选的模块标题、摘要或 `layerId` 覆盖 |
| `overviewModuleIds` | 默认矩阵范围；省略时包含全部模块 |
| `scopeGroups` | 为模块赋予项目自定义范围标签 |
| `statuses` | 状态词典；只定义显示含义，不推导进度 |
| `statusPath` | 模块状态 JSON |
| `flows` | 要展示的 LikeC4 view；动态视图显示为顺序流程 |
| `states` | Mermaid 状态图源与关联模块 |
| `recentWork` | 可选的近期工作说明及来源 |

`gapKinds`、`gapRelationKinds` 和 `gapMarkers` 可标记已由项目事实源明确记录的缺口。不要为了让地图显得完整而新增关系、状态或缺口结论。

## LikeC4 模型

领域必须使用 `domainKind` 指定的 kind。模块 ID 由 LikeC4 的嵌套 ID 产生，例如 `collect.notebook`；项目配置中的模块引用必须与之完全一致。模块应放在领域内，关系端点和 flow view 应引用模块，不应只引用领域。

动态视图当前只支持简单的步骤列表。构建会保留重复调用及源码顺序，但不支持 `parallel`、`loop` 等复杂 control block。普通 view 表示关系集合，不暗示时间顺序。

模型来源可写在元素 metadata 中：

```likec4
notebook = interface 'Notebook' {
  metadata { source 'docs/notebook.md; src/notebook.js:save' }
}
```

这些路径会进入静态产物，因此应使用仓库相对路径并在发布前检查敏感信息。

## 状态记录

`status.json` 的根对象包含 `modules` 数组：

```json
{
  "modules": [
    {
      "moduleId": "collect.notebook",
      "phase": "reviewed",
      "summary": "Observed status summary.",
      "blockers": [],
      "work": [],
      "acceptance": [
        {"title": "Walkthrough", "result": "not_run"}
      ],
      "evidence": [
        {
          "title": "Review note",
          "path": "docs/review.md",
          "recordedAt": "2026-01-15",
          "scope": "Manual walkthrough only"
        }
      ]
    }
  ]
}
```

`phase` 必须来自项目的 `statuses`。`acceptance[].result` 只能是 `passed`、`failed` 或 `not_run`。没有记录的模块应省略状态记录，展示层会将其视为“未记录”，不会推断为“未开始”。空 `acceptance` 表示尚未定义验收项；不要把空列表换算成百分比。每条 evidence 必须包含标题、存在的相对路径、记录日期和适用范围。

## Mermaid 状态图

```json
{
  "states": [
    {
      "id": "parcel",
      "title": "Parcel states",
      "description": "Local state model",
      "moduleIds": ["intake.queue", "routing.planner"],
      "sourcePath": "states/parcel.mmd"
    }
  ]
}
```

状态图 ID 只能包含字母、数字、下划线和连字符。构建器会从本地 Mermaid 源生成静态 SVG，并把它与列出的模块关联。含 Mermaid 状态图的 `validate` 和 `build` 都会通过本机 Chromium 做完整渲染校验；首次使用前运行工具包的 `npm run browser:install`。`validate` 的渲染结果只存在于临时目录，不生成站点。状态图只表达模型中已确认的状态，不应从代码命名或界面截图猜测业务规则。

也可用 `assetPath` 指向预先绘制的本地 SVG，与 `sourcePath` 二选一。预制 SVG 仅支持被动图形：不含脚本、事件处理、HTML foreignObject、样式块/属性、动画或外部资源引用；复杂状态图请提供 `.mmd`。程序生成的 Mermaid 图在禁网的隔离浏览器中以 strict 模式渲染。
