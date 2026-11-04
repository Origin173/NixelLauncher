# 插件目录、更新与配置

插件页的「插件目录」接受用户配置的 HTTPS JSON URL。Nixel 没有预置或声称运营官方市场。目录插件 `nixel.plugin-distribution` 负责远程目录、版本预览、包下载和任务；Host 负责清单、依赖、配置验证及本地生命周期事务。

目录格式如下，ZIP 根目录必须包含相同的 `nixel-plugin.json` 和编译后的入口文件：

```json
{
  "formatVersion": 1,
  "packages": [
    {
      "manifest": {
        "id": "example.tools",
        "name": "Example tools",
        "version": "1.0.0",
        "description": "Example plugin",
        "apiVersion": 1,
        "category": "Utilities",
        "main": "index.mjs",
        "dependencies": { "nixel.downloads": "^0.1.0" },
        "configSchema": {
          "type": "object",
          "properties": { "greeting": { "type": "string", "minLength": 1 } },
          "required": ["greeting"],
          "additionalProperties": false
        }
      },
      "url": "https://example.org/tools-1.0.0.zip",
      "sha256": "REPLACE_WITH_64_HEXADECIMAL_DIGITS"
    }
  ]
}
```

同一目录可列出多个插件、多个准确版本。加载目录后选择版本并检查安装；预览显示当前/目标版本、目录与包 URL、SHA-256、依赖问题，以及首次配置表单。已有插件使用当前配置作为编辑起点。确认信任后才下载与执行。包清单与预览清单必须完全一致；安装时重新读取目录并核对选择，重试保留原包和配置，不自动接受目录中的新版本。

目录 URL 可以包含签名 query，完整 URL 保存在用户插件配置和重试目标中；任务日志只记录目录的 origin 与 pathname，不输出 query 或包下载 URL。请勿把此普通配置当作系统安全凭据存储。

后端插件拥有 Host 的 Node.js 权限，包括文件、网络和启动器凭据访问。HTTPS 与 SHA-256 校验传输和内容，不证明作者身份。目录不接受 URL 凭据、非 HTTPS 链接或目录重定向；ZIP 拒绝路径穿越、外部链接、重复路径、超过 10000 个条目或总解压大小超过 256 MiB 的包。入口只能位于包内。目录响应上限 2 MiB，清单上限 128 KiB。

## 依赖与配置

`dependencies` 支持旧的 ID 数组（任意语义版本）和新的 `{id: semverRange}`。本地插件和远程包都使用相同规则；版本必须符合 semver。启用、更新、恢复时检查依赖存在、启用状态、版本范围及循环，同时保证已启用消费者仍接受目标版本。缺失或不兼容依赖在预览中阻止安装；用户逐项安装依赖，不自动信任额外包。

`configSchema` 使用 JSON Schema draft-07，根类型为 `object`，上限 64 KiB，由 Host 使用 Ajv 与标准格式校验；不下载远程 `$ref`。默认界面将 string、number、integer、boolean 与 enum 映射到 HeroUI 字段。嵌套对象、数组或组合条件使用明确的 JSON 编辑入口，保存前仍由 Host 校验。表单不自动填入或保存 schema 的默认值；用户可在初次安装预览中填写必需字段。配置保存在普通插件配置中，不应作为安全令牌存储。无 schema 的旧插件保留 JSON 编辑。

## 安装事务与回滚

包下载沿用 `nixel.downloads` 的取消、进度、校验和网络配置。托管包保存到数据目录的 `plugins/<id>/<version>-<hash>-<unique>/`，每次更新使用新目录，避免 JavaScript 子模块缓存复用旧版本。只有完整解压、清单和配置验证后才切换运行版本与持久化指针。安装更新失败或提交前取消时，重新启用原目录和原配置；恢复也失败会明确报告两项错误。Host 中断且尚未提交时，下次启动仍使用原持久化指针。

每个托管插件保留一代旧目录与配置，插件详情提供「恢复上一版本」，恢复前重新校验依赖和配置。恢复任务与重试绑定原来的当前/上一代目录身份；期间版本变化需重新确认，不会恢复另一个版本。成功更新后清理更早的一代，清理失败记录到任务日志，包缓存清理也不会把成功安装报告成失败。取消若晚于持久化提交，已提交版本仍是实际状态，任务中心和插件列表分别显示任务与当前版本。未提交的暂存文件不执行；突然退出可能留下无引用目录，可在确认没有运行中的安装后手动清理。

内置插件不能替换，本地目录仍以引用方式安装，也不能被目录包覆盖。卸载托管插件只删除经过受管根目录校验的当前/上一代目录；卸载本地引用保留原文件。当前正在使用的界面插件必须先切换界面。

所有生命周期写操作串行执行。普通 IPC 不接受排除任务 ID；托管安装 API 仅允许真实 `taskScope` 中、与 Host 保存的任务对象和所属 Cordis Context 一致的活动任务排除自己。它仍不能更新自己或自己的依赖；其它任务和游戏继续阻止生命周期变更，避免卸载下载服务或等待自身任务造成死锁。暂存完成后重新检查占用，进入 Host 的短生命周期锁，直到启用和持久化结束；这段时间新的业务任务启动会明确失败。普通启停、安装、卸载和配置更新也使用同一短锁。

## 命令

| 命令                      | 参数            | 结果                                 |
| ------------------------- | --------------- | ------------------------------------ |
| `pluginCatalog.configure` | `{url}`         | 保存唯一活动目录 URL                 |
| `pluginCatalog.list`      | 无              | 目录来源与全部准确版本               |
| `pluginCatalog.preview`   | `{id, version}` | 来源、包、已安装版本、配置和依赖问题 |
| `pluginCatalog.install`   | `{preview}`     | 安装任务 ID                          |
| `pluginCatalog.rollback`  | `{id}`          | 恢复任务 ID                          |

已有 `plugins.install/configure/setEnabled/remove` 保留，本地和远程共享 Host 校验。后端窄契约见 `PluginManager`，不经 preload 直接暴露。

`plugins.configure` 默认整体替换配置；传入 `merge: true` 时，在 Host 串行处理内将本次顶层字段与最新配置合并，再校验并应用。下载与镜像设置表单使用该方式，避免同时保存时拿旧快照覆盖另一表单。对象内部仍按字段整体替换，不隐式深合并。

设计参考 [VS Code 扩展清单](https://code.visualstudio.com/api/references/extension-manifest) 的显式依赖与扩展元数据、[npm node-semver](https://github.com/npm/node-semver) 的版本范围语义，以及 [JSON Schema draft-07](https://json-schema.org/draft-07) 和 [Ajv schema 管理](https://ajv.js.org/guide/managing-schemas.html)。独立实现 Nixel 的目录协议和事务，不运行 npm 安装脚本，不引入第三方启动器代码。
