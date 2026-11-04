# Nixel 实现约定

以 `design/` 批准版作为默认 UI。Electron 主进程管理窗口与系统能力，preload 暴露 `NixelBridge`，独立 Utility Process 内的 Cordis root 组合可信业务插件。实例独立，插件全局安装启用，实例分别选择服务提供者。默认 UI 可由本地可信 UI 插件替换。

共享类型位于 `src/shared/contracts.ts`，Host 插件接口位于 `src/shared/host-api.ts`。内置插件由 `src/plugins/builtin.ts` 导出 `builtinPlugins: BuiltinPlugin[]`。每个插件通过 `ctx.nixel.commands.register(ctx, name, handler)` 注册命令，并通过 `providers.register(ctx, descriptor, implementation)` 注册 provider；注册项随 Cordis 插件 dispose 撤销。业务命令通过实例的 provider ID 解析实现。

账号提供者的 `session` 返回 Nixel 的 `GameSession`（`authentication.ts`），包括令牌、角色、账号类型及可选 authlib-injector 参数；Microsoft 会话可附带客户端 ID 与 XUID。该对象只在 Host 的认证与游戏插件之间使用，不进入公开快照。游戏提供者自行解析版本、安装依赖和启动 Java，公共接口不依赖 XMCL 类型。

核心默认 provider ID：`nixel.game.minecraft`、`nixel.resources.modrinth`、`nixel.accounts.offline`。对应 plugin ID 相同；默认界面 ID 为 `nixel.ui.default`。Microsoft 与第三方账号分别用 `nixel.accounts.microsoft`、`nixel.accounts.yggdrasil`。

CurseForge provider 与插件 ID 为 `nixel.resources.curseforge`。资源命令的 `source` 可覆盖实例默认来源，任务使用 `resourceSource + resourceId` 匹配资源。两个来源均可在同一实例中安装，已安装内容的更新由各自 provider 处理。

## 命令约定

`window.nixel.invoke<T>(command, params)` 使用以下命令。返回值为真实数据，长任务返回 `{ taskId: string }` 并通过快照推送进度。

| 命令                           | 参数                                                        | 返回                                                              |
| ------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `settings.update`              | `Partial<LauncherSettings>`                                 | `void`                                                            |
| `tasks.cancel` / `tasks.retry` | `{ id }`                                                    | `void` / `{ taskId }`                                             |
| `tasks.clear`                  | 无                                                          | `void`                                                            |
| `plugins.setEnabled`           | `{ id, enabled }`                                           | `void`                                                            |
| `plugins.configure`            | `{ id, config }`                                            | `void`                                                            |
| `plugins.install`              | `{ directory }`（包含 nixel-plugin.json）                   | `void`                                                            |
| `plugins.remove`               | `{ id }`                                                    | `void`                                                            |
| `game.versions`                | `{ instanceId? }` 或无参                                    | `VersionEntry[]`                                                  |
| `game.loaders`                 | `{ version, loader, instanceId? }`                          | `VersionEntry[]`                                                  |
| `instances.create`             | `CreateInstanceInput`                                       | `{ instanceId, taskId? }`                                         |
| `instances.update`             | `{ id, patch: Partial<Instance> }`                          | `void`                                                            |
| `instances.delete`             | `{ id, deleteFiles: boolean }`                              | `void`                                                            |
| `instances.install`            | `{ id }`                                                    | `{ taskId }`                                                      |
| `instances.planVersionChange`  | `{ id, target: InstanceVersionTarget }`                     | `InstanceVersionPlan`                                             |
| `instances.changeVersion`      | `ChangeInstanceVersionInput`                                | `{ taskId }`                                                      |
| `instances.launch`             | `{ id, accountId? }`                                        | `{ taskId }`                                                      |
| `instances.stop`               | `{ id }`                                                    | `void`                                                            |
| `instances.files`              | `{ id, kind: 'saves' \| 'screenshots' \| 'crash-reports' }` | `InstanceFile[]`                                                  |
| `instances.logs`               | `{ id }`                                                    | `string[]`                                                        |
| `instances.import`             | `{ path, name? }`                                           | `{ taskId }`                                                      |
| `instances.export`             | `{ id, path }`                                              | `{ taskId }`                                                      |
| `java.list`                    | 无                                                          | `JavaRuntime[]`                                                   |
| `java.inspect`                 | `{ path }`                                                  | `JavaRuntime`                                                     |
| `java.install`                 | `{ major }`                                                 | `{ taskId }`                                                      |
| `instances.detectDirectory`    | `{ path }`                                                  | `{ versionId, version, loader, loaderVersion?, launchVersion }[]` |
| `instances.importDirectory`    | `{ path, name?, versionId? }`                               | `{ taskId }`                                                      |
| `instances.clone`              | `{ id, name? }`                                             | `{ taskId }`                                                      |
| `backups.list`                 | `{ instanceId? }` 或无参，省略实例时列出全部历史            | `InstanceBackup[]`，按创建时间倒序                                |
| `backups.create`               | `{ instanceId }`                                            | `{ taskId }`                                                      |
| `backups.restore`              | `{ id }`，备份 ID                                           | `{ taskId }`，任务的 `instanceId` 指向恢复的新实例                |
| `backups.delete`               | `{ id }`，备份 ID                                           | `void`                                                            |
| `content.import`               | `{ instanceId, category, paths: string[] }`                 | `{ taskId }`                                                      |
| `accounts.addOffline`          | `{ name }`                                                  | `Account`                                                         |
| `accounts.remove`              | `{ id }`                                                    | `void`                                                            |
| `accounts.refresh`             | `{ id }`                                                    | `Account`                                                         |
| `accounts.microsoft.start`     | 无（Host 从 `.env` 读取客户端 ID）                          | `DeviceLogin`                                                     |
| `accounts.microsoft.poll`      | `{ id }`                                                    | `{ status: 'pending' \| 'complete'; account?: Account }`          |
| `accounts.yggdrasil.login`     | `{ server, username, password }`                            | `Account`                                                         |
| `resources.search`             | `ResourceQuery`                                             | `ResourceSearchResult`（items、total、hasMore、warnings）         |
| `resources.versions`           | `{ projectId, instanceId?, source? }`                       | `ResourceVersion[]`                                               |
| `resources.details`            | `{ projectId, source }`                                     | `ResourceDetails \| null`                                         |
| `resources.versionDetails`     | `{ projectId, versionId, source }`                          | `ResourceVersionDetails \| null`                                  |
| `resources.install`            | `{ projectId, versionId, instanceId?, source? }`            | `{ taskId }`                                                      |
| `content.list`                 | `{ instanceId }`                                            | `InstalledContent[]`（同步快照）                                  |
| `content.setEnabled`           | `{ instanceId, id, enabled }`                               | `void`                                                            |
| `content.remove`               | `{ instanceId, id }`                                        | `void`                                                            |
| `content.checkUpdates`         | `{ instanceId }`                                            | `{ taskId }`                                                      |
| `content.update`               | `{ instanceId, updates: ContentUpdateTarget[] }`            | `{ taskId }`                                                      |

Microsoft 登录使用 `.env` 的 `MICROSOFT_CLIENT_ID`，CurseForge 使用 `CURSEFORGE_API_KEY`，Modrinth 可选 `MODRINTH_TOKEN`。服务配置不进入界面设置或快照；Host 缓存后从环境移除服务凭据。玩家 Token 由主进程 safeStorage 加密保存，只在 Host 与系统桥接内传递。离线角色使用标准 OfflinePlayer UUID。

内存字段统一存储 MiB，默认 `4096`；界面以 GB 展示时换算。实例 `memory: null` 继承全局值。账号鉴权按账号记录的 `provider` 解析；实例账号 provider 为空时继承所选账号。

启动账号由共享 `launchAccountId` 解析：显式 `accountId` > 当前主页实例的 `launchAccount` > 实例默认账号 > 全局默认账号。主页选择不会泄漏到其他实例；切换实例会清空临时账号选择。启动任务绑定提交时的账号，重试也使用该账号；删除账号会清理全局、主页与实例引用。默认界面在账号不可用时显示选择弹窗，添加账号后回到启动确认。

实例设置中的“服务插件”按已启用提供者生成选项，保存到实例的 `providers`；账号服务可选择跟随所选账号。preload 的 `selectPath` 选择单文件或目录，`selectFiles` 使用原生多选文件窗口，取消返回空数组。本地内容导入将所选路径列表一次交给 `content.import`，由内容插件处理任务、冲突检查与文件复制。

启动选项为 `jvmArgs`、`gameArgs`（每个数组元素为一个原样传递的参数）、`resolution: { width, height }` 和 `fullscreen`。实例字段省略或为 `null` 时继承全局值；默认分辨率为 854×480。`autoDownloadJava` 默认启用，托管运行时位于数据目录的 `java/`，按主版本与平台隔离。已有游戏启动从本地版本文件读取 Java 要求；离线角色无需联网认证。

`instances.install` 同时用于已安装实例的文件修复，通过安装清单验证校验值。目录导入会复制来源目录，排除已知启动器账号文件；实例复制保留已安装内容元数据与启动设置。两者及整合包导入通过 `pendingOperation` 标记尚未完成的新实例，实例插件启动时清理遗留目录和记录。

内置长任务在 `Task.retry` 中保存 `{ command, params }`，参数不含账号凭据。`tasks.retry` 通过当前命令注册表执行，重新校验实例占用和插件状态；历史任务保持不变，返回新任务 ID。取消或进程中断不会自动重试。插件自定义任务未提供描述符时，仅当前 Host 生命周期内可使用原执行函数重试。

内容更新检查使用 `content-check` 任务，按来源报告进度并支持取消、重试。检查前清理旧更新提示；单个文件或来源失败会保留其他检查结果，在任务中报告失败详情。`InstalledContent.update` 保存 `{ versionId, version }`；旧的纯文本更新标签在载入时清除，重新检查后获得准确 ID。

`ContentUpdateTarget` 为 `{ source, projectId, versionId }`，以来源与项目 ID 标识更新目标。`content.update` 使用 `content-update` 任务串行安装这些明确目标，保留文件启用状态；当前列表的批量操作遵守分类和搜索筛选，同一来源的同一项目只提交一次。任务中断时保留已完成的项目，重试跳过已安装的目标版本。批次结束检查最终版本，依赖安装替换了其他所选版本时报告冲突。列表扫描保留扫描期间写入的新元数据，避免覆盖安装结果。

资源详情命令必须传项目实际的 `source`。`ResourceDetails` 包含 `description: { content, format: 'markdown' | 'html' }`、`gallery: { url, title?, description? }[]` 与项目 `url`；`ResourceVersionDetails` 包含相同格式的 `changelog` 及依赖列表。依赖有 `name`、`type`，以及可选的 `projectId`、`versionId`、`url`；类型为 `required`、`optional`、`incompatible`、`embedded`、`tool`、`include`、`unknown`。未实现对应可选方法的提供者返回 `null`，接口失败正常抛出错误。内置来源校验版本属于请求的项目，详情读取不修改实例或已安装内容。

## 实例版本变更

`game.versions`、`game.loaders` 传入 `instanceId` 时查询该实例的游戏提供者，省略时使用全局默认值。`InstanceVersionTarget` 为 `{ version, loader, loaderVersion? }`；Vanilla 清空加载器版本，其他加载器要求明确版本。目标必须存在于对应提供者的版本列表。

`instances.planVersionChange` 要求实例空闲，扫描已安装内容，按每个文件的来源查询目标游戏/加载器的版本列表。当前资源版本仍在列表时为 `compatible`，存在其他可用版本时为 `update-available`，无可用版本时为 `incompatible`；来源或版本身份缺失、查询出错时为 `unknown`，错误随条目返回。返回 `{ target, fingerprint, content }`，指纹涵盖当前版本、提供者配置、内容身份、启用状态和兼容结论，不包含展示文案。结论基于来源元数据，不读取模组代码或运行游戏。

`ChangeInstanceVersionInput` 为 `{ id, target, fingerprint, acceptRisks }`。命令启动 `version-change` 任务，重新获取当前预览并核对指纹；若变动，要求重新确认。有启用的非兼容条目时要求 `acceptRisks: true`。随后保存完整备份，安装目标，最后提交 `version`、`loader`、`loaderVersion`、`launchVersion`、`kind` 与就绪状态，并清除过时的内容更新提示。备份 ID 记入任务日志，可从实例备份页恢复。取消或安装失败保留原版本选择和已有内容；已完成的备份保留。重试沿用原目标与确认指纹，实例变化时要求重新预览。

## 实例备份

备份由 `nixel.instances` 注册。`InstanceBackup` 提供名称、原实例 ID、创建时间、游戏版本、加载器、归档字节数和文件数；列表不包含实例私有配置。磁盘格式为 `backups/<backupId>/{manifest.json,instance.zip}`，清单 `formatVersion: 1`，包含归档 SHA-256、实例设置与已安装资源记录。创建要求实例无游戏和任务占用。恢复始终创建新实例，保留文件禁用状态和两个来源的项目/版本 ID，重新生成实例与内容记录 ID，清除过时的内容更新提示；已删除账号的引用清空。恢复不依赖原实例仍存在，也不会更改主页的启动目标。归档损坏时停止恢复，不创建实例。

备份不收集 Host 的账号密钥存储；归档排除实例根目录的 `.nixel`、`launcher_accounts.json`、`launcher_profiles.json`、`launcher_profiles_microsoft_store.json`。支持空目录和文件修改时间，Unix 系统恢复文件权限。符号链接报告错误，不跟随到实例外部。

`settings.backupRetentionCount` 为 0–1000 的整数，默认 0 表示全部保留。新版本变更备份提交后，按实例清理超出数量的旧 `origin: 'version-change'` 备份。`origin: 'manual'` 和未标记来源的历史备份始终保留；正在恢复的备份跳过，删除与跳过结果记录在任务日志中。设置变更本身不立即删除备份。

## 开发检查

保留独立 `design/` 原型。功能代码位于 `src/`。使用 `pnpm typecheck`、`pnpm lint`、按需要构建与实际运行验证；不添加冒烟或回归测试文件。
