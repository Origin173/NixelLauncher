# Nixel 插件开发

Nixel 使用 Cordis 4。可信后端插件在独立的 Electron Utility Process 中执行，拥有该进程的 Node.js 权限。界面插件通过 preload 提供的 `window.nixel` 调用 Host。一个插件包可以同时提供后端和界面。

## 本地插件目录

在插件页选择包含 `nixel-plugin.json` 的目录。目录中保存编译后的 JavaScript；开发者可使用自己的 TypeScript 构建工具。

```json
{
  "id": "example.world-tools",
  "name": "世界工具",
  "version": "0.1.0",
  "description": "提供世界工具命令。",
  "apiVersion": 1,
  "category": "实用工具",
  "main": "index.mjs",
  "dependencies": []
}
```

后端入口默认导出 Cordis 插件：

```js
export default {
  name: 'example.world-tools',
  inject: ['nixel'],
  apply(ctx, config) {
    ctx.nixel.commands.register(ctx, 'example.world-tools.list', () => {
      return ctx.nixel.store.read().instances.map(({ id, name, directory }) => ({
        id,
        name,
        directory,
      }));
    });
  },
};
```

命令注册、提供者注册通过 `ctx.effect` 随插件停用自动移除。插件自己创建的监听器、计时器、进程和文件句柄也应由 `ctx.effect` 返回的清理函数释放。使用当前 Host 传入的 Context，复用 `ctx.nixel`；类型定义见 [`host-api.ts`](../src/shared/host-api.ts)。

## 服务提供者

提供者声明 `id`、所属 `pluginId`、`kind` 和名称。业务管理插件按实例配置解析提供者，具体实现可替换。

```ts
ctx.nixel.providers.register(
  ctx,
  {
    id: 'example.resources',
    pluginId: 'example.world-tools',
    kind: 'resources',
    name: '自定义资源来源',
  },
  implementation,
);
```

游戏、资源和账号实现分别遵循 [`providers.ts`](../src/plugins/providers.ts) 的 `GameProvider`、`ResourceProvider`、`AccountProvider`。实例包含 `providers` 和 `providerConfig`；资源安装与游戏启动收到完整实例。账号鉴权实现只向游戏提供者返回会话，公开账号与快照不包含令牌。

资源返回值的 `source` 使用提供者 ID，`icon` 为项目图片 URL。`resources.search` 默认或 `source: 'all'` 时并行查询所有已启用的资源提供者；也可传具体 ID 筛选。每个提供者按 `offset` 返回最多 20 项，管理插件交错合并当前页，返回 `items`、`total`、`hasMore` 与分来源的 `warnings`。页偏移每次增加 20；单个来源失败不会丢弃其他来源结果。分类使用 `mods`、`resourcepacks`、`shaders`、`modpacks`。

安装与版本查询继续使用项目实际的 `source`，明确来源优先于实例默认值。已安装资源使用 `source + projectId` 标识，更新按各自来源分发。任务的 `resourceSource` 与 `resourceId` 共同关联进度。内置来源为 `nixel.resources.modrinth` 和 `nixel.resources.curseforge`。整合包安装可以不传目标实例，由资源提供者创建新实例；普通内容安装必须指定目标实例。

插件展示名称、说明与分类可通过 manifest 的 `locales` 字段翻译，见 [翻译约定](localization.md)。

长操作通过 `ctx.nixel.tasks.start` 执行。任务体获得 `signal`、`report` 和 `log`，应将 `signal` 传入下载与子进程流程。`report` 接受 0–100 的实际进度。账号凭据通过 `platform.secretGet/secretSet/secretDelete` 交给主进程系统加密存储。

任务上下文还提供 `taskId` 与 `setInstance(id)`，供创建实例的导入流程绑定进度。重试时任务体重新解析当前实例、账号与提供者，检查冲突时排除自己的 `taskId`，避免沿用停用的提供者或已删除实例。

## 替换默认界面

在 manifest 中增加 `"renderer": "ui/index.html"`。界面插件启用后，可在设置的“外观”中选择。HTML 的脚本和样式使用包内相对路径；该入口可调用相同的 `window.nixel`，类型见 [`contracts.ts`](../src/shared/contracts.ts)。默认界面本身以 `nixel.ui.default` 注册。

界面通过 `getSnapshot()` 获取初始状态，通过 `onState(callback)` 订阅后续状态。取消订阅由返回的函数执行。业务命令走 `invoke(command, params)`，文件选择、系统路径、窗口控制走对应的窄接口。完整命令表见 [`implementation.md`](implementation.md)。

插件目录以引用方式安装，卸载保留原始目录。后端插件有运行任务或游戏时，先完成或取消操作再更改插件。插件载入失败会显示错误，重新启用可重新加载入口。

参考：[Cordis 源码](https://github.com/cordiverse/cordis)、[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)。
