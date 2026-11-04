# 自定义代理认证

`nixel.network` 为自定义 HTTP / HTTPS 代理提供 Basic 用户名密码认证。SOCKS5 仍只支持无认证模式：Chromium 官方明确不支持 SOCKS5 认证，因此界面和 Host 都拒绝把此功能应用到 SOCKS5。

## 数据与保存

公开 `NetworkConfiguration` 只保存 `mode`、规范化 `proxyUrl`、`username` 与随机 `credentialId`。`network.configure` 接受一次性 `authentication` / `username` / `password` 参数；密码不会出现在插件配置、Host 快照、任务重试参数、状态返回或日志中。内置网络插件的配置 schema 拒绝额外字段，不能通过通用 `plugins.configure` 把密码误存为公开配置。

凭据使用现有主进程 `SecretStorage` 和系统 `safeStorage` 加密，记录同时绑定规范化代理 URL 与用户名。留空密码只会保留同一绑定的现有凭据；更换地址或用户名需要输入新密码，或明确关闭认证。`network.status` 只报告 `hasPassword`，不返回密码。

保存先创建新凭据记录，再更新公开配置与插件运行状态，成功后删除旧记录。配置应用或持久化失败由 Host 统一恢复原配置；网络插件只清理当前运行配置和持久配置均未引用的新记录。恢复失败时保留仍被引用的记录，避免破坏恢复所需凭据。旧凭据删除失败只报告清理警告，不把已应用的设置报告为未保存。

关闭认证、切换 system/direct 或替换凭据成功后删除已不再使用的旧凭据。停用网络插件仅清理运行时认证和连接缓存，保留持久配置及加密凭据供再次启用。

## 请求与生命周期

- Host 在运行时读取绑定凭据，仅将 Basic token 提供给对应自定义代理的 Undici `ProxyAgent`，不把凭据拼入代理 URL，也不设置目标站点的 `Authorization`。系统代理/PAC 路由不复用自定义代理密码。
- 主进程处理 Chromium `app.login`，只回答当前配置端点的代理 Basic 挑战：必须 `isProxy`、`scheme=basic`、规范化 host 与有效 port 相同；有 `webContents` 时还必须来自已注册的启动器 Session。Electron 45 的 `firstAuthAttempt` 按请求限制错误凭据重试，不用全局一次性标志阻断后续请求。
- 配置切换时暂停凭据应答，关闭连接、清理 HTTP auth 缓存，再应用新配置；失败恢复原配置。Host 异常退出也清理认证并恢复系统代理。应用退出释放认证监听器和内存引用。
- `registerNetworkSession` 将启动器自有的附加 Chromium Session 纳入同一代理和缓存生命周期。初始化附加消费者时应先等待注册完成。
- Chromium 的 `session.fetch` 在此次 Electron 45 实测中未向 `app.login` 发出 407 挑战；`net.request` 有独立的 `login` 事件。主进程消费者可使用 `answerProxyAuthentication` 经回调应答，未匹配时取消；消费者必须管理自己的有界重试。启动器更新模块使用公开 updater login 事件，每次串行检查/单文件下载操作最多应答一次，适用范围由更新模块文档说明。

保存连接设置并不主动探测代理是否接受密码；用户可随后使用“检查连接”。错误密码导致请求失败，不会自动改用其他代理或直连。

## 验证

独立数据目录与本地真实 HTTP/HTTPS 认证代理验证：Windows safeStorage 加密持久化、Chromium renderer 首次与重复请求、错误密码取消、目标站点 401 不获取代理密码、地址切换清缓存、附加 Session，以及 Host 原生 fetch 经 `setGlobalDispatcher` 的真实 Undici 请求。测试进程单独信任本地 fixture TLS 证书，产品 TLS 校验保持原样。

完整应用界面验证保存后密码字段为空、状态与任务无密码、地址变更需重新提供密码，以及切换直连删除原凭据；真实 Minecraft 与 Modrinth 连接检查已通过本地认证 CONNECT 代理。

另外以注入保存失败的隔离配置 fixture 验证新旧凭据事务、绑定不匹配拒绝、关闭认证清理与恢复失败保留记录。没有新增仓库测试文件或 CI。

## 官方依据

- [Electron app login](https://www.electronjs.org/docs/latest/api/app#event-login)：挑战信息、回调取消及 `firstAuthAttempt`。
- [Electron Session clearAuthCache](https://www.electronjs.org/docs/latest/api/session#sesclearauthcache)：清理 HTTP 认证缓存。
- [Electron ClientRequest login](https://www.electronjs.org/docs/latest/api/client-request#event-login)：主进程请求的代理认证事件。
- [Undici ProxyAgent](https://undici.nodejs.org/api/ProxyAgent)：`token`、Basic 认证与代理头规则。
- [Chromium proxy 文档](https://github.com/chromium/chromium/blob/main/net/docs/proxy.md)：SOCKS5 不支持认证。
