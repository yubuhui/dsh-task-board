# DSH 任务面板（task-board）

DeepSeek Harness（DSH）插件：左侧栏一个看板图标，右侧栏「任务」页签里放一块**手动管理**的任务板。任务由你自己建、自己推进、自己指派；对话里的助手只能起草一张待你确认的卡片，不碰已有任务。

- 主区始终是真实对话，任务板在右侧栏并排显示，拉宽即可
- 一个任务可指派多个会话，点会话标题直接跳回那段对话
- 子任务靠 `parentId` 建树，层级不限
- 数据落在本机 `tasks.json`，重启不丢

## 功能

| 能力 | 说明 |
|---|---|
| 新建任务 | 面板顶部输入标题，回车或点「添加」 |
| 编辑 | 点标题展开编辑区：标题、状态（待办/进行中/受阻/已完成）、优先级（高/中/低）、截止日期、进展备注、负责会话 |
| 子任务 | 行内 `+` 插入输入框，回车建子任务，`Esc` 取消；默认全部展开，行内显示 `已完成/子任务总数` |
| 指派会话 | 「选择会话」可搜索，勾选多个共同负责；负责会话一行一条，超过 3 条折成「还有 N 个」 |
| 新建会话并指派 | 选**工作区**、写**要求**，点「发送并新建」：会话建在所选工作区、指派给该任务、把要求作为第一条消息发出，并在主区打开。发送前不创建任何会话；发送失败可「重试发送」，不会重复建会话 |
| 移动任务 | 行内「移动」→ 目标列表（顶层 + 按层级缩进 + 搜索）；自身子树不出现在候选里，服务端也拒绝成环 |
| 删除 | 行内「删除」→「确认删除」，连子任务一起删 |
| 筛选 | 未完成 / 全部 / 已完成，外加标题与备注搜索；命中的父级自动带出 |
| 看对话 | 点「负责会话」任意一行，主区切到那个会话（任务板不动） |

## 在对话里建待办

助手只有两个低权限工具：

| 工具 | 作用 |
|---|---|
| `task_board_list` | 读看板：默认只列未完成，可按标题或备注搜索，返回 id、标题、状态、优先级、截止日期、备注摘要。只读 |
| `task_board_propose` | 在对话末尾打开一张「新建待办」卡片，预填标题、优先级、截止日期、备注、父任务。**不写任何数据** |

点卡片上的「创建」才真正写入 `tasks.json`，右侧面板随即刷新；点「取消」什么都不会发生。卡片上还会显示「负责会话 · 当前对话」，创建后自动指派给发起这次对话的会话。

因此，助手**不能改状态、不能删任务、也不能替你决定建不建**——「已创建」在用户点击前都是不成立的。

## 安装

尚未发布到 npm，按本地 `link` 接入 profile：

1. 把仓库克隆到本地任意目录，例如 `D:\Ai_Project\dsh-plugins\task-board`
2. 在 DSH profile（如 `~/.dsh/profiles/desktop`）的 `package.json` 里加两项——`dsh.profile.bundles` 里的包名、`dependencies` 里的 `link:` 路径：

```json
{
  "dsh": { "profile": { "bundles": ["@local/dsh-task-board"] } },
  "dependencies": { "@local/dsh-task-board": "link:D:/Ai_Project/dsh-plugins/task-board" }
}
```

3. 在该 profile 目录执行 `pnpm install`，重启 DSH

插件自带 [cordis.patch.yml](cordis.patch.yml)，DSH 加载 bundle 时按它把 `@local/dsh-task-board` 插入运行时；Host 半侧的改动需要重启 DSH 才生效。

## 数据存在哪

`%DSH_HOME%\task-board\tasks.json`，默认 `C:\Users\<你>\.dsh\task-board\tasks.json`。每次变更原子写入（临时文件 + rename），重启后仍在；删掉文件等于清空看板。

任务字段：`id / title / status / priority / due / note / assignees[] / parentId / createdAt / updatedAt / doneAt`。其中 `status` 取 `todo | active | blocked | done`，`priority` 取 `high | medium | low`，`assignees` 只存会话 id，标题在渲染时从当前会话列表解析。

## HTTP 接口

Host 半侧挂在 `/plugin/task-board` 下：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/plugin/task-board/tasks` | 读整份看板 |
| `POST` | `/plugin/task-board/tasks` | 建任务（卡片与面板共用这一条写入路径） |
| `PATCH` | `/plugin/task-board/tasks/:id` | 改任务 |
| `DELETE` | `/plugin/task-board/tasks/:id` | 删任务（含子任务） |
| `GET` | `/plugin/task-board/transcript?sessionId=` | 读某会话的对话摘要，供面板展示 |

所有请求都要带 `x-task-board: 1` 头，别的网页无法通过图片或脚本引用读到任务标题；接口只监听本机回环地址。会话的读写仍在主区的真实对话界面里完成，本插件不自绘聊天、不解析会话日志。

## 目录结构

```
index.js            Host 半侧：任务存储、路由、两个工具
client.js           浏览器半侧：右侧栏「任务」页签、行内编辑、卡片
cordis.patch.yml    插入运行时的 patch
locale/             中英文文案
docs/DETAIL.md      给用户看的用法与契约
.verify/            无浏览器、无 DSH 的验证脚本
icon.svg            侧栏图标
```

无构建步骤，无第三方运行时依赖：`index.js` 只用 Node 内置模块，`client.js` 的 React 由 DSH 客户端注入。

## 开发与验证

两个脚本都不需要浏览器或正在运行的 DSH，用临时 `DSH_HOME`，不会碰真实看板：

```sh
node .verify/tools.mjs   # Host 半侧：工具只读/只提议，写入只发生在确认后的路由
node .verify/card.mjs    # 浏览器半侧：卡片按轮次折叠、渲染在轮末、只有确认才写入
```

## 许可证

[MIT](LICENSE)
