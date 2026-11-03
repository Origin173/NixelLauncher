# 界面与插件翻译

设置 → 通用与语言提供简体中文、English 和跟随系统。语言选择保存为 `settings.locale`，无需重启；主进程、Cordis Host 和默认界面使用同一个选择。默认系统语言取 Electron 的系统语言，中文匹配 `zh-CN`，其他语言暂用 `en-US`。

文案集中在 `src/shared/locales/zh-CN.ts` 与 `en-US.ts`。使用 `src/shared/i18n.ts` 的 `tr(key, values)` 获取文本；`MessageKey` 与目录键一致，类型检查同时检查两份目录的完整性。带变量的句子用 `{{name}}` 插值保存完整句子，不在组件里拼接翻译片段。产品名、资源作者提供的项目介绍和用户命名保留原文。

```tsx
<span>{tr('catalog.page', { page: 2, total: 120 })}</span>;
```

渲染端由 react-i18next 订阅语言变化。页面、内容分类与账号类型使用固定标识，如 `settings`、`mods`、`resourcepacks`、`microsoft`，展示时使用 `label(id)`。旧版本保存的中文分类与账号类型会在载入时迁移，任务重试参数也会转换。不要将翻译结果写入业务状态或用于判断分支。

任务名称、错误和日志按产生时的语言记录，以便原样保留操作历史。切换语言后的新操作使用新语言。游戏自身的输出不经过启动器翻译。

## 插件元数据

本地插件可以在 `nixel-plugin.json` 中提供 `locales`，原始 `name`、`description`、`category` 作为缺省值。Host 生成快照时应用当前语言，插件实现与注册 ID 保持不变。

```json
{
  "id": "example.world-tools",
  "name": "World tools",
  "description": "Manage saved worlds.",
  "category": "Utilities",
  "version": "0.1.0",
  "apiVersion": 1,
  "main": "index.mjs",
  "locales": {
    "zh-CN": {
      "name": "世界工具",
      "description": "管理已保存的世界。",
      "category": "实用工具"
    }
  }
}
```

插件自己的业务文案可以使用自己的语言目录，从 `ctx.nixel.store.read().settings.locale` 读取偏好。内置插件通过共享目录提供翻译，默认界面仍可由界面插件替换。

提供者注册信息也支持 `locales: { "zh-CN": { "name": "显示名称" } }`。提供者名称与插件名称分别翻译，同一插件可以提供多个独立命名的服务。
