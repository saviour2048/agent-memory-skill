---
name: agent-memory
description: 分层项目记忆库（语义/情景/程序性 + Active/History 生命周期），模拟人类记忆。首轮实质工作前、涉及既有项目、或用户说「记一下 / 记住 / 以前做过」时触发；负责读取、写入、维护长期记忆：先搜重、按层存放、旧版降级不删、索引只留发现入口。
---

# Agent Memory — 分层长期记忆

一个给编码 agent（Claude Code / Codex / Cursor / 任何能读 SKILL.md 的 agent）用的
**分层记忆库**。核心思想：把「事实」「经历」「步骤」分开存，像人类记忆一样分层，
用 `Active / History` 管生命周期，**只增不删**。

## 记忆根目录

按优先级：

1. 环境变量 `AGENT_MEMORY_HOME`
2. 当前项目里的 `.agent-memory/`（存在时）
3. `~/.agent-memory/`

根目录下每个项目一个子目录（项目键）。项目键由工作目录推导：`~` → `-HOME`；
`~/Projects/foo` → `-Projects-foo`（`/` 换成 `-`，前面加 `-`）。

```
<root>/
├── -HOME/
│   ├── MEMORY.md          # 索引：Active / History
│   └── <topic>.md         # 主题文件（frontmatter + 正文）
└── -Projects-foo/
    ├── MEMORY.md
    └── <topic>.md
```

## 三层（写入时选层）

| 层 | 模拟人类记忆 | 放什么 | 落到哪 |
|---|---|---|---|
| **语义记忆** semantic | 事实 | 稳定事实、偏好、规则、环境结论 | `memory/<项目键>/<主题>.md` |
| **情景记忆** episodic | 经历 | 一次事故、完整排障、发布来龙去脉 | 项目 handoff；Active 只留结论，过程进 History |
| **程序性记忆** procedural | 技能 | 可重复步骤、检查清单 | `skills/<name>/SKILL.md`（不是 memory） |

判断口诀：**事实写语义、故事写情景、步骤写技能。**

## 读取流程

1. 推导项目键；目录不存在就跳过（不要报错、不要凭空创建）。
2. 先读该目录的 `MEMORY.md` 索引，**默认只读 `Active` 区**。
3. 按任务需要读索引里列出的主题文件，**每个任务最多 5–7 条相关记忆**。
4. 命中文件的 `status` 不是 `active` 时按下表跳转，不把它当现行规则。
5. 记忆里的环境信息（路径、设备、网络、版本）可能过时——依赖前在当前机器验证。
6. 索引与主题冲突时，以主题文件正文为准；索引只是发现入口。

## 写入流程（用户说「记一下」或任务中得到可复用经验）

1. **先搜重**：已有同类当前记忆就更新原文件，不新增重复文件。
2. **选层**：事实→语义；事故/排障过程→情景（项目 handoff）；可重复步骤→Skill。
3. 主题文件用 kebab-case；frontmatter 至少包含：

   ```yaml
   ---
   name: short-stable-name
   description: 一句话说明（给索引和检索用）
   metadata:
     type: reference | project | user
     modified: 2026-11-05
     status: active
   ---
   ```

4. 在 `MEMORY.md` 的 `Active` 区追加链接 + **约 80–120 汉字**的摘要。
5. 旧版本**不物理删除**：把 `status` 改成 `consolidated` / `superseded` / `archived` /
   `historical_detail`，填 `consolidated_into` / `superseded_by`（或 `current_summary`），
   然后把它从 Active 移到 History。
6. 全局性偏好写 `-HOME/`；涉及机密/账户数据只写本地私有仓库，不进公开仓库。

## 生命周期

| status | 含义 | 读取规则 |
|---|---|---|
| `active` | 当前有效 | 正常读取 |
| `consolidated` | 已合并进别处 | 改读 `consolidated_into` |
| `superseded` | 被新版取代 | 改读 `superseded_by` |
| `archived` | 整体归档 | 正常使用时不读 |
| `historical_detail` | 仅作历史证据 | 只当证据，不当规则 |

## 冗余审查（定期，或用户要求时）

- 同一规则只保留一个现行入口；重复的项目案例标 `consolidated` 留 History。
- 索引摘要不算重复：索引负责发现、主题文件负责细节、Skill 负责流程。
- 历史证据不因「重复结论」删除：不同事故得出同一教训时，归到同一现行入口，原始证据保留。
- 用 `node scripts/memory.mjs lint` 检查：frontmatter 缺失、非法 status、索引坏链、
  未进索引的 Active、重复内容。

## 脚本

```sh
node scripts/memory.mjs init   [--root DIR]   # 初始化根目录 + 索引模板
node scripts/memory.mjs lint   [--root DIR]   # 体检（只读；有问题退出码 1）
node scripts/memory.mjs index  [--root DIR]   # 列出 Active / History
node scripts/memory.mjs stats  [--root DIR]   # 各 status 计数
node scripts/memory.mjs search <词> [--root DIR]
```

## 边界

- 不替用户决定「记什么」：只在他的明确要求或可复用经验出现时写入。
- 不把整篇排障日志塞进语义记忆——过程属于情景记忆。
- 不在两处保存同一份活记忆（会静默漂移）；确实需要镜像时，用 Git 同步同一份。
