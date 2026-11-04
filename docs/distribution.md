# 安装包与本地分发

构建使用 `electron-vite` 编译主进程、preload、独立 Cordis Host 和默认界面，再由通用工具 `electron-builder` 打包。配置位于 `electron-builder.yml`；产物写入 Git 忽略的 `release/`。打包命令生成本地产物；应用内更新由 `nixel.app-updates` 插件提供，需要另行配置真实发布源、元数据与平台签名产物，见 [启动器更新](application-updates.md)。

## 命令与目标

先按 README 安装 Node.js 和 pnpm，执行 `pnpm install --frozen-lockfile`。

| 命令              | 输出                                    |
| ----------------- | --------------------------------------- |
| `pnpm package`    | 当前平台的解包目录，供检查运行          |
| `pnpm dist`       | 当前平台的默认安装包                    |
| `pnpm dist:win`   | Windows x64 NSIS 安装程序与单文件便携版 |
| `pnpm dist:mac`   | macOS x64、arm64 的 DMG 与 ZIP          |
| `pnpm dist:linux` | Linux x64 AppImage 与 DEB               |

在对应操作系统构建并验证该平台产物。macOS 的 DMG 与代码签名需要 macOS 主机；Linux DEB 需要 Linux 打包环境。默认 Windows 和 Linux 为 x64，可先 `pnpm build`，再用 `pnpm exec electron-builder --win --arm64 --publish never` 或 `--linux --arm64` 显式选择 arm64；其他架构需要分别验证游戏 Java 与加载器支持。

Linux DEB 还要求项目主页元数据：在 `package.json` 的 `homepage` 填写确定的官网或仓库 URL。当前仓库没有该字段或 Git remote，DEB 阶段会报 `Please specify project homepage`；待项目地址确定后填写。单独生成 AppImage 可在构建后执行 `pnpm exec electron-builder --linux AppImage --publish never`。

Windows 文件名分别为 `NixelLauncher-<版本>-windows-x64-setup.exe` 和 `NixelLauncher-<版本>-windows-x64-portable.exe`。安装程序允许选择目录，默认按当前用户安装，不默认创建桌面快捷方式。卸载保留应用数据。便携版免安装，但默认数据目录仍是系统应用数据目录；需要随目录携带数据时，明确设置绝对路径 `NIXEL_DATA_DIR`。

## 文件与配置

`app.asar` 只纳入 `out/`、应用元数据和生产依赖，不复制源码、`design/`、本地数据、`.env` 或 `.env.local`。主进程、Host 与 preload 保持原有相对路径；不另建后端安装目录。窗口图标由 Vite 收集，安装程序和系统应用图标复用 `resources/nixel.ico` / `nixel.png`。第三方素材许可文本与空白 `.env.example` 放入应用的 `resources/` 目录。

服务配置在运行时读取，系统环境变量优先于 `.env.local`，后者优先于 `.env`：

- Windows 安装版、解包目录：放在 `NixelLauncher.exe` 同目录。
- Windows 单文件便携版：放在下载的 `*-portable.exe` 同目录，通过打包器提供的 `PORTABLE_EXECUTABLE_DIR` 定位。
- Linux AppImage：放在 `.AppImage` 文件同目录，通过 `APPIMAGE` 定位；DEB 则在实际应用可执行文件同目录。
- macOS：默认位于 `.app/Contents/MacOS/`。签名应用优先用运行环境传入配置，避免修改已签名应用包。

不要把自己的服务密钥写入待分发文件。包内 `.env.example` 只是空模板，需要用户按上面的运行路径自行复制并填写。游戏数据和账号仍由既有应用数据目录及系统安全存储管理。

## 发布准备

每次发布先更新 `package.json` 的版本，执行 `pnpm typecheck`、`pnpm lint`，然后构建目标平台。用独立 `NIXEL_DATA_DIR` 运行实际产物，检查首次启动、Host 就绪、账号凭据存取及游戏启动。校验归档内文件，不应包含本地凭据或实例数据。可使用 PowerShell `Get-FileHash release/*.exe -Algorithm SHA256` 生成分发校验值。

本地未提供证书时 Windows 产物没有可信发布者签名，macOS 没有 Developer ID 签名和公证。正式对外发布时通过 electron-builder 的环境变量配置自己的证书（Windows `CSC_LINK` / `CSC_KEY_PASSWORD`；macOS Developer ID 与 Apple 公证凭据），证书和密码不提交到仓库。使用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 可明确禁用本机签名身份自动发现。这里没有设置发布服务器、虚构证书身份或 GitHub 仓库。

`pnpm-workspace.yaml` 把 electron-builder 的 `@electron/get` 固定到 3.1.0：26.18.0 使用该版本新增的下载缓存枚举，3.0.0 会在构建前报错。未使用 Squirrel.Windows，因而不执行其传递依赖 `electron-winstaller` 的安装脚本；NSIS、便携版不受影响。

2026-11-04 的隔离验收实际执行了 Windows NSIS 当前用户安装与卸载，确认安装目录、卸载注册项和快捷方式清理，独立数据文件保留且哈希不变。普通卸载会保留 updater 的安装器缓存。安装包尚未签名，已安装应用的更新模式识别与真实更新安装仍待验收；具体范围见 [功能状态](feature-status.md)。

## Linux 实际运行

2026-11-04 从已提交代码 `64bba3d` 导出独立目录，在 Ubuntu 24.04 x86_64 / WSL2 + WSLg 使用 Node 24.14.0、pnpm 11.22.0 完成锁文件安装、typecheck、lint 和 build，并生成 AppImage。解包目录和 AppImage 均实际启动：Cordis Host 就绪、17 个内置插件启用，渲染端 Node 接口不可见且 sandbox 保持开启，窗口关闭后正常退出。

AppImage 同目录的 `.env.local` 仅设置独立 `NIXEL_DATA_DIR`；未通过启动环境传入该变量，实际数据目录与该设置一致。归档 18,377 项中，13 个构建文件逐一匹配，没有本地配置、设计原型或玩家数据。产物、校验值和操作证据位于本地忽略目录 `output/linux-release/`，没有发布到远程。

该 WSL 环境需要补充 `libnspr4`、`libnss3`、`libasound2t64`。验收只把经 Ubuntu 包元数据 SHA-256 核对的依赖解包到独立目录，通过进程级 `LD_LIBRARY_PATH` 使用；其他桌面运行库来自现有系统。因为缺少 FUSE 2 运行库，AppImage 使用官方 [extract-and-run](https://docs.appimage.org/user-guide/troubleshooting/fuse.html#extract-and-run-type-2-appimages) 方式启动；FUSE 挂载和桌面集成尚未验证。

该会话未配置可用的系统密钥库，Electron 返回 `available=false` / `basic_text`，现有凭据存储会拒绝保存。在线账号令牌持久化需要可用的桌面 Secret Service/keyring 会话，尚未在此环境验证。当前证据覆盖 WSLg 客户端启动，不代表原生 Linux、DEB 安装或 Linux 游戏运行已通过。

## 设计参考

参考了 [HeliosLauncher 的分平台打包结构](https://github.com/dscalzi/HeliosLauncher/blob/master/electron-builder.yml)：应用归档、安装器目标和各平台配置集中维护。本项目独立编写配置，沿用现有 Cordis Host 和业务插件，没有引入该启动器或 XMCL 的代码包。具体选项依据 [electron-builder v26 配置](https://www.electron.build/v26/docs/configuration/) 和 [NSIS 文档](https://www.electron.build/v26/docs/nsis/)。
