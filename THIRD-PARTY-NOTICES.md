# 第三方组件与许可说明

本仓库的**自研源码**受 [LICENSE](LICENSE)（源码可见 · 非商业化分发许可 1.0）约束。
下列第三方组件**不在该许可授权范围内**，依各自上游许可证分发，权利归各自权利人所有。

| 组件 | 用途 | 上游许可 | 位置 |
| --- | --- | --- | --- |
| Python 3 运行时与标准库 | 免安装版自带，用于启动本机服务 | Python Software Foundation License / PSF License Agreement | `runtime/python/`（含 `LICENSE.txt`） |
| pip 及其 vendor 依赖 | 随 Python 运行时附带 | 各自上游许可（见 `runtime/python/Lib/site-packages/*/LICENSE*`） | `runtime/python/Lib/site-packages/` |
| SQLite | Python 标准库 `sqlite3` 模块链接的数据库引擎 | Public Domain | 随 Python 运行时 |
| Windows 系统字体（微软雅黑等） | 仅在本机渲染 / 生成本地素材时调用，不随包分发 | 系统字体许可 | 不随包 |

## 说明

1. `runtime/` 目录**只出现在免安装 ZIP（Release 附件）里**，不进 GitHub 仓库
   （见 `.gitignore`）。如果你从源码运行、自行安装 Python，则完全不涉及该目录。
2. 免安装 ZIP 原样保留了 Python 运行时自带的 `LICENSE.txt` 与各项许可文件，
   未作删改。再分发完整包时，请一并保留这些文件。
3. 本软件**没有**引入任何第三方前端框架、UI 库、CDN 资源或在线字体；
   界面与单证版式均为本项目自研的原生 HTML/CSS/JS。
4. 宣传物料中的截图与视频来自本软件的真实界面，画面内数据均为
   一键载入、带明确标注的 DEMO 虚构数据，不含任何真实业务资料。

---

唐先生（Downey）· 拓珀新材料 Topo New Material
