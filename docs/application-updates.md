# 启动器自身更新

设置 → 关于 Nixel → 启动器更新提供手动检查、版本说明、下载进度、取消和「重启并安装」。自动检查默认关闭，开启后每次启动最多检查一次；不会自动下载或静默安装。下载操作进入任务中心。点击安装还需明确确认，且所有游戏和任务（包括暂停任务）必须结束。

没有真实发布源时显示「尚未配置」，不请求示例地址，也不把当前版本伪装成线上最新版本。开发构建不执行应用内安装。版本说明按文本展示，远程 HTML 不执行。

## 发布配置

主进程通过现有 `.env` / `.env.local` 加载器读取以下公开值，随后移除进程环境键，避免传给 Host 或游戏进程：

- `NIXEL_UPDATE_FEED_URL`：真实 HTTPS generic electron-updater 发布目录，包含 `latest.yml`、`latest-mac.yml` 或 `latest-linux.yml` 及对应资产。不能含 URL 凭据、查询参数或片段。
- `NIXEL_UPDATE_RELEASE_URL`：可选的公开 HTTPS 人工下载页面，用于不支持自更新的平台。
- `NIXEL_UPDATE_PUBLISHER`：Windows 更新预期的 Authenticode 证书发布者公开名称；不是证书或私钥。缺失时不提供安装。

不需要向启动器提供私有发布令牌。主进程在用户数据目录生成标准 `application-update.yml`（使用合法 YAML 的 JSON 子集），仅含公开源、更新缓存目录名和 Windows publisher。签名私钥与发布凭据不进入包、应用设置或渲染端。

当前仓库仍保持 `publish: null` 和 `--publish never`。本功能不创建线上 feed、不签名、不上传、不修改远程 release。发行方须另行用 electron-builder 产生匹配版本/平台的更新元数据和签名资产，发布到配置目录；只上传普通安装包而缺少 metadata 不能用于检查更新。

## 平台与校验

实现使用 `electron-updater 6.8.11`，沿用其版本比较、系统版本条件、SHA-512 校验、下载缓存和平台安装机制，不重做签名或平台更新器。禁止降级、预发布和 NSIS web installer；关闭差分下载，使用单文件传输。

- Windows：已安装的 NSIS 版本（安装目录具有 `Uninstall NixelLauncher.exe`）及配置的签名 publisher。便携版、解压目录手动更新，不承诺自替换。
- macOS：已签名应用，发布必须同时包含 dmg/zip 所需的更新资产；签名验证与 Squirrel.Mac 安装由官方库处理。未签名包不能保证更新安装成功。
- Linux：只对 AppImage 提供应用内更新；DEB 和其他形式引导人工更新，交给系统包管理流程。

检查结果的每个资产 URL 必须为 HTTPS、无 URL 凭据，且提供格式有效的 SHA-512；签名和文件完整性最终由 updater 校验。独立 updater 网络 Session 拦截非 HTTPS 远程请求，包括重定向后的降级。macOS 原生 Squirrel 与 updater 本地文件服务间的回环通信由库处理，不经过此远程 Session。

检查结果另经 semver 校验，明确拒绝预发布版本。已下载版本独立保存：后续检查失败、取消、返回其他版本都不会撤销其安装入口；确认框显示实际已下载版本，安装使用库已暂存的文件。开始下载另一版本时清除旧入口，因为 updater 可能替换或清理缓存；不会把新检查结果误认为已下载文件。

Updater Session 注册到现有网络配置。公开 `login` 事件复用主进程的代理凭据匹配函数，只接受当前配置代理的主机、端口、`isProxy` 和 Basic 挑战。每次串行检查或单文件下载至多回应一次凭据，依靠 Session 认证缓存供后续请求复用；再次挑战取消并报告 `PROXY_AUTHENTICATION_FAILED`。需要同一次操作内多次独立认证挑战的代理流程不受支持。不会替换 updater 的私有 HTTP executor。

更新错误只向界面和任务提供安全的错误码说明，库内部包含完整签名 URL 或响应体的日志不公开。取消下载调用 updater 的 CancellationToken；重试需重新检查。取消检查忽略其晚到结果，底层元数据请求由库结束，不承诺取消立即中断已发出的检查请求。Host 停止、崩溃或重启时取消下载；已下载更新不会在普通退出时自动安装。

## 职责与交接

`nixel.app-updates` Cordis 插件负责命令、自动检查偏好、Host 任务与生命周期。`src/main/app-updates` 只包装 Electron updater 能力：配置、控制器、平台初始化和安装交接；UI 在独立 `renderer/src/app-updates` 目录。没有新增渲染 IPC 或平行下载器。

公开类型在 `shared/app-updates.ts`。HostPlatform 的 `appUpdates(action)` 使用现有平台桥接；action 为 `status/check/download/cancel/install`。业务命令为 `appUpdates.status/check/download/install/configure`，`configure` 接受 `{ autoCheck: boolean }`，检查/下载返回 `{ taskId }`。状态包括可用性原因、检查/下载/安装阶段、版本、纯文本说明、字节进度和安全错误信息。

安装命令不创建普通任务：通过 `TaskManager.whileIdle` 复用 Host 的生命周期短锁，并在锁内检查游戏。主进程再次校验快照、冻结新业务 IPC，返回平台确认，再于下一事件循环停止 Host。插件收到确认后持锁直到作用域 dispose，避免停机期间后台插件启动新任务。Host 停止后才调用 `quitAndInstall`，避免 Host 等平台回复而主进程等 Host 退出的死锁。

冻结前的失败直接返回命令错误并释放锁；平台确认后立即回复安装命令，锁本身继续保持到插件 dispose，避免停机失败时遗留悬挂的命令。冻结后的停止/安装失败记录错误、重新启动 Host 并解除冻结。无法重新启动时窗口显示明确错误，用户可手动重启。交接验证使用隔离数据、Host 任务锁与 fixture updater；真实 UtilityProcess 交接尚未实测，不会在开发验收时执行真实安装器。

Windows updater 在启动安装器后会排队退出。若在该次公开 `before-quit-for-update` 事件之前已收到安装失败，只拦截紧随其后的那一次退出并恢复 Host；之后用户正常退出仍可用。该保证不涵盖退出之后才发生的外部安装器失败，也不代表安装器执行成功。实际调用安装器后失败，需要重启启动器才可再次安装，以重置官方库的安装状态；不修改其私有字段。调用安装器之前的 Host 停止失败不要求此重启。临时 fixture 覆盖保留下载、预发布拒绝、一次性退出消费与失败恢复，未运行真实安装器。

依据：[electron-builder v26 更新文档](https://www.electron.build/v26/docs/features/auto-update/)、[electron-updater 6.8.11 发行代码](https://unpkg.com/electron-updater@6.8.11/out/MacUpdater.js)、[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)。真实签名安装、跨平台退出安装及真实发布源仍需要对应签名发行包和发布环境验证。代理基础能力和操作级登录预算分别验证过，真实 electron-updater 经认证代理完成检查到下载的全链路尚未实测。
