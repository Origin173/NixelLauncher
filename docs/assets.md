# 图标资源

## Nixel 标志

`src/renderer/src/assets/nixel.svg` 为本项目绘制的临时标志：青绿色的方块门廊与悬浮方块，不含字母。标题栏、默认界面、所有内置插件共用此标志。

`resources/nixel.png` 与 `resources/nixel.ico` 从同一 SVG 渲染，供 Electron 窗口、系统托盘及后续打包使用。修改标志时应同步导出这两个文件。渲染端通过 Vite 加载 SVG，资源项目图标直接使用 Modrinth / CurseForge 返回的图片，加载失败时显示图形占位。

## XMCL 资源

以下素材来自用户提供的 `D:/Code/XMCL/public/images/`，对应仓库为 [Origin173/XMCL](https://github.com/Origin173/XMCL)。保留其仓库提供的 [GNU GPL v3 许可文本](licenses/XMCL-LICENSE)。游戏及加载器名称、标志归各自权利人所有。

| 目录                             | 采用的素材                            | 用途                 |
| -------------------------------- | ------------------------------------- | -------------------- |
| `src/renderer/src/assets/icons/` | Fabric、Forge、NeoForge、Quilt        | 加载器图标           |
| 同上                             | GrassBlock、DefaultPack、UnknownWorld | 实例与内容的缺省图标 |
| `src/renderer/src/assets/skins/` | steve.png                             | 账号的缺省角色头像   |

XMCL 的启动器标志未用于 Nixel。平台返回的第三方项目图片按原资源 URL 展示，不复制到仓库。
