# NixelLauncher 协作入口

开始修改前阅读 [README.md](README.md)。当前只搭建基础 Electron 脚手架，以下产品方向尚未实现：

- Electron、React、HeroUI、Cordis；面向 Windows、macOS、Linux 的 Minecraft Java 版玩家。
- 参考 DeepSeek Harness 的插件组合架构；后端可信插件计划运行在独立 Host 进程，默认界面可由插件替换。
- 独立实例、本地优先；业务插件全局安装启用，实例分别选择服务提供者与配置。

## 开发

- 现有目录为 `src/main`、`src/preload`、`src/renderer`。后续按明确的功能请求扩展，不预建业务模块。
- 使用 HeroUI v3 API。渲染端通过 preload 桥接，保持 context isolation 与关闭 Node integration。
- 基础检查为 `pnpm typecheck`、`pnpm lint`；按任务需要构建或运行，不默认添加完整测试与打包流程。

## 提交信息

生成标题或准备已授权的提交时，阅读 [nixel-commit-msg](.agents/skills/nixel-commit-msg/SKILL.md)。提交格式与流程只在该 skill 中维护。
