# 网络连接

设置 → 下载与网络 → 连接方式提供跟随系统、直接连接、自定义代理。默认跟随系统。自定义地址支持 `http://host:port`、`https://host:port` 与 `socks5://host:port`；地址不包含用户名、密码、路径和查询参数。HTTP/HTTPS 的 Basic 认证通过独立字段设置，密码经系统安全存储加密，详见 [代理身份验证](proxy-authentication.md)。

配置保存在 `nixel.network` 插件配置中，通过 `network.configure` 应用并持久化。任务或游戏运行期间沿用插件管理的占用规则，完成后再修改。切换配置会关闭旧连接池；后台 API/下载和默认界面的远程图片使用相同代理配置。Java 游戏与服务器状态的 TCP 连接独立于启动器 HTTP 设置。

## 进程与插件职责

- `main/network.ts` 提供 Electron Session 的代理配置、路由解析、缓存清理与绑定端点的认证应答，经 Host 平台桥接调用。
- `plugins/network/configuration.ts` 验证配置；`configure.ts` 管理凭据记录和配置保存；`dispatcher.ts` 使用通用 Undici Agent/ProxyAgent 分发请求，`index.ts` 负责 Cordis 生命周期与命令。
- Host 通过 Undici `setGlobalDispatcher` 接入已有标准 `fetch` 调用，无需各资源或认证插件另写代理逻辑。系统模式每次请求向 Electron 查询系统/PAC 路由；使用返回的第一条路由，失败时显示错误，不重放请求或自动直连。当前支持 DIRECT、PROXY、HTTPS、SOCKS5 路由。
- 游戏、双来源资源和在线账号提供者声明对网络插件的依赖。插件停用或重载时释放自己的连接池，恢复原 dispatcher 与系统 session 配置。

| 命令                | 参数                                                      | 返回                                                        |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `network.status`    | 无                                                        | `{ mode, proxyUrl, username?, credentialId?, hasPassword }` |
| `network.configure` | `{ mode, proxyUrl, authentication, username, password? }` | `void`                                                      |
| `network.check`     | 无                                                        | `{ taskId }`                                                |

连接检查依次请求 Minecraft 官方版本服务与 Modrinth，每个请求最长 15 秒，可取消并在任务中心查看结果；它不验证账号权限或 CurseForge Key。

## 验证与依据

在隔离 Electron 数据目录通过中英文设置保存代理；本地转发代理记录到 Host 的 Minecraft/Modrinth HTTPS CONNECT 和 Chromium 的 Modrinth CDN 图片 CONNECT，检查任务完成、图片解码成功。另以本地 HTTP/SOCKS5 服务核对直连、POST 请求体、系统路由分发、解析失败、未知代理类型与路由等待期间取消。未修改用户的操作系统代理设置。

系统能力依据 [Electron Session](https://www.electronjs.org/docs/latest/api/session)，HTTP 分发依据 [Undici ProxyAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md) 与 [global dispatcher](https://github.com/nodejs/undici)。此处复用通用网络库，不引入启动器 SDK。
