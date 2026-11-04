# 下载管理

`nixel.downloads` 是独立 Cordis 插件，通过 `downloads` 提供者拥有文件下载队列、传输、续传缓存和配置。Host 任务只提供暂停/继续回调与活动状态；`files.download` 在 Host 的异步任务上下文中解析公开提供者。网络请求使用全局 `fetch`，沿用网络插件的代理配置。

下载插件声明依赖网络插件；实例、Minecraft、Modrinth、CurseForge 与第三方账号插件声明依赖下载插件。现有依赖规则阻止在这些插件仍活动时停用下载插件；活动任务（包括暂停与排队）也阻止插件停用或重配置。按依赖顺序停用后，下载提供者随作用域撤销；任何其他插件调用都会收到缺少提供者的错误，不会绕过调度直接下载。

## 使用与边界

任务中心在任务有文件下载等待或执行时显示「暂停下载」；暂停后显示「继续下载」。同一任务的并行下载统一暂停，释放网络名额，但保持原安装调用及实例占用。继续恢复该调用，不重新启动安装。文件校验、解压、加载器安装程序和元数据 API 请求不单独提供暂停。并行非下载工作可能完成当前步骤，然后等待下载继续。

设置中的「下载调度」保存全局并发数（1–32）与总限速（KiB/s，0 不限速）。配置属于插件，所有任务共用；已有 `settings.downloadConcurrency` 仅作为首次配置的默认值。需在任务和游戏结束后保存。限速控制所有文件下载接收/写入总量，允许最多 64 KiB 初始突发；HTTP 元数据及登录请求不受此限制。

取消会退出原任务并删除其持有的未完成下载。已完成文件由各安装流程按原有规则处理。网络失败保留可续传片段供用户重试；不自动重试网络故障。重试仍按现有命令重新解析实例、提供者和安装计划。重启把中断任务标为失败，不恢复 JavaScript 调用栈；只有后续操作再次使用相同目标、URL 与哈希时才复用片段。临时目录改变或签名 URL 变化会重新下载。正常关闭取消活动下载并清理片段，异常退出遗留片段可由后续相同操作复用。清除任务历史不会清除下载缓存。

官方 Java 安装使用清单哈希固定暂存路径，失败或取消后保留完整文件，下一次安装先复核再复用；同清单网络失败留下的可续传片段也能继续使用。不同清单隔离，完整运行时验证后才提交为可用 Java，具体规则见 [Java 安装恢复](java-runtime-recovery.md)。

## 文件身份与提交

片段保存于 Host `cache/downloads`，以目标路径摘要命名；身份元数据只保存 URL 与预期哈希的组合摘要、强 ETag 或合格 Last-Modified、文件总长，不保存完整 URL 或查询令牌。实例备份和诊断包不包含该缓存。

续传发送 `Range` 与 `If-Range`。206 必须具有正确的 `Content-Range`、一致的验证标识和总长，声明的长度必须与实际响应一致。Last-Modified 只在响应 Date 至少晚 60 秒时用于续传。缺少可用验证标识则从头下载。服务器返回 200 时替换旧片段；416 仅在片段长度与总长一致且最终哈希验证通过时提交，否则清除片段并发起完整请求。错误范围、验证标识变化和哈希错误拒绝提交并丢弃片段。

下载完成后按调用方提供的最强哈希校验（SHA-512、SHA-256、SHA-1、MD5）。没有预期哈希的资源依赖 HTTPS、响应长度与续传验证标识，不声称具备独立内容哈希验证。文件先完整写入缓存，再移动至目标；跨磁盘时复制到目标旁的唯一临时文件后重命名。最终路径不会暴露半下载文件。

## 公开接口

- `downloads.status` → `{ concurrency, bytesPerSecond }`。
- `downloads.configure({ concurrency, bytesPerSecond })`：校验并持久化插件配置，使用现有插件配置生命周期重载。
- `tasks.pause({ id })` / `tasks.resume({ id })`：调用当前任务控制；不在可暂停阶段时返回明确错误。
- `TaskContext.setControls({ pause, resume } | undefined)` 与 `setActivity('paused' | 'queued' | undefined)`：通用任务控制。
- `Task.canPause` 与 `Task.activity`：界面展示；暂停和排队的 `status` 仍为 `running`，保持占用规则。
- `DownloadProvider.download(request, task)`：请求包含 URL、目标、取消信号、可选哈希与字节进度；调用整个任务期间的下载按 `taskId` 聚合控制。类型见 `src/shared/downloads.ts`。

实现分为 `index.ts`（配置/注册）、`scheduler.ts`（队列/任务控制）、`transfer.ts`（HTTP/提交）、`partial.ts`（缓存身份）、`rate-limit.ts`（总限速）。

协议依据：[RFC 9110 If-Range](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-range)、[Content-Range](https://www.rfc-editor.org/rfc/rfc9110.html#name-content-range)；任务上下文使用 [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage)。
