# 可选下载镜像

设置 → 下载与网络 → Minecraft 下载来源提供官方（默认）、BMCLAPI、自定义 BMCLAPI 兼容 HTTPS 镜像。自定义地址只接受源地址，例如 `https://mirror.example.org`，可包含端口，不能包含路径、凭据、查询参数或片段。选择镜像代表将适用文件的请求发送给该镜像及其 HTTPS 分发节点。

此能力属于 `nixel.downloads` 的文件路由，复用现有队列、暂停、限速、哈希验证及 `nixel.network` 代理。没有额外插件、全局 fetch 替换或各协议客户端的切源逻辑。两个设置表单分别更新配置，服务端将更新合并到当前配置再统一校验，修改镜像不会重置并发或限速，反之亦然。活动任务和游戏仍按现有规则阻止重配置。

## 适用文件

只映射 HTTPS、默认端口、无凭据/查询/片段的精确官方主机与以下路径，且调用方必须提供格式有效的 SHA-1、SHA-256 或 SHA-512 预期哈希。哈希始终来自原始官方清单，不向镜像查询替换值。

| 原主机与路径                                              | 镜像路径                     |
| --------------------------------------------------------- | ---------------------------- |
| `resources.download.minecraft.net/{hash前2位}/{40位hash}` | `/assets/{hash前2位}/{hash}` |
| `libraries.minecraft.net/{合法库路径}.jar` 或 `.zip`      | `/maven/{原路径}`            |
| `launcher.mojang.com/v1/objects/{40位hash}/{文件名}`      | 原路径                       |
| `piston-data.mojang.com/v1/objects/{40位hash}/{文件名}`   | 原路径                       |

资产前缀须与哈希前两位一致；库路径和对象文件名限通常的字母、数字、点、下划线、加号、连字符。主机后缀相似、URL 编码路径、未知路径、缺少适用哈希均不映射。此范围包含 Minecraft 核心文件、官方库、资产和 Mojang Java 运行时文件，不代表所有下载都会加速。

API 元数据（版本清单、资产索引和 Java 清单等）、认证、Modrinth、CurseForge、加载器及其他第三方文件保留原来源。白名单外的文件使用原 URL 是固定适用范围，不是失败回退；镜像请求失败直接报告错误，不静默重试官方源。镜像内容不匹配官方哈希时丢弃片段并拒绝提交。

每个任务按适用文件类别记录一次所选来源，仅记录「官方」或镜像 host，不记录路径、完整 URL 或令牌。实际路由 URL 参与片段身份摘要，切换源不会把旧源片段拼到新源响应。原有缓存不保存明文 URL。

## 配置与传输

`DownloadConfiguration.mirror` 为 `{ mode: 'official' | 'bmclapi' | 'custom', baseUrl: string }`。旧配置缺省为官方；非 custom 模式的 `baseUrl` 保存为空。`downloads.configure` 接受部分顶层配置，例如 `{ mirror: { mode: 'bmclapi', baseUrl: '' } }`；`downloads.status` 返回完整生效配置。

文件下载手动处理最多 20 次 301/302/303/307/308 重定向，支持相对 Location，每次发请求前校验 HTTPS 与无 URL 凭据。拒绝降级 HTTP，不等到明文请求已发送后才检查最终 URL；每个重定向响应 body 释放后再继续，取消信号贯穿所有跳转与传输。范围请求头随重定向保留，最终响应仍遵循下载模块的 200/206/416 与哈希规则。

映射依据为 [BMCLAPI 官方文档](https://bmclapidoc.bangbang93.com/) 的 Assets、Libraries、版本文件替换和 Java 路径说明。文档中的旧 `launcher.mojang.com` 与现代 `piston-data.mojang.com` 对象路径相同；实现现代域名映射前，已读取 [Mojang Java 清单](https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json)，并实际下载其 Windows Java 21 对象 `b4e55947787eb9cdb5998ee1b77c3bd14a35accf` 的 BMCLAPI 同路径文件（22,136 字节），确认 SHA-1 与官方清单一致。该在线检查与本地协议 fixture 验证分别记录，不把 fixture 结果当作线上可用性保证。
