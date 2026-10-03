# 项目地图

[English](README.md) · **简体中文**

`project-map-kit` 把仓库中的 LikeC4 模型、项目配置、状态记录和可选 Mermaid 状态图构建成可离线浏览的静态 Project Map。构建和浏览过程不调用 LLM，不连接远程 API，也不会自动上传仓库或生成的网站。

仓库内附带两套完全虚构的示例：“观察笔记”展示 3 个领域、3 个层级、6 个模块和 1 条流程；“包裹实验室”展示 2 个领域、2 个层级、5 个模块、2 条流程和 1 张状态图。示例状态和证据均明确标记为虚构数据。两套示例各有中英文版本。

![项目地图操作演示 · 中文版](docs/images/demo-zh-CN.gif)

*动图来自真实页面操作：总览 → 模块详情 → 业务链路 → 开发状态。[查看静态总览](docs/images/overview-zh-CN.jpg)。*

## 快速开始

需要 Node.js 22.22.3 或更高版本。在下载的仓库根目录安装锁定依赖并构建双项目演示：

```bash
npm ci
npm run browser:install
npm run build:demo
npm run preview
```

预览命令启动本地静态服务器：

- 中文版：http://127.0.0.1:5191/zh-CN/?project=field-notes
- 英文版：http://127.0.0.1:5191/?project=field-notes

两版均包含同样的两个虚构项目，界面与项目文案保持一致语言。`npm run build:demo` 依次构建英文与中文；单独重建英文会替换整个输出目录，之后需运行 `npm run build:demo:zh` 恢复中文版。

## 初始化独立模型

目标目录必须为空。`init` 会把 `examples/field-notes` 的完整内容复制进去，作为可直接修改的模板：

```bash
mkdir ../my-project-map
npm exec -- project-map init --dir ../my-project-map
npm exec -- project-map validate --root ../my-project-map
npm exec -- project-map build --root ../my-project-map --out dist/project-map
npm exec -- project-map serve --dir ../my-project-map/dist/project-map --port 5191
```

初始化默认复制英文示例。使用中文版时，将 `examples/field-notes-zh/` 的完整内容复制到一个空目录，再运行相同的校验与构建命令。也可以使用 `node bin/project-map.mjs` 加同样参数。

## 接入外部仓库

先把本包作为外部仓库的开发依赖安装，再在外部仓库根目录放置 `project-map.json`。manifest 中的项目 JSON 路径相对 manifest 文件；项目配置中的模型、状态、证据和状态图路径相对该项目的 `project.json`。

```bash
npm install --save-dev ../project-map
npm exec -- project-map validate --root . --config project-map.json
npm exec -- project-map build --root . --config project-map.json --out dist/project-map
npm exec -- project-map serve --dir dist/project-map --port 5191
```

上面的安装路径按工具包实际位置调整。详细字段和路径规则见 [配置格式](docs/configuration.md)。可将完整的 `skills/project-map/` 文件夹复制到目标仓库的 `.agents/skills/project-map/`，或让 Agent 直接读取其中的 [SKILL.md](skills/project-map/SKILL.md)。

接入提示词示例：

> 使用 Project Map Skill 阅读当前项目的正式文档与相关代码，建立真实的领域、模块、关系和核心流程。复用工具包 UI，所有业务信息写入模型与配置；无法确认的内容标记 NEEDS_CONFIRMATION，缺少状态记录则保持未记录。保留来源，运行校验并构建本地预览，不修改业务代码、不发布站点。

运行 `npm test` 检查模型、CLI、路径边界、静态服务器与打包清单。当前验证范围见 [验证记录](docs/VALIDATION.md)。

## 命令

```text
project-map init --dir <emptyDir>
project-map validate --root <workspace> [--config project-map.json]
project-map build --root <workspace> [--config project-map.json] [--out dist/project-map]
project-map serve --dir <built> [--port 5191]
```

- `init` 只写入指定的空目录。
- `validate` 解析并检查输入，不生成静态站点。
- `build` 生成可离线托管的静态目录。
- `serve` 只服务已经构建的目录。

## 语言与当前边界

项目配置的 `locale` 支持 `zh-CN` 和 `en`，控制通用界面文案，不会自动翻译业务数据。领域、模块、流程、状态、证据和状态图应使用对应语言编写，稳定 ID 与文件路径保持不变。中文示例使用独立 manifest `examples/project-map.zh-CN.json`；生成页面的初始语言也与所选版本一致。第三方 LikeC4 技术查看器的内置工具栏仍由上游维护，本文截图仅展示本工具的单语总览。

- 配置文件当前只支持 JSON。
- LikeC4 动态视图只支持简单、线性的步骤列表；`parallel`、`loop` 等复杂 control block 尚不支持。
- Mermaid 只用于本地状态图源文件；含 Mermaid 状态图的 `validate` 和 `build` 使用本机 Chromium 完整渲染校验，先运行 `npm run browser:install`。
- 运行时没有 LLM、远程数据读取或自动仓库上传。
- 静态产物会包含项目名称、模块说明、流程文本、状态记录、证据路径以及 LikeC4 技术视图中的显式模型文本。构建成功不代表适合公开发布；发布前应由用户检查产物并明确选择发布范围。

本项目使用 MIT 许可证，见 [LICENSE](LICENSE)。直接依赖的许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
