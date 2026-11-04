# 安全凭据存储的一致性

`SecretStorage` 的 set/delete 共用一个实例内更新队列。每项操作从最近一次成功提交的 values 复制副本，只修改副本；`JsonStorage.write` 成功后才交换内存值。失败会返回调用方，不改变已提交的内存状态；队列继续处理后续操作。不同键的并发修改也按顺序合并，避免写入旧快照覆盖其他键。

读取只返回已提交值。加密仍由 Electron safeStorage 完成，存储格式不变，没有新增明文持久化或日志。账号状态与凭据的跨存储恢复由账号业务模块处理，见 [账号操作与登录取消](account-operation-lifecycle.md)。

隔离验证位于不纳入仓库的 `output/account-races-check/secrets.mjs`：加载实际 SecretStorage 与 JsonStorage，替换 Electron 加密接口为仅供验证的假实现，使用独立临时目录并控制写入失败及等待。验证失败的 set/delete 不改变内存、未提交值不可读、不同键并发写入与删除不丢失，以及重新加载与持久化结果一致。该验证不覆盖操作系统密钥库或真实加密能力，不接触玩家凭据。

Linux 的真实加密已在 Ubuntu 24.04 / WSLg 验证：使用独立 HOME、XDG 目录、D-Bus 会话与 GNOME Keyring，通过实际启动器的代理配置命令调用主进程存储。Electron 45.2.1 在两次不同进程启动中均返回 `available=true`、`gnome_libsecret`；写入为 `v11` 密文，重启后文件哈希不变且解密匹配测试值，留空密码保存继续保留原凭据。切换直连后密文记录与公开凭据引用均删除，密码未进入公开状态和日志。应用、Host、临时密钥库正常退出，默认用户密钥库保持不变；原无密钥库会话的 `basic_text` 探测结果仍保留，该后端由现有存储入口拒绝。证据在忽略目录 `output/linux-release/wsl-secret-storage-result.log`。
