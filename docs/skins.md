# 皮肤与披风

账号页仅为声明 `appearance` 能力的账号提供者显示「皮肤与披风」。内置 Microsoft 正版账号提供此能力；离线和 Yggdrasil 账号不显示上传或披风管理入口。`nixel.skins` 是独立 Cordis 管理插件，负责文件边界、任务与 UI 命令；Microsoft 账号提供者持有认证和 Minecraft Services 协议。

对话框读取当前皮肤和账号实际拥有的披风，使用通用 MIT 库 `skinview3d` 渲染可旋转、缩放的 3D 角色。模型按服务返回的 Classic / Slim 选择，上传前可预览所选文件并明确选择手臂模型。披风选择先预览，点击「应用披风」后提交；「不使用披风」停用当前披风。没有纹理、加载失败或 WebGL 不可用时显示实际错误，不用 Steve 假装账号当前外观。

## 命令与契约

| 命令            | 参数                     | 结果                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------ |
| `skins.profile` | `accountId`、`requestId` | `AccountAppearance`，仅纹理、模型、默认皮肤标记与披风列表    |
| `skins.cancel`  | `requestId`              | 取消资料读取；关闭对话框或插件停用也释放请求                 |
| `skins.file`    | `path`                   | 经过完整 PNG 解码、CRC 与尺寸检查的预览、文件 SHA-256 和路径 |
| `skins.change`  | `accountId`、`change`    | Host 任务 ID                                                 |

`change` 为 `{kind: 'upload', path, model, sha256}`、`{kind: 'reset'}` 或 `{kind: 'cape', capeId}`；`capeId: null` 停用披风。上传文件必须是绝对路径、常规文件，PNG 长度不超过 16 KiB，宽 64、高 32 或 64。读取受大小上限约束，使用 `pngjs` 解码而不只看后缀或文件头。

`AccountProvider.appearance` 是可选公开契约，包含 `profile`、`upload`、`reset`、`cape`，均接收当前账号和取消信号。内置账号注册器据实现生成 `appearance` capability。Microsoft 实现沿用已有会话刷新与系统安全凭据存储，只在 Host 内向 `api.minecraftservices.com` 发送 Bearer token；返回界面的纹理只接受 Minecraft 官方纹理 CDN URL，并统一 HTTPS。

修改通过 `skin-update` Host 任务执行，串行限制到单个账号；任务中心提供取消、错误与手动重试。重试重新解析当前账号和提供者，上传前重新读取文件并对比原始 SHA-256，变化则要求重新选择。没有把令牌、图片内容写入任务记录，永久账号凭据处理保持原路径。任务完成后重新获取资料，服务返回失败不会显示为成功。

任务失败或取消后同样重新获取实际资料，并保留任务错误。取消只中断本地等待，服务端可能已经应用修改；界面不声称已回滚。

## 协议依据

核对 [Minecraft 官网 Java 皮肤与披风页面](https://www.minecraft.net/en-us/msaprofile/mygames/editskin) 的公开客户端实现（2026-11-04 获取的 `msaapps.js` 及其皮肤页面 chunk），独立实现：

- `GET /minecraft/profile`：读取皮肤、已拥有的披风与当前状态。
- `POST /minecraft/profile/skins`：multipart 字段 `variant`（`classic` / `slim`）与 `file`（PNG）。
- `DELETE /minecraft/profile/skins/active`：恢复服务选择的默认皮肤。
- `PUT /minecraft/profile/capes/active`：JSON `{capeId}`；提交前核对该披风仍归此账号所有。
- `DELETE /minecraft/profile/capes/active`：停用披风。

文件尺寸与 16384 字节限制同样来自官网客户端。参考 [skinview3d 官方 README](https://github.com/bs-community/skinview3d) 的渲染 API；没有引入 XMCL 或其他启动器代码。官网接口没有保证长期兼容的公开版本协议，后续以实际服务错误和官方客户端变化调整，不添加自动重放写请求。

没有真实 Microsoft 账号时，仅能用隔离协议夹具验证请求路径、认证头、上传表单、响应校验及错误，并用独立账号提供者验证 UI 与任务；不能据此声称已在真实账号完成皮肤或披风修改。
