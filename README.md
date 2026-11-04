# NixelLauncher

基于 Electron + React + HeroUI v3 + Cordis 的 Minecraft Java 版启动器。

已接入批准版界面与独立 Cordis Plugin Host。实例、账号与内容管理通过内置插件调用游戏、资源和账号提供者；插件全局启用，实例单独保存提供者与配置。默认界面也以插件注册，可由可信本地界面插件替换。

插件页可安装本地目录，或添加作者提供的 HTTPS 插件目录。在线安装显示准确版本、来源、哈希和依赖，确认后下载；托管插件支持更新与恢复上一版本。配置按插件的 JSON Schema 生成表单，复杂配置保留 JSON 编辑。目录格式与权限见 [插件分发](docs/plugin-distribution.md)。

## 开发环境

- Node.js 24.14+
- pnpm 11.22.0

```sh
pnpm install
pnpm dev
```

安装脚本会准备 Electron 运行时。若本机配置跳过安装脚本，可手动执行 `pnpm run postinstall`。

首次打开按向导设置偏好、添加账号，再创建游戏实例。游戏文件保存在独立实例目录中。Vanilla、Fabric、Forge、NeoForge、Quilt 的安装与启动由 Nixel 游戏插件实现：读取官方版本清单、安装加载器与依赖、校验资源并构建启动参数。默认自动检测并选择对应 Java 主版本；缺少时从 Mojang 官方源下载、校验并安装到启动器管理目录。也可在设置中下载指定主版本或选择本机 Java。Mojang 未提供的系统架构需手动指定 Java。

官方 Java 安装失败或取消后保留已下载的完整文件；重试或重启后按清单哈希复核，只重下缺失或损坏项。运行时完整验证后才用于游戏启动，见 [Java 安装恢复](docs/java-runtime-recovery.md)。

实例支持导入现有 Minecraft 目录（含多个版本时选择一个启动版本）、复制、修复游戏文件，以及本地模组、资源包、光影导入。导入和复制保留存档与配置，创建独立目录；复制同时保留服务器列表、整合包来源和文件基线，副本可独立编辑服务器与升级整合包。中断的新实例会被清理。全局与实例均支持 JVM 参数、游戏参数、分辨率和全屏，实例可继承全局设置。参数逐行填写，每行是传给进程的一个参数。

在 **实例 → 概览 → 更换版本** 中选择 Minecraft、加载器与加载器版本，再逐项选择保留、禁用或更新内容。兼容版本按各文件的 Modrinth / CurseForge 来源查询；最终确认列出准确文件、必需依赖和保留的兼容风险。应用前自动备份，下载并安装后一起提交游戏版本与内容记录；已禁用内容更新后仍禁用，取消或失败回滚文件。跨 Minecraft 版本打开存档前应查看兼容情况，需要恢复时从备份创建独立实例。流程见 [版本与内容联动更新](docs/version-content.md)。

服务配置统一放在项目根目录的 `.env`，首次使用可复制 `.env.example`。填写后重启启动器：

| 变量                       | 用途                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `MICROSOFT_CLIENT_ID`      | 自己的 Microsoft 公开客户端 ID，应用需支持设备代码流程与 Minecraft 服务访问 |
| `CURSEFORGE_API_KEY`       | 自己的 CurseForge API Key，用于搜索、版本查询和下载                         |
| `MODRINTH_TOKEN`           | 可选，公开资源搜索与下载无需填写                                            |
| `NIXEL_DATA_DIR`           | 可选，独立应用数据目录的绝对路径                                            |
| `NIXEL_UPDATE_FEED_URL`    | 可选，启动器更新的公开 HTTPS 发布目录                                       |
| `NIXEL_UPDATE_RELEASE_URL` | 可选，手动下载启动器的 HTTPS 发布页面                                       |
| `NIXEL_UPDATE_PUBLISHER`   | Windows 更新包预期的签名发布者名称                                          |

优先级为系统环境变量 > `.env.local` > `.env`。加载器保留 `$` 字符原值；包含 `#` 的值请用引号包裹。开发时读取项目根目录，打包后读取可执行文件同目录；Windows 便携版与 Linux AppImage 使用原始启动文件所在目录。配置在运行时加载，不编译进渲染端；Host 缓存服务凭据后从进程环境移除，Java 安装器与游戏不会继承这三项服务凭据。`.env` 与本地覆盖文件由 Git 忽略，仓库只保留空值模板。

离线角色、Microsoft 与第三方 Yggdrasil 认证分别由账号插件提供。玩家登录令牌由主进程系统安全存储加密。更换 Microsoft 客户端 ID 后，新登录使用新配置；已有账号刷新仍使用登录时绑定的客户端 ID。

Microsoft 设备授权要求应用支持公共客户端流程。在 Microsoft Entra 应用注册的「身份验证 → 高级设置」中启用移动和桌面的公共客户端流，参见 [Microsoft 配置说明](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/confidential-client-application-authentication-error-aadsts7000218#resolution)。服务返回 `invalid_client` 时，启动器会提示检查客户端 ID 与此设置；账号授权和 Minecraft 服务访问仍由微软验证。

第三方认证返回多个可用角色时，选择角色后再保存账号。账号页的“切换角色”通过重新登录取得新会话，保留账号记录及实例默认账号引用；已绑定会话刷新时保持原角色。待选凭据只保存在 Host 内存，取消、过期或停用插件后释放。

Microsoft 账号的“皮肤与披风”支持旋转与缩放角色预览、上传 PNG、选择 Classic / Slim 模型、恢复默认皮肤，以及启用或停用账号拥有的披风。外观管理通过独立 `nixel.skins` 插件调用账号提供者，见 [皮肤与披风](docs/skins.md)。

资源页和实例的“添加内容”默认同时搜索 **Modrinth / CurseForge**，也可筛选单一来源。支持模组、资源包、光影和整合包，按游戏版本与加载器获取兼容版本；某个来源不可用时仍显示其他来源的结果。同一实例可以混合安装两个来源的内容，检查更新按已安装文件来源分发。整合包支持 `.mrpack` 与 CurseForge `manifest.json` ZIP 导入，导出为 `.mrpack`。CurseForge 下载遵循作者的第三方分发设置；未开放的文件可通过项目页面获取。

新导入的整合包保存来源、准确版本、清单和文件基线。概览的“升级整合包”可选择在线版本或本地新版文件，比较包清单与本地改动，逐项选择冲突处理。应用前自动备份，保留存档、用户配置选择和模组禁用状态；取消或失败回滚已提交的包文件。处理规则与恢复方法见 [整合包升级](docs/modpack-upgrade.md)。

任务支持进度、日志、取消和重启后手动重试。重试通过当前已启用的插件重新执行原命令。设置、账号记录、实例与插件配置保存在应用数据目录，重启后恢复。脱敏启动输出保存在实例的 `nixel-launch.log`，日志页可读取历史输出和打开崩溃报告。同一数据目录只运行一个启动器窗口；启动后自动隐藏的窗口在游戏退出或 Host 故障时恢复。界面插件启用后，在 **设置 → 外观** 选择默认界面。

文件下载通过独立 `nixel.downloads` 插件统一排队。任务中心可暂停/继续下载，设置中的“下载调度”可调整全局并发数和总限速。续传检查服务端文件标识与响应范围，提交前校验文件哈希；取消清理当前片段，网络失败保留片段供手动重试。使用范围见 [下载管理](docs/downloads.md)。

“Minecraft 下载来源”可选择官方、BMCLAPI 或自定义兼容 HTTPS 镜像，适用于有官方哈希的游戏、资源、官方库及 Java 文件。Modrinth、CurseForge 等其他文件保留原来源，镜像失败直接报告错误。映射规则见 [下载镜像](docs/download-mirrors.md)。

设置按用途分区并支持关键词查找；高级启动参数与实例维护操作可展开。支持简体中文、English 和跟随系统，语言即时切换并持久化。翻译约定见 [i18n](docs/localization.md)，临时启动器标志与复用素材见 [图标资源](docs/assets.md)。

**设置 → 下载与网络** 可选择系统代理、直连或自定义 HTTP/HTTPS/SOCKS5 代理，统一用于启动器 API、下载及远程图片。配置由 `nixel.network` 插件持久化，连接检查结果写入任务日志；接口和当前支持范围见 [网络连接](docs/network.md)。

自定义 HTTP/HTTPS 代理支持用户名密码认证，密码通过系统安全存储加密。留空密码保留当前凭据，更换地址或用户名时重新填写；SOCKS5 使用无认证连接。数据与认证流程见 [代理身份验证](docs/proxy-authentication.md)。

实例可设置默认账号；主页的临时账号选择只作用于当前实例。账号缺失或服务不匹配时，可选择已有账号、添加账号或调整实例服务插件，再继续启动。本地模组、资源包和光影支持多文件导入。

实例的“服务器”页支持保存服务器地址、查询版本/人数/延迟与快速加入。加入沿用当前实例和账号选择流程，仅影响本次启动；任务重试保留原服务器地址。服务器管理由独立 `nixel.servers` 插件提供，协议与接口见 [实例服务器](docs/servers.md)。

实例的“日志”页可分析启动日志、游戏日志与最近崩溃报告，展示错误类型、原始证据和关联文件名，并导出脱敏 ZIP。`nixel.diagnostics` 插件在本地处理，不上传日志；诊断依据与收集范围见 [崩溃诊断](docs/diagnostics.md)。

启动器自身的运行记录可在 **设置 → 关于 Nixel → 启动器日志** 打开，Host 故障恢复页也保留入口。日志记录进程、插件和任务状态，按大小保留最近两份，详见 [启动器运行日志](docs/application-logs.md)。

内容页支持带进度的更新检查、取消与重试，并可更新当前筛选列表中的全部可更新项目。更新固定使用各自来源和准确版本 ID，保留启用状态；任务中断后保留已完成的项目，重试继续处理剩余目标。

资源列表点击项目可查看介绍、截图、版本说明和依赖关系；点击安装则直接选择兼容版本。Modrinth 与 CurseForge 使用同一套详情界面，安装沿用项目来源和选定实例。必需依赖自动安装，当前版本的直接可选依赖可勾选一起安装，并显示具体兼容版本。切换资源版本或目标实例会清空勾选；任务重试保留选定版本。安装前统一解析依赖、检查版本冲突和禁用状态，下载继续保留项目来源与文件校验。

实例的“备份”页可保存完整游戏目录、存档、启动设置和资源来源记录，恢复为新的独立实例。恢复前校验归档 SHA-256；备份与恢复支持取消、任务重试。侧栏“所有备份”保留已删除实例的备份，可继续恢复或手动删除。备份位于应用数据目录的 `backups/`，不包含临时运行目录和外部启动器账号文件；含符号链接时会报告具体路径。支持手动备份、更换版本及升级整合包前的自动备份。在 **设置 → 存储与数据** 配置每个实例保留的自动备份数，默认 0 全部保留；新自动备份完成后清理超出数量的旧自动备份，手动备份和旧版历史备份始终保留。清理结果写入对应任务日志。

## 命令

| 命令              | 用途                     |
| ----------------- | ------------------------ |
| `pnpm dev`        | Electron 开发模式        |
| `pnpm build`      | 构建到 `out/`            |
| `pnpm start`      | 预览已有构建             |
| `pnpm typecheck`  | TypeScript 检查          |
| `pnpm lint`       | Biome 检查               |
| `pnpm format`     | 格式化代码               |
| `pnpm package`    | 生成当前平台解包目录     |
| `pnpm dist:win`   | Windows 安装程序与便携版 |
| `pnpm dist:mac`   | macOS DMG 与 ZIP         |
| `pnpm dist:linux` | Linux AppImage 与 DEB    |

本地打包、配置文件位置与签名说明见 [应用分发](docs/distribution.md)。产物生成到 `release/`，命令默认不发布到远程。

Linux AppImage 与 DEB 解包程序已在 Ubuntu 24.04 / WSLg 实际启动。项目主页为 `https://nixel.origin173.top`，仓库为 `Origin173/NixelLauncher`；可通过 `pnpm dist:linux` 生成 Linux 包。DEB 系统安装与桌面集成仍待验收。

**设置 → 关于 Nixel → 启动器更新** 可检查版本、查看说明、下载并确认重启安装。自动检查默认关闭，游戏和任务结束后才允许安装。更新由独立 `nixel.app-updates` 插件组织，主进程调用通用系统更新库；需要配置真实发布源和对应签名产物，未配置时显示当前状态。平台范围、发布要求及接口见 [启动器更新](docs/application-updates.md)。

## 目录

```text
src/main/           Electron 主进程
src/preload/        渲染进程桥接入口
src/host/           独立 Cordis Host、状态、任务与插件生命周期
src/plugins/        内置管理插件与游戏、资源、账号提供者
src/shared/         公开数据、preload 与 Host 接口
src/renderer/       React + HeroUI 默认界面插件
design/             已批准的独立设计原型
docs/               架构、命令表与本地插件开发说明
.agents/skills/     项目提交规范
```

架构见 [运行结构](docs/architecture.md)，扩展方式见 [插件开发](docs/plugins.md)，接口见 [实现约定](docs/implementation.md)。Cordis 固定为 `4.0.0-rc.12`，HeroUI 使用 v3 API。

开发时可用环境变量 `NIXEL_DATA_DIR` 指定独立的绝对数据目录。构建生成主进程、preload、Host 和默认界面；`pnpm start` 运行构建结果。

项目不依赖 XMCL 包。Minecraft、Java、Modrinth 与认证协议由 `src/plugins/` 下的模块实现；ZIP 读取和写入使用通用包 `yauzl`、`yazl`。加载器安装按官方配置执行 Forge/NeoForge 提供的 Java 处理工具。功能缺口与验证范围见 [功能状态](docs/feature-status.md)。
