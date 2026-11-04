# Nixel 实现约定

以 `design/` 批准版作为默认 UI。Electron 主进程管理窗口与系统能力，preload 暴露 `NixelBridge`，独立 Utility Process 内的 Cordis root 组合可信业务插件。实例独立，插件全局安装启用，实例分别选择服务提供者。默认 UI 可由本地可信 UI 插件替换。

共享类型位于 `src/shared/contracts.ts`，Host 插件接口位于 `src/shared/host-api.ts`。内置插件由 `src/plugins/builtin.ts` 导出 `builtinPlugins: BuiltinPlugin[]`。每个插件通过 `ctx.nixel.commands.register(ctx, name, handler)` 注册命令，并通过 `providers.register(ctx, descriptor, implementation)` 注册 provider；注册项随 Cordis 插件 dispose 撤销。业务命令通过实例的 provider ID 解析实现。

账号提供者的 `session` 返回 Nixel 的 `GameSession`（`authentication.ts`），包括令牌、角色、账号类型及可选 authlib-injector 参数；Microsoft 会话可附带客户端 ID 与 XUID。该对象只在 Host 的认证与游戏插件之间使用，不进入公开快照。游戏提供者自行解析版本、安装依赖和启动 Java，公共接口不依赖 XMCL 类型。

核心默认 provider ID：`nixel.game.minecraft`、`nixel.resources.modrinth`、`nixel.accounts.offline`。对应 plugin ID 相同；默认界面 ID 为 `nixel.ui.default`。Microsoft 与第三方账号分别用 `nixel.accounts.microsoft`、`nixel.accounts.yggdrasil`。

CurseForge provider 与插件 ID 为 `nixel.resources.curseforge`。资源命令的 `source` 可覆盖实例默认来源，任务使用 `resourceSource + resourceId` 匹配资源。两个来源均可在同一实例中安装，已安装内容的更新由各自 provider 处理。

## 命令约定

独立业务插件的扩展命令分别见 [实例服务器](servers.md)、[崩溃诊断](diagnostics.md) 与 [网络连接](network.md)。

整合包升级命令、文件冲突规则及 `ResourceProvider.downloadModpack` / `CurseForgeResourceProvider.resolvePackFiles` 扩展见 [整合包升级](modpack-upgrade.md)。

`window.nixel.invoke<T>(command, params)` 使用以下命令。返回值为真实数据，长任务返回 `{ taskId: string }` 并通过快照推送进度。

| 命令                               | 参数                                                                    | 返回                                                              |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `settings.update`                  | `Partial<LauncherSettings>`                                             | `void`                                                            |
| `tasks.cancel` / `tasks.retry`     | `{ id }`                                                                | `void` / `{ taskId }`                                             |
| `tasks.clear`                      | 无                                                                      | `void`                                                            |
| `plugins.setEnabled`               | `{ id, enabled }`                                                       | `void`                                                            |
| `plugins.configure`                | `{ id, config }`                                                        | `void`                                                            |
| `plugins.install`                  | `{ directory }`（包含 nixel-plugin.json）                               | `void`                                                            |
| `plugins.remove`                   | `{ id }`                                                                | `void`                                                            |
| `game.versions`                    | `{ instanceId? }` 或无参                                                | `VersionEntry[]`                                                  |
| `game.loaders`                     | `{ version, loader, instanceId? }`                                      | `VersionEntry[]`                                                  |
| `instances.create`                 | `CreateInstanceInput`                                                   | `{ instanceId, taskId? }`                                         |
| `instances.update`                 | `{ id, patch: Partial<Instance> }`                                      | `void`                                                            |
| `instances.delete`                 | `{ id, deleteFiles: boolean }`                                          | `void`                                                            |
| `instances.install`                | `{ id }`                                                                | `{ taskId }`                                                      |
| `instances.planVersionChange`      | `{ id, target: InstanceVersionTarget }`                                 | `InstanceVersionPlan`                                             |
| `instances.changeVersion`          | `ChangeInstanceVersionInput`                                            | `{ taskId }`                                                      |
| `instances.launch`                 | `{ id, accountId?, server? }`                                           | `{ taskId }`                                                      |
| `instances.stop`                   | `{ id }`                                                                | `void`                                                            |
| `instances.files`                  | `{ id, kind: 'saves' \| 'screenshots' \| 'crash-reports' }`             | `InstanceFile[]`                                                  |
| `instances.logs`                   | `{ id }`                                                                | `string[]`                                                        |
| `instances.import`                 | `{ path, name? }`                                                       | `{ taskId }`                                                      |
| `instances.export`                 | `{ id, path }`                                                          | `{ taskId }`                                                      |
| `java.list`                        | 无                                                                      | `JavaRuntime[]`                                                   |
| `java.inspect`                     | `{ path }`                                                              | `JavaRuntime`                                                     |
| `java.install`                     | `{ major }`                                                             | `{ taskId }`                                                      |
| `instances.detectDirectory`        | `{ path }`                                                              | `{ versionId, version, loader, loaderVersion?, launchVersion }[]` |
| `instances.importDirectory`        | `{ path, name?, versionId? }`                                           | `{ taskId }`                                                      |
| `instances.clone`                  | `{ id, name? }`                                                         | `{ taskId }`                                                      |
| `backups.list`                     | `{ instanceId? }` 或无参，省略实例时列出全部历史                        | `InstanceBackup[]`，按创建时间倒序                                |
| `backups.create`                   | `{ instanceId }`                                                        | `{ taskId }`                                                      |
| `backups.restore`                  | `{ id }`，备份 ID                                                       | `{ taskId }`，任务的 `instanceId` 指向恢复的新实例                |
| `backups.delete`                   | `{ id }`，备份 ID                                                       | `void`                                                            |
| `content.import`                   | `{ instanceId, category, paths: string[] }`                             | `{ taskId }`                                                      |
| `accounts.addOffline`              | `{ name }`                                                              | `Account`                                                         |
| `accounts.remove`                  | `{ id }`                                                                | `void`                                                            |
| `accounts.refresh`                 | `{ id }`                                                                | `Account`                                                         |
| `accounts.microsoft.start`         | 无（Host 从 `.env` 读取客户端 ID）                                      | `DeviceLogin`                                                     |
| `accounts.microsoft.poll`          | `{ id }`                                                                | `{ status: 'pending' \| 'complete'; account?: Account }`          |
| `accounts.yggdrasil.login`         | `{ server, username, password, accountId? }`                            | `YggdrasilLoginResult`：完成或返回待选角色会话                    |
| `accounts.yggdrasil.selectProfile` | `{ id, profileId }`                                                     | `Account`                                                         |
| `accounts.yggdrasil.cancel`        | `{ id }`                                                                | `void`                                                            |
| `resources.search`                 | `ResourceQuery`                                                         | `ResourceSearchResult`（items、total、hasMore、warnings）         |
| `resources.versions`               | `{ projectId, instanceId?, source? }`                                   | `ResourceVersion[]`                                               |
| `resources.details`                | `{ projectId, source }`                                                 | `ResourceDetails \| null`                                         |
| `resources.versionDetails`         | `{ projectId, versionId, source }`                                      | `ResourceVersionDetails \| null`                                  |
| `resources.optionalDependencies`   | `{ projectId, versionId, instanceId, source }`                          | `ResourceOptionalDependency[] \| null`                            |
| `resources.install`                | `{ projectId, versionId, instanceId?, source?, optionalDependencies? }` | `{ taskId }`                                                      |
| `content.list`                     | `{ instanceId }`                                                        | `InstalledContent[]`（同步快照）                                  |
| `content.setEnabled`               | `{ instanceId, id, enabled }`                                           | `void`                                                            |
| `content.remove`                   | `{ instanceId, id }`                                                    | `void`                                                            |
| `content.checkUpdates`             | `{ instanceId }`                                                        | `{ taskId }`                                                      |
| `content.update`                   | `{ instanceId, updates: ContentUpdateTarget[] }`                        | `{ taskId }`                                                      |

Microsoft 登录使用 `.env` 的 `MICROSOFT_CLIENT_ID`，CurseForge 使用 `CURSEFORGE_API_KEY`，Modrinth 可选 `MODRINTH_TOKEN`。服务配置不进入界面设置或快照；Host 缓存后从环境移除服务凭据。玩家 Token 由主进程 safeStorage 加密保存，只在 Host 与系统桥接内传递。离线角色使用标准 OfflinePlayer UUID。

`skins.profile`、`skins.cancel`、`skins.file` 和 `skins.change` 由独立外观插件注册。账号提供者通过可选 `appearance` 能力支持资料、上传、默认恢复与披风选择。`skin-update` 任务按账号串行，上传重试校验文件 SHA-256；命令参数及协议见 [皮肤与披风](skins.md)。

内存字段统一存储 MiB，默认 `4096`；界面以 GB 展示时换算。实例 `memory: null` 继承全局值。账号鉴权按账号记录的 `provider` 解析；实例账号 provider 为空时继承所选账号。

启动账号由共享 `launchAccountId` 解析：显式 `accountId` > 当前主页实例的 `launchAccount` > 实例默认账号 > 全局默认账号。主页选择不会泄漏到其他实例；切换实例会清空临时账号选择。启动任务绑定提交时的账号，重试也使用该账号；删除账号会清理全局、主页与实例引用。默认界面在账号不可用时显示选择弹窗，添加账号后回到启动确认。

Yggdrasil 登录返回 `{ status: 'complete', account }` 或 `{ status: 'select-profile', id, profiles }`。待选 ID 指向 Host 内存中的未绑定令牌，十分钟过期；`selectProfile` 只接受该会话中的角色，通过 refresh 绑定后保存。传入 `accountId` 表示重新认证并替换已有记录的角色，保留记录 ID、默认引用和原认证服务器；游戏使用中的账号不能切换。刷新已绑定令牌不发送 `selectedProfile`，角色不一致时要求重新登录。

实例设置中的“服务插件”按已启用提供者生成选项，保存到实例的 `providers`；账号服务可选择跟随所选账号。preload 的 `selectPath` 选择单文件或目录，`selectFiles` 使用原生多选文件窗口，取消返回空数组。本地内容导入将所选路径列表一次交给 `content.import`，由内容插件处理任务、冲突检查与文件复制。

启动选项为 `jvmArgs`、`gameArgs`（每个数组元素为一个原样传递的参数）、`resolution: { width, height }` 和 `fullscreen`。实例字段省略或为 `null` 时继承全局值；默认分辨率为 854×480。`autoDownloadJava` 默认启用，托管运行时位于数据目录的 `java/`，按主版本与平台隔离。已有游戏启动从本地版本文件读取 Java 要求；离线角色无需联网认证。

`instances.install` 同时用于已安装实例的文件修复，通过安装清单验证校验值。目录导入会复制来源目录，排除已知启动器账号文件；实例复制保留已安装内容元数据与启动设置。两者及整合包导入通过 `pendingOperation` 标记尚未完成的新实例，实例插件启动时清理遗留目录和记录。

内置长任务在 `Task.retry` 中保存 `{ command, params }`，参数不含账号凭据。`tasks.retry` 通过当前命令注册表执行，重新校验实例占用和插件状态；历史任务保持不变，返回新任务 ID。取消或进程中断不会自动重试。插件自定义任务未提供描述符时，仅当前 Host 生命周期内可使用原执行函数重试。

`tasks.pause` 与 `tasks.resume` 调用当前下载阶段注册的 `TaskContext.setControls`。暂停或排队使用 `Task.activity` 表示，`Task.status` 仍为 `running`，保持实例和插件占用；阶段结束释放控制，重启清除运行时标记。`downloads.configure` 保存插件的并发与限速，`downloads.status` 读取配置，公开下载提供者见 [下载管理](downloads.md)。

下载配置的 `mirror` 为 `{ mode: 'official' | 'bmclapi' | 'custom', baseUrl }`，缺省为官方。`downloads.configure` 合并顶层更新，镜像与调度表单分别保存自身字段。精确映射范围、重定向和日志约定见 [下载镜像](download-mirrors.md)。

内容更新检查使用 `content-check` 任务，按来源报告进度并支持取消、重试。检查前清理旧更新提示；单个文件或来源失败会保留其他检查结果，在任务中报告失败详情。`InstalledContent.update` 保存 `{ versionId, version }`；旧的纯文本更新标签在载入时清除，重新检查后获得准确 ID。

`ContentUpdateTarget` 为 `{ source, projectId, versionId }`，以来源与项目 ID 标识更新目标。`content.update` 使用 `content-update` 任务串行安装这些明确目标，保留文件启用状态；当前列表的批量操作遵守分类和搜索筛选，同一来源的同一项目只提交一次。任务中断时保留已完成的项目，重试跳过已安装的目标版本。批次结束检查最终版本，依赖安装替换了其他所选版本时报告冲突。列表扫描保留扫描期间写入的新元数据，避免覆盖安装结果。

资源详情命令必须传项目实际的 `source`。`ResourceDetails` 包含 `description: { content, format: 'markdown' | 'html' }`、`gallery: { url, title?, description? }[]` 与项目 `url`；`ResourceVersionDetails` 包含相同格式的 `changelog` 及依赖列表。依赖有 `name`、`type`，以及可选的 `projectId`、`versionId`、`url`；类型为 `required`、`optional`、`incompatible`、`embedded`、`tool`、`include`、`unknown`。未实现对应可选方法的提供者返回 `null`，接口失败正常抛出错误。内置来源校验版本属于请求的项目，详情读取不修改实例或已安装内容。

`resources.optionalDependencies` 按实例解析当前资源版本的直接可选依赖，返回名称、图标、准确项目/版本 ID 与显示版本；不可安装项目附带 `reason`。安装参数 `optionalDependencies` 为 `{ projectId, versionId }[]`，与主资源使用同一来源，默认为空。内置来源重新检查所选项目确为该版本声明的可选依赖，递归安装它们的必需依赖；未勾选的可选依赖不会自动安装。任务重试保留这些版本 ID。依赖版本冲突、计划内及已装启用内容的已知互斥关系、禁用的依赖在写入前拒绝；网络或磁盘错误仍沿用任务错误入口，已完成文件保留。

## 实例版本变更

`game.versions`、`game.loaders` 传入 `instanceId` 时查询该实例的游戏提供者，省略时使用全局默认值。`InstanceVersionTarget` 为 `{ version, loader, loaderVersion? }`；Vanilla 清空加载器版本，其他加载器要求明确版本。目标必须存在于对应提供者的版本列表。

`instances.planVersionChange` 要求实例空闲，扫描已安装内容，按每个文件的来源查询目标游戏/加载器的版本列表。当前资源版本仍在列表时为 `compatible`，存在其他可用版本时为 `update-available`，无可用版本时为 `incompatible`；来源或版本身份缺失、查询出错时为 `unknown`，错误随条目返回。返回 `{ target, fingerprint, content }`，每项包含兼容版本候选；指纹涵盖当前版本、提供者配置、内容身份、启用状态与实际文件 SHA-256。结论基于来源元数据。

`instances.planVersionContent` 接收原指纹与每项 `keep`、`disable` 或 `update` 选择，启动 `version-plan` 任务。通过 `instances.versionContentPlan` 取得最终清单；按来源统一解析精确版本、必需依赖和冲突，缓存下载计划。`ChangeInstanceVersionInput` 为 `{ id, target, fingerprint, contentPlanId, acceptRisks }`，其中指纹取最终清单。`version-change` 任务核对当前文件，完整备份、暂存下载并安装目标；再次核对后提交文件，最后一次更新游戏版本和内容记录。保留非兼容内容或改变 Minecraft 版本时要求明确确认。失败或取消回滚文件，重试沿用固定清单；完整契约见 [版本与内容联动更新](version-content.md)。

## 实例备份

备份由 `nixel.instances` 注册。`InstanceBackup` 提供名称、原实例 ID、创建时间、游戏版本、加载器、归档字节数和文件数；列表不包含实例私有配置。磁盘格式为 `backups/<backupId>/{manifest.json,instance.zip}`，清单 `formatVersion: 1`，包含归档 SHA-256、实例设置与已安装资源记录。创建要求实例无游戏和任务占用。恢复始终创建新实例，保留文件禁用状态和两个来源的项目/版本 ID，重新生成实例与内容记录 ID，清除过时的内容更新提示；已删除账号的引用清空。恢复不依赖原实例仍存在，也不会更改主页的启动目标。归档损坏时停止恢复，不创建实例。

备份不收集 Host 的账号密钥存储；归档排除实例根目录的 `.nixel`、`launcher_accounts.json`、`launcher_profiles.json`、`launcher_profiles_microsoft_store.json`。支持空目录和文件修改时间，Unix 系统恢复文件权限。符号链接报告错误，不跟随到实例外部。

`settings.backupRetentionCount` 为 0–1000 的整数，默认 0 表示全部保留。新自动备份提交后，按实例清理超出数量的旧 `origin: 'version-change' | 'modpack-upgrade'` 备份。`origin: 'manual'` 和未标记来源的历史备份始终保留；正在恢复的备份跳过，删除与跳过结果记录在任务日志中。设置变更本身不立即删除备份。

## 插件目录与配置

插件目录命令 `pluginCatalog.configure/list/preview/install/rollback` 由 `nixel.plugin-distribution` 提供。`NixelPluginManifest.dependencies` 支持 ID 数组或 semver 范围映射，`configSchema` 在 Host 校验；托管记录 `PluginItem.managed` 保存当前包和上一代配置。Host 的窄 `PluginManager` 接口要求真实插件上下文与任务身份，调用方不能通过 IPC 指定豁免任务。命令参数、安装和回滚规则见 [插件分发](plugin-distribution.md)。

`plugins.configure` 默认替换完整配置；传入 `merge: true` 时，在串行生命周期内将顶层字段合并到最新配置，再校验与应用。下载调度和镜像表单共用这一方式，避免并发保存覆盖彼此字段。

## 开发检查

保留独立 `design/` 原型。功能代码位于 `src/`。使用 `pnpm typecheck`、`pnpm lint`、按需要构建与实际运行验证；不添加冒烟或回归测试文件。
