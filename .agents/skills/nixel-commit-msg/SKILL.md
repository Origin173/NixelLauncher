---

name: nixel-commit-msg
description: 根据 NixelLauncher 的暂存改动与近期 Git 历史生成一行英文提交标题。用于 commit message、commit msg、Git 提交信息、提交说明等请求，也用于用户已授权提交时拟定标题。
---

# NixelLauncher 提交信息

为当前 NixelLauncher 工作区生成准确、简洁的提交标题。流程参考 [SJMCL 的 sjmcl-commit-msg](https://github.com/UNIkeEN/SJMCL/blob/main/.agents/skills/sjmcl-commit-msg/SKILL.md)，以下规则按本项目技术栈重新编写。

## 确定依据

先确认当前目录所属的 Git 仓库，再读取实际暂存内容：

```powershell
git rev-parse --show-toplevel
git status --short
git diff --cached --stat
git diff --cached
```

存在提交历史时，继续读取 `git log --oneline -10`，对齐近期标题的用词和结构。

- 尚未初始化 Git：说明当前目录不是 Git 仓库；不凭设计讨论生成“当前提交”的标题，也不因为调用本 skill 就初始化仓库。
- 已初始化但还没有首次提交：暂存区仍然有效，按下述默认格式生成标题，无需已有历史。
- 暂存区为空：说明没有可据此生成标题的暂存改动。若用户明确要求分析未暂存内容，则读取 `git diff` 和相关未跟踪文件，按其指定范围生成。
- 文件同时存在已暂存和未暂存修改：默认只概括暂存版本。文件名、聊天记录和计划只能辅助理解，不能替代 diff。
- 对图片、二进制等无法由文本 diff 说明的改动，结合可用预览及实际元数据判断，避免猜测资产内容。

## 标题写法

新仓库默认使用以下形式，已有仓库优先遵循实际历史和用户本次要求：

```text
<type>(<scope>): <summary>
<type>: <summary>
```

使用一行英文；summary 用小写开头的祈使短语，如 `add`、`fix`、`preserve`，结尾不加句号。说明提交产生的主要变化，避免 `WIP`、`misc`、`update files` 等无信息标题。

按改动目的选择 type：

| type       | 用途                     |
| ---------- | ------------------------ |
| `feat`     | 新增或扩展能力           |
| `fix`      | 修正错误行为             |
| `refactor` | 保持行为的结构调整       |
| `perf`     | 性能改善                 |
| `docs`     | 文档或说明变更           |
| `test`     | 测试变更                 |
| `build`    | 构建或依赖变更           |
| `ci`       | 持续集成与发布工作流     |
| `style`    | 不改变行为的格式调整     |
| `chore`    | 开发工具、仓库规范等维护 |
| `revert`   | 撤销已有提交             |

scope 跟随实际受影响的模块，下面是选词参考，不要求预先创建这些目录：

- 跨前后端的业务改动使用功能域，例如 `account`、`instance`、`download`、`java`、`launch`、`modpack`、`catalog`。
- 插件框架或契约变动可用 `plugin`；单个插件变动优先采用其稳定名称。
- 仅影响某一层时可用 `desktop`、`host`、`renderer`、`ipc`、`ui`。
- 仓库规范可用 `skills`，依赖变动可用实际依赖名，如 `electron`、`cordis`、`heroui`。
- 没有清晰的共同范围时省略 scope。范围词表示本次改动，不套用参考项目的框架术语。

示例仅展示标题形式：

```text
feat(instance): add per-instance Java selection
fix(plugin): defer provider replacement until active tasks finish
refactor(ipc): share request contracts between host and renderer
chore(skills): add NixelLauncher commit message guidance
```

标题应覆盖全部目标改动的共同目的。若暂存内容混合了互不相关的工作，不用一个狭窄标题掩盖其余变更；仅请求一行标题时作准确的整体概括，准备实际提交时按授权范围组织提交。

不默认加 `[skip ci]`；仅在用户明确要求或仓库确有适用约定时使用。

## 输出与实际提交

- 仅请求提交信息：完成读取后，最终只输出一行标题，不加代码块、引号或解释。缺少仓库、暂存为空等无法生成的情况直接说明原因。
- 请求实际提交：沿用用户已经给出的授权，不重复询问；仅暂存本次授权范围内的路径或片段，重新检查暂存 diff，再使用生成的标题提交。
- 若暂存区已有无关工作，保留其内容与暂存状态；不能直接把整个索引提交，也不能用重置索引来清理。仅在能够可靠隔离时提交本次改动，否则说明具体冲突。
- 为准确概括标题无需运行应用测试。实际提交时执行项目约定且与改动相关的检查；纯文档或 skill 改动检查格式和引用即可。
- 调用本 skill 本身不意味着自动提交、推送、amend 或修改 Git 配置；这些动作按用户实际请求处理。
- 提交完成后核对提交内容与工作区状态，简短报告哈希、标题和实际验证结果。未提交成功时报告真实状态。
