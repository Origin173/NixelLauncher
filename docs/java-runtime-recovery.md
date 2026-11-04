# 官方 Java 安装恢复

Java 探测与运行时安装分别位于 `src/plugins/java/discovery.ts`、`install.ts`；安装专用的 `manifest.ts` 负责官方清单及暂存文件边界。`src/plugins/java.ts` 保留原有导出，Cordis 插件、DownloadProvider 和任务重试接口不变。

安装先从官方索引选择准确清单，以平台、Java 主版本和清单 SHA-1 组成稳定目录：`java-<major>-<platform>.installing-<manifest-sha1>`。同一清单重试时下载目标不变。`installFiles` 按 size/SHA-1 复核已有完整文件，只重新下载缺失或损坏的项；新下载继续由下载插件校验哈希。网络失败后再次安装或重启应用再重试，都能使用这些文件。支持恢复的下载片段仍由下载插件依据稳定目标、请求身份和服务器验证器处理，不增加自动重试。

取消保留已完成文件，下一次使用前重新校验；下载插件继续按原规则清理被取消请求的片段。任务仍为取消或失败，保留提示不会转换为成功，原错误保存在任务记录。不同清单使用不同暂存目录，不相互混用；旧清单缓存不会被自动删除。只有完整文件布局、大小、可执行位与 Java 主版本探测通过后，暂存目录才重命名为正式运行时。`.installing` 目录不会参与托管 Java 的发现。

下载前不跟随链接检查暂存树：根目录和父目录不能是符号链接或 junction，已有普通文件不能由链接替代，未知额外文件被拒绝。清单路径仍使用现有相对路径边界校验；父路径类型冲突和 Windows 大小写别名被拒绝。官方链接只接受指向暂存树内清单项的相对目标，保证重命名后仍成立；重试时，已有链接必须与声明的目标一致。提交前再检查完整布局和大小；不重复计算整套文件的哈希。暂存目录中仅额外允许由安装器保存的 `.nixel-runtime.json`，下载片段存放在下载插件自己的缓存目录。

职责拆分参考了 Prism Launcher 官方 [ManifestDownloadTask.cpp](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/java/download/ManifestDownloadTask.cpp) 中清单获取/哈希验证与清单文件下载/可执行位处理的分离；没有复制代码。稳定目录及失败恢复策略是 Nixel 的独立实现，不声称 Prism 使用相同恢复机制。

## 隔离验证

验证文件和结果只保存在忽略的 `output/java-recovery-check/`，不添加仓库测试或框架。实际调用 `installJava`、`installFiles` 和 `DownloadScheduler`，由受控 HTTPS 响应提供官方格式的索引、带准确哈希/大小的清单及小文件；未重新下载完整官方 Java。Windows 可执行文件仅为输出版本信息的 .NET stub，用于确认探测与提交顺序，不是真实 JVM。

通过的场景：网络断流后保留完成文件并从 `bytes=16384-` 继续；同清单目标稳定；篡改一个完成文件后仅重下该项；取消后保留完整文件并清理片段；全新 Node 进程继续相同暂存目录并复用完整文件及片段；清单变化隔离；可执行探测失败后重试；成功后暂存目录已重命名；暂存父目录 junction 被拒绝且外部标记未改变；绝对、越界、未知目标链接、父路径冲突与 Windows 大小写别名被拒绝。

Linux 合法文件符号链接恢复已在 Ubuntu 24.04 / WSLg 通过：在同一清单的稳定暂存目录预先保留官方 `legal/java.compiler/LICENSE → ../java.base/LICENSE` 及已校验目标文件，再通过真实 Host 执行安装。完成后链接和目标 inode 均保留，暂存目录已重命名。正式运行时的 136 个文件逐项通过 SHA-1/大小校验，205 个相对链接与清单一致，31 个可执行文件权限为 `0755`；实际探测为 Microsoft Java 21.0.7。证据在 `output/linux-release/wsl-recovery-java-verified.json`。

真实官方清单检查覆盖 Windows、Linux、macOS 的 Java 21.0.7：从 Mojang 下载清单并核对 SHA-1/大小后，新解析器全部接受，Linux/macOS 清单各包含 205 个链接。此检查只验证元数据，不执行对应平台的 Java。

Windows 进一步使用真实官方运行时：只读复制此前验证目录的 402 个清单文件，在独立暂存中损坏 `conf/logging.properties` 后调用实际安装与下载提供者。401 个文件复用，仅重新下载该文件的 2,732 字节，SHA-1 与官方清单一致；实际探测为 Microsoft Java 21.0.7，完成重命名后可被发现，原验证目录文件保持不变。结果分别位于 `official-manifests.json` 和 `official-runtime.json`。
