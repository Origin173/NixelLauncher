# NixelLauncher

Minecraft Java 版启动器项目，计划采用 Electron + React + HeroUI + Cordis。

当前仅初始化基础 Electron 脚手架：main、preload、React renderer，以及 TypeScript、Vite、Tailwind CSS 和 Biome 配置。HeroUI 已接入，Cordis 依赖已准备，插件系统与游戏业务尚未实现。

## 开发环境

- Node.js 24.14+
- pnpm 11.22.0

```sh
pnpm install
pnpm dev
```

安装脚本会准备 Electron 运行时。若本机配置跳过安装脚本，可手动执行 `pnpm run postinstall`。

## 命令

| 命令             | 用途              |
| ---------------- | ----------------- |
| `pnpm dev`       | Electron 开发模式 |
| `pnpm build`     | 构建到 `out/`     |
| `pnpm start`     | 预览已有构建      |
| `pnpm typecheck` | TypeScript 检查   |
| `pnpm lint`      | Biome 检查        |
| `pnpm format`    | 格式化代码        |

## 目录

```text
src/main/           Electron 主进程
src/preload/        渲染进程桥接入口
src/renderer/       React + HeroUI 界面入口
.agents/skills/     项目提交规范
```

参考 [electron-vite](https://electron-vite.org/guide/) 与 [HeroUI v3](https://heroui.com/en/docs/react/getting-started/quick-start)。Cordis 固定为上游候选版 `4.0.0-rc.12`，后续设计插件运行时再接入。
