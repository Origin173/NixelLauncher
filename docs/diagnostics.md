# 本地崩溃诊断

`nixel.diagnostics` 是依赖实例管理插件的独立内置 Cordis 插件，可以在插件页停用。默认界面的实例日志页提供“分析日志”，报告中可导出诊断 ZIP。整个过程在本机完成，不调用外部诊断服务，不上传日志。

## 证据与范围

分析规则识别 Java 内存不足、Java 可执行文件缺失或版本要求、加载器依赖/加载冲突、Mixin 转换失败和 JVM 原生崩溃的明确文本特征。每项包含来源名称、所收集文本中的行号和上下文。只有证据文本直接提及已安装且启用的文件名时，才显示关联文件；这不表示该文件就是故障原因。没有匹配时显示未识别，不根据退出码猜测根因。

来源限于当前实例的 `nixel-launch.log`、`logs/latest.log`、最多三份最新 `crash-reports/crash-*.txt`、一份最新 `hs_err_pid*.log`，以及最近一次启动任务失败时的错误与日志。每个文件最多读取末尾 1 MiB；报告标明截断，行号对应所包含文本而非完整原文件。显示各来源时间，历史报告可能属于不同启动。缺失文件不报错，其他读取错误显示在报告中。拒绝指向实例外部的路径及直接符号链接。

## 脱敏与导出

`privacy.ts` 复用 `launch-logs.ts` 的凭据字段脱敏，并移除当前安全存储中的已知令牌、已加载服务凭据、玩家标识、实例/应用/用户主目录、常见邮箱与 IPv4 地址。安全存储读取失败会终止操作，不降级为未经已知密钥脱敏的导出。用户或模组自定义的任意个人文本无法全部识别，因此报告中提醒分享前检查。

ZIP 包含 `report.json`、按报告来源顺序编号的 `logs/*.txt` 和说明文件。报告元信息只允许实例名称、游戏/加载器版本、内存及已安装内容的名称、版本、文件名、启用状态与资源来源标识；不包含账号对象、令牌存储、原始设置、JVM/游戏参数、提供者配置、环境变量转储、存档或模组二进制。导出时重新收集当前快照，经同目录临时文件完成后替换目标，取消或失败清理临时文件。

| 命令                  | 参数                          | 返回                                                     |
| --------------------- | ----------------------------- | -------------------------------------------------------- |
| `diagnostics.analyze` | `{ id }` 实例 ID              | `DiagnosticReport`，契约位于 `src/shared/diagnostics.ts` |
| `diagnostics.export`  | `{ id, path }`，绝对 ZIP 路径 | `{ taskId }`，任务类型 `diagnostics`，支持取消与重试     |

`collect.ts` 负责受限文件收集与白名单元信息，`analyze.ts` 只做纯规则分析，`export.ts` 负责 ZIP 与任务进度，插件入口注册命令。业务不进入 Host 核心。

## 开源设计参考

仅参考职责边界，未复制实现代码：

- [PrismLauncher LaunchTask.cpp](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/launch/LaunchTask.cpp) 在启动任务中集中应用隐私替换，并限制控制台模型行数；本功能把脱敏放在报告收集入口，并明确文件大小边界。
- [PrismLauncher LogPage.cpp](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/ui/pages/instance/LogPage.cpp) 分离日志查看、搜索与显式分享操作；本功能把分析/导出作为用户操作，导出目的地仅限本地文件。
- [HeliosLauncher processbuilder.js](https://github.com/dscalzi/HeliosLauncher/blob/master/app/assets/js/processbuilder.js) 在记录启动参数前遮盖访问令牌，并分别处理进程输出和退出结果；本功能不把单个退出码当作确定原因，保留原始错误证据并在呈现前脱敏。
