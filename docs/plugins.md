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

版本使用 semver。`dependencies` 可保留 ID 数组，或写为 `{ "nixel.downloads": "^0.1.0" }`，启用及更新时校验依赖和已启用消费者的版本要求。可选 `configSchema` 使用 JSON Schema draft-07，根类型为 `object`；简单字段生成 HeroUI 表单，复杂结构使用 JSON 编辑，保存由 Host 校验。凭据通过系统安全存储接口管理。远程目录、ZIP 包格式和托管更新见 [插件分发](plugin-distribution.md)。

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

内置 Yggdrasil 提供者按 [服务端协议](https://yushijinhun.github.io/authlib-injector/en/yggdrasil-server-technical-specification.html) 区分未绑定与已绑定令牌：仅未绑定令牌通过 refresh 的 `selectedProfile` 选择角色。账号切换先重新认证；待选流程向界面返回不含令牌的会话 ID 与角色列表，凭据和清理计时器留在 Host 插件作用域。默认界面通过账号命令交互，不直接请求认证服务。

游戏提供者的 `versions(signal?)`、`loaders(version, loader, signal?)` 与资源提供者的 `versions(projectId, instance?, signal?)` 可接收取消信号，用于版本变更任务中的目录与兼容性检查；已有实现可继续忽略可选参数。资源版本列表应只返回适用于传入实例的版本，管理插件用准确版本 ID 判断已安装文件是否兼容。

版本变更复用游戏提供者的 `install(instance, task)`：传入实例包含明确的新版本与加载器版本，持久化记录仍保留旧版本选择。提供者按传入目标安装并返回启动版本 ID，管理插件在成功后提交选择。提供者应保留原游戏版本文件、存档、内容与用户配置，不提前更改活动启动版本。任务支持取消；自动备份由实例管理插件完成。

默认界面在 **实例 → 设置 → 服务插件** 中列出已启用的提供者，按实例分别选择。账号服务留空时，使用启动账号自身的提供者。此处的资源来源只是未显式指定来源时的默认值，资源浏览仍可同时搜索多个来源。

资源返回值的 `source` 使用提供者 ID，`icon` 为项目图片 URL。`resources.search` 默认或 `source: 'all'` 时并行查询所有已启用的资源提供者；也可传具体 ID 筛选。每个提供者按 `offset` 返回最多 20 项，管理插件交错合并当前页，返回 `items`、`total`、`hasMore` 与分来源的 `warnings`。页偏移每次增加 20；单个来源失败不会丢弃其他来源结果。分类使用 `mods`、`resourcepacks`、`shaders`、`modpacks`。

`ResourceProvider.search` 返回 `{ items, total, hasMore? }`。`total` 是匹配总数；来源限制可浏览范围时，通过 `hasMore` 明确是否能继续翻页。未提供该字段的插件沿用 `offset + 20 < total`，管理插件合并各成功来源的总数和可翻页状态。CurseForge 按[官方分页限制](https://docs.curseforge.com/rest-api/#pagination-limits)最多浏览前 10,000 条；超出范围后只请求一条结果获取同条件的总数，不再返回资源条目，也不阻止其他来源继续翻页。来源返回无效总数时报告来源错误。

安装与版本查询继续使用项目实际的 `source`，明确来源优先于实例默认值。已安装资源使用 `source + projectId` 标识，更新按各自来源分发。任务的 `resourceSource` 与 `resourceId` 共同关联进度。内置来源为 `nixel.resources.modrinth` 和 `nixel.resources.curseforge`。整合包安装可以不传目标实例，由资源提供者创建新实例；普通内容安装必须指定目标实例。

资源提供者可实现 `details(projectId): Promise<ResourceDetails>` 和 `versionDetails(projectId, versionId): Promise<ResourceVersionDetails>`。前者返回介绍原文、截图与项目 URL，后者返回版本说明与依赖关系；结构见 [`contracts.ts`](../src/shared/contracts.ts)。版本详情应校验版本属于请求的项目。介绍和版本说明注明 `markdown` 或 `html` 格式，界面负责清理富文本，外链在系统浏览器打开；提供者无需返回界面组件。默认界面将介绍、截图、版本分为三个标签，依赖类型使用稳定标识，名称保留项目原文。

这两个方法为可选能力。未实现时对应命令返回 `null`，默认界面提示该来源未提供详情，已有搜索、版本选择与安装继续工作；网络错误会显示错误与重试入口。查询列表不拉取所有版本的发布说明，选中版本后再单独请求详情。

可选依赖安装扩展使用 `optionalDependencies(projectId, versionId, instance)` 返回兼容候选，`install` 的第五个参数接收 `ResourceInstallOptions`。实现查询的提供者应支持 `options.optionalDependencies` 中的精确项目/版本选择，并在写入前验证它们是主版本的直接可选依赖；主项目与所选项的必需依赖仍自动解析。未实现该查询的提供者保持原安装方式，管理插件拒绝向其提交非空的可选依赖选择。整合包本身按清单创建实例，清单内内容随后在实例中管理。

来源关系映射依据 [Modrinth 版本接口](https://docs.modrinth.com/api/operations/getversion/) 与 [CurseForge 文件关系接口](https://docs.curseforge.com/rest-api/)；来源协议保留在对应提供者中，共享安装计划仅消费统一的内容节点。

提供者的 `checkUpdates(instance, task)` 接收任务上下文，将取消信号传入网络与文件读取，并报告 0–100 的检查进度。更新结果写入对应内容的 `update: { versionId, version }`；无更新时清除此字段。内容管理插件负责各来源的错误汇总与任务状态，单个来源失败后继续检查其他来源。批量更新通过各提供者的 `install` 安装明确版本，共用一个实例任务；可在快照的 `content-update` 任务中跟踪整体进度。

插件展示名称、说明与分类可通过 manifest 的 `locales` 字段翻译，见 [翻译约定](localization.md)。

长操作通过 `ctx.nixel.tasks.start` 执行。任务体获得 `signal`、`report` 和 `log`，应将 `signal` 传入下载与子进程流程。`report` 接受 0–100 的实际进度。账号凭据通过 `platform.secretGet/secretSet/secretDelete` 交给主进程系统加密存储。

任务上下文还提供 `taskId` 与 `setInstance(id)`，供创建实例的导入流程绑定进度。重试时任务体重新解析当前实例、账号与提供者，检查冲突时排除自己的 `taskId`，避免沿用停用的提供者或已删除实例。

## 替换默认界面

在 manifest 中增加 `"renderer": "ui/index.html"`。界面插件启用后，可在设置的“外观”中选择。HTML 的脚本和样式使用包内相对路径；该入口可调用相同的 `window.nixel`，类型见 [`contracts.ts`](../src/shared/contracts.ts)。默认界面本身以 `nixel.ui.default` 注册。

界面通过 `getSnapshot()` 获取初始状态，通过 `onState(callback)` 订阅后续状态。取消订阅由返回的函数执行。业务命令走 `invoke(command, params)`，文件选择、系统路径、窗口控制走对应的窄接口。完整命令表见 [`implementation.md`](implementation.md)。

插件目录以引用方式安装，卸载保留原始目录。后端插件有运行任务或游戏时，先完成或取消操作再更改插件。插件载入失败会显示错误，重新启用可重新加载入口。

参考：[Cordis 源码](https://github.com/cordiverse/cordis)、[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)。
