# 安全凭据存储的一致性

`SecretStorage` 的 set/delete 共用一个实例内更新队列。每项操作从最近一次成功提交的 values 复制副本，只修改副本；`JsonStorage.write` 成功后才交换内存值。失败会返回调用方，不改变已提交的内存状态；队列继续处理后续操作。不同键的并发修改也按顺序合并，避免写入旧快照覆盖其他键。

读取只返回已提交值。加密仍由 Electron safeStorage 完成，存储格式不变，没有新增明文持久化或日志。账号状态与凭据的跨存储恢复由账号业务模块处理，见 [账号操作与登录取消](account-operation-lifecycle.md)。

隔离验证位于不纳入仓库的 `output/account-races-check/secrets.mjs`：加载实际 SecretStorage 与 JsonStorage，替换 Electron 加密接口为仅供验证的假实现，使用独立临时目录并控制写入失败及等待。验证失败的 set/delete 不改变内存、未提交值不可读、不同键并发写入与删除不丢失，以及重新加载与持久化结果一致。该验证不覆盖操作系统密钥库或真实加密能力，不接触玩家凭据。
