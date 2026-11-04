# 实例服务器

实例的「服务器」页保存名称与地址，支持新增、编辑、删除、按条目刷新状态和加入。列表通过 `Instance.servers` 与实例一起持久化；查询结果只保存在当前页面，记录查询时间，失败明确显示错误，不将失败显示为零人在线。此列表独立于游戏内的 `servers.dat`。

`nixel.servers` 是独立 Cordis 业务插件，注册以下命令：

| 命令             | 参数                                       | 结果                                                                 |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `servers.save`   | `instanceId`、可选 `id`、`name`、`address` | 保存后的 `SavedServer`                                               |
| `servers.delete` | `instanceId`、`id`                         | 删除此记录                                                           |
| `servers.status` | `instanceId`、`id`、`requestId`            | `ServerStatus`：版本、在线/最大人数、Ping 延迟、纯文本介绍、查询时间 |
| `servers.cancel` | `requestId`                                | 取消该查询                                                           |

地址接受域名、IPv4 与方括号 IPv6，可带 1–65535 端口，默认 25565。不带显式端口的域名查询 `_minecraft._tcp` SRV，按最低优先级和权重选择目标；没有记录时使用原域名，DNS 故障会显示错误。状态查询保留原域名作为握手地址，仅 TCP 连接使用 SRV 目标。

状态模块独立实现 Java 1.7+ 的 TCP Handshake → Status → Ping/Pong，读取分段 VarInt 帧并校验 JSON、包长与 Ping 回显。响应包最多 128 KiB，整个查询含 DNS 最长 8 秒；页面离开、用户取消和插件停用均释放查询资源。延迟是 Ping/Pong 往返时间，不包含 DNS 和 TCP 建连。当前不实现 Bedrock、1.6 及更早版本的旧式 Ping，也不根据状态查询结果断言账号可以加入。

## 快速加入

界面调用既有启动账号流程；缺失或不匹配的账号仍通过选择/新增账号对话框解决，所选服务器跨对话框保留。`instances.launch` 新增可选 `server` 字符串，校验后传给 `GameProvider.launch(instance, account, task, options?)` 的 `options.server`。提供者须声明 `server-join` capability；不支持时报告错误。

Minecraft 提供者根据合并后的官方版本参数是否声明 `--quickPlayMultiplayer` 选择 Quick Play（1.20 系列及对应快照开始），旧版使用 `--server` / `--port`。现代版本把原始域名交给游戏解析，不提前用 SRV 结果替换。仅本次启动移除已保存参数中的其他服务器/单人/Realms 加入目标，追加此次选择；永久 JVM/游戏参数保持原样。启动任务重试保存准确服务器地址和账号 ID，重新解析当前实例、账号与提供者。

服务器在线查询和游戏启动是独立操作。查询失败仍可尝试加入；游戏是否成功连接由游戏自身报告，启动器沿用实际游戏进程、退出码与日志。

## 设计依据

列表入口参考 [PrismLauncher ServersPage](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/ui/pages/instance/ServersPage.cpp)，状态协议交互对照其 [McClient 实现](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/ui/pages/instance/McClient.cpp)。仅参考职责和线协议，没有引入或复制启动器代码。Mojang 没有在官网发布完整 Java 状态线协议；Quick Play 参数与旧 `server`/`port` 移除依据 [Mojang 23w14a 发布说明](https://www.minecraft.net/en-us/article/minecraft-snapshot-23w14a)，SRV 选择依据 [RFC 2782](https://www.rfc-editor.org/rfc/rfc2782)。
