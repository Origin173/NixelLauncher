# CurseForge 线上验收

2026-11-04 使用本地 `.env` 配置的 API Key，通过独立 Electron 的 preload、主进程与 Cordis Host 调用正式提供者。官方 API 返回 HTTP 200；Modrinth 与 CurseForge 同时搜索各返回 4 项，无来源错误。项目、版本说明、依赖与文件信息均来自实际接口。

## 模组安装与更新

Minecraft 1.21.1 / Fabric 实例安装 Sodium Extra 0.9.4（项目 `447673`，文件 `8892310`），自动安装必需依赖 Sodium 0.8.13（`394468/8756581`）。两个文件的大小、SHA-1 与官方数据一致。禁用 Sodium Extra 后，更新检查发现 0.9.5（`9324106`）；实际更新后旧文件移除，新文件保持 `.disabled`，官方哈希匹配，Sodium 依赖保留。

## 整合包导入与升级

OTD HARD（项目 `1087971`）从文件 `5649278` 导入并升级至 `7353307`，Minecraft 1.21.1 / Fabric 0.16.2。两个归档内部的版本标签均为 `1.0`，来源记录使用准确文件 ID 区分版本。

旧清单的 4 个模组与 9 项文件基线核对通过。新版 6 个暂存模组全部匹配官方哈希；明确选择保留旧版禁用的 Iris，另外 5 个文件按计划应用。修改过的包配置、自建配置和存档标记字节不变。升级前的自动备份保留旧来源、基线与禁用记录，归档 SHA-256 及备份内用户文件校验通过。两次包内容下载共 123,427,355 字节，归档和游戏元数据另计。

Simply Optimized Forked（`1468747/7697145`）含作者未开放第三方下载的必需文件，正式 Host 显示对应项目的限制，新建的未完成实例记录与目录均被清理。没有跳过必需文件或绕过下载限制。

## 证据

结果保存在 Git 忽略目录 `output/curseforge-online-review/`：`result.json`、`mod-updated.json`、`pack-import-verification.json`、`pack-upgrade-verification.json` 和 `pack-upgrade-plan.json`。实际请求未替换响应；本次没有启动游戏或进入世界。验收进程正常关闭，密码与 Key 未写入公开状态、任务或日志。
