# 运行结构

```mermaid
flowchart LR
  UI[默认界面或界面插件] --> Bridge[preload / NixelBridge]
  Bridge --> Main[Electron 主进程]
  Main --> Host[独立 Utility Process]
  Host --> Cordis[Cordis Context]
  Cordis --> Kernel[Nixel 核心服务]
  Cordis --> Managers[实例 / 账号 / 内容管理插件]
  Managers --> Providers[游戏 / 资源 / 账号提供者]
  Kernel --> State[本地 JSON 状态与任务记录]
  Providers --> Java[Java 游戏进程]
  Providers --> Network[Minecraft / Modrinth / CurseForge / 认证服务]
```

主进程持有窗口、系统对话框与 `safeStorage`，验证 IPC 的窗口和顶层文档来源。渲染端保持 context isolation、sandbox，关闭 Node integration。Host 通过内部消息调用系统凭据服务，凭据不进入界面快照。

Host 的 `NixelService` 提供持久化状态、命令注册、提供者注册、任务与状态订阅。业务插件通过 Cordis `inject` 获取服务，通过插件作用域维护生命周期。JSON 写入使用串行队列和同目录临时文件替换，成功后广播新状态。重启时把中断的任务记录为失败，保留错误信息供用户重新发起操作。

通用管理插件负责实例身份、账号记录、内容文件与命令入口；具体提供者负责下载、鉴权和启动。实例保存独立目录、版本、加载器、账号、Java、内存、提供者 ID 与配置。内存以 MiB 保存，`null` 继承全局配置。浏览中的实例和主页待启动实例分别保存，避免管理操作改变启动选择。

默认界面复用已批准的 `design/` 原型。全局背景与磨砂层连续，内容页原地切换已安装与添加目录，安装目标跟随当前实例。全局资源页独立浏览，在安装对话框中选择目标。任务、游戏进程与界面路由相互独立，切换页面保留后台操作。

资源浏览器默认同时查询已启用的来源，也支持单独筛选。内容管理插件通过 Cordis 注册表并行查询提供者，交错合并每个来源的当前页，并分别返回失败来源的提示；安装继续传递资源本身的明确来源。同一实例可安装多个来源的资源。服务配置由主进程在启动时读取 `.env`，Host 私有模块缓存 Microsoft 客户端 ID、CurseForge Key 和可选 Modrinth Token 后移除其环境变量，避免传给 Java 子进程。配置不进入持久化设置或界面快照。

Minecraft 安装与启动由 Nixel 游戏提供者实现，版本清单来自 Mojang，Fabric/Quilt 配置来自各自 Meta API，Forge/NeoForge 从官方 Maven 获取安装器并执行其客户端处理器。Modrinth 资源直接请求其[公开 API](https://docs.modrinth.com/api/)，CurseForge 使用带自有 Key 的[官方 REST API](https://docs.curseforge.com/rest-api/)。Microsoft 设备代码登录需要项目自己的公开客户端 ID，按[设备授权流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)获取授权，再通过 Xbox、XSTS 和 Minecraft 服务交换游戏会话。第三方账号直接请求 Yggdrasil 接口。

游戏提供者使用 `minecraft-version.ts` 解析版本继承、平台规则和 Maven 坐标，`minecraft-engine.ts` 编排安装，`forge-installer.ts` 处理加载器安装配置，`minecraft-launch.ts` 构造 JVM/游戏参数并启动进程。`java.ts` 读取官方 Java 清单；`install-files.ts` 负责并发、取消和文件校验。`authentication.ts` 与 `modrinth-client.ts` 为对应提供者的协议模块。ZIP 使用通用包 `yauzl`/`yazl`，这些模块均属于业务插件层。

## 插件内部模块

业务插件按职责组织模块，入口负责注册。实例管理和 Minecraft 提供者已从原 `game.ts` 分开：

| 模块                                                                 | 职责                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `plugins/instances/index.ts`                                         | 组合实例命令、文件、导入与备份功能，绑定 Cordis 作用域     |
| `plugins/instances/manage.ts`、`install.ts`、`launch.ts`、`files.ts` | 分别处理实例配置与增删、安装任务、启动命令、文件与日志查询 |
| `plugins/instances/backups/index.ts`                                 | 注册备份命令、任务与操作占用规则                           |
| `plugins/instances/backups/operations.ts`                            | 编排备份和恢复，提交实例与内容记录，清理未完成的新实例     |
| `plugins/instances/backups/repository.ts`                            | 备份目录、清单、历史列表与原子提交/删除                    |
| `plugins/instances/backups/archive.ts`                               | ZIP 文件读写、相对路径边界、进度与取消                     |
| `plugins/minecraft/index.ts`、`install.ts`、`processes.ts`           | 注册游戏提供者，协调版本安装，拥有游戏进程和停止/释放逻辑  |
| `plugins/java-commands.ts`、`java-selection.ts`、`java.ts`           | Java 命令、版本选择规则、运行时检测与安装                  |
| `plugins/instance-state.ts`、`task-progress.ts`、`launch-logs.ts`    | 内置模块共用的实例访问与占用规则、进度适配、脱敏日志       |

这些模块通过已有 Host 契约和提供者接口协作。`instance-state.ts` 是共享业务模块，不导入具体插件；内容管理无需依赖 Minecraft 插件入口。备份属于实例管理插件，未增加平行注册表或 Host 业务逻辑。

备份先写入 `backups/.pending/<id>/`，归档与清单完成后整体重命名为正式目录。删除先移出正式目录，再清理文件；启动时清理未完成的暂存目录。恢复先校验归档，再创建带 `pendingOperation` 的新实例，解压完成后提交设置和资源记录。取消或失败清理这个新实例；进程中断沿用实例插件的下次启动清理机制。原实例和正式备份保持独立。
