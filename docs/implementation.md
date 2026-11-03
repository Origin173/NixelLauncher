# Nixel 实现约定

以 `design/` 批准版作为默认 UI。Electron 主进程管理窗口与系统能力，preload 暴露 `NixelBridge`，独立 Utility Process 内的 Cordis root 组合可信业务插件。实例独立，插件全局安装启用，实例分别选择服务提供者。默认 UI 可由本地可信 UI 插件替换。

共享类型位于 `src/shared/contracts.ts`，Host 插件接口位于 `src/shared/host-api.ts`。内置插件由 `src/plugins/builtin.ts` 导出 `builtinPlugins: BuiltinPlugin[]`。每个插件通过 `ctx.nixel.commands.register(ctx, name, handler)` 注册命令，并通过 `providers.register(ctx, descriptor, implementation)` 注册 provider；注册项随 Cordis 插件 dispose 撤销。业务命令通过实例的 provider ID 解析实现。

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
| `game.versions`                | 无                                                          | `VersionEntry[]`                                                  |
| `game.loaders`                 | `{ version, loader }`                                       | `VersionEntry[]`                                                  |
| `instances.create`             | `CreateInstanceInput`                                       | `{ instanceId, taskId? }`                                         |
| `instances.update`             | `{ id, patch: Partial<Instance> }`                          | `void`                                                            |
| `instances.delete`             | `{ id, deleteFiles: boolean }`                              | `void`                                                            |
| `instances.install`            | `{ id }`                                                    | `{ taskId }`                                                      |
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
| `content.import`               | `{ instanceId, category, paths: string[] }`                 | `{ taskId }`                                                      |
| `accounts.addOffline`          | `{ name }`                                                  | `Account`                                                         |
| `accounts.remove`              | `{ id }`                                                    | `void`                                                            |
| `accounts.refresh`             | `{ id }`                                                    | `Account`                                                         |
| `accounts.microsoft.start`     | 无（Host 从 `.env` 读取客户端 ID）                          | `DeviceLogin`                                                     |
| `accounts.microsoft.poll`      | `{ id }`                                                    | `{ status: 'pending' \| 'complete'; account?: Account }`          |
| `accounts.yggdrasil.login`     | `{ server, username, password }`                            | `Account`                                                         |
| `resources.search`             | `ResourceQuery`                                             | `{ items: Resource[], total: number }`                            |
| `resources.versions`           | `{ projectId, instanceId?, source? }`                       | `ResourceVersion[]`                                               |
| `resources.install`            | `{ projectId, versionId, instanceId?, source? }`            | `{ taskId }`                                                      |
| `content.list`                 | `{ instanceId }`                                            | `InstalledContent[]`（同步快照）                                  |
| `content.setEnabled`           | `{ instanceId, id, enabled }`                               | `void`                                                            |
| `content.remove`               | `{ instanceId, id }`                                        | `void`                                                            |
| `content.checkUpdates`         | `{ instanceId }`                                            | `InstalledContent[]`                                              |

Microsoft 登录使用 `.env` 的 `MICROSOFT_CLIENT_ID`，CurseForge 使用 `CURSEFORGE_API_KEY`，Modrinth 可选 `MODRINTH_TOKEN`。服务配置不进入界面设置或快照；Host 缓存后从环境移除服务凭据。玩家 Token 由主进程 safeStorage 加密保存，只在 Host 与系统桥接内传递。离线角色使用标准 OfflinePlayer UUID。

内存字段统一存储 MiB，默认 `4096`；界面以 GB 展示时换算。实例 `memory: null` 继承全局值。账号鉴权按账号记录的 `provider` 解析；实例账号 provider 为空时继承所选账号。

启动选项为 `jvmArgs`、`gameArgs`（每个数组元素为一个原样传递的参数）、`resolution: { width, height }` 和 `fullscreen`。实例字段省略或为 `null` 时继承全局值；默认分辨率为 854×480。`autoDownloadJava` 默认启用，托管运行时位于数据目录的 `java/`，按主版本与平台隔离。已有游戏启动从本地版本文件读取 Java 要求；离线角色无需联网认证。

`instances.install` 同时用于已安装实例的文件修复，通过安装清单验证校验值。目录导入会复制来源目录，排除已知启动器账号文件；实例复制保留已安装内容元数据与启动设置。两者及整合包导入通过 `pendingOperation` 标记尚未完成的新实例，实例插件启动时清理遗留目录和记录。

内置长任务在 `Task.retry` 中保存 `{ command, params }`，参数不含账号凭据。`tasks.retry` 通过当前命令注册表执行，重新校验实例占用和插件状态；历史任务保持不变，返回新任务 ID。取消或进程中断不会自动重试。插件自定义任务未提供描述符时，仅当前 Host 生命周期内可使用原执行函数重试。

## 开发检查

保留独立 `design/` 原型。功能代码位于 `src/`。使用 `pnpm typecheck`、`pnpm lint`、按需要构建与实际运行验证；不添加冒烟或回归测试文件。
