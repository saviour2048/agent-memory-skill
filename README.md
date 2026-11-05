# agent-memory — 给编码 agent 的分层长期记忆

一个 **Agent Skill**（Claude Code / Codex / Cursor / 任何能读 `SKILL.md` 的 agent）：
把长期记忆分成「语义 / 情景 / 程序性」三层，用 `Active / History` 管生命周期，
**只增不删**。自带零依赖的体检/索引脚本。

> 模拟人类记忆的三层：事实（语义）、经历（情景）、技能（程序性）。
> 核心问题：笔记混在一起会「找不到、不敢删、会漂移」。

## 三层

| 层 | 模拟 | 放什么 | 落到哪 |
|---|---|---|---|
| 语义记忆 | 事实 | 稳定事实、偏好、规则、环境结论 | `memory/<项目键>/<主题>.md` |
| 情景记忆 | 经历 | 一次事故、完整排障、发布来龙去脉 | 项目 handoff；Active 只留结论，过程进 History |
| 程序性记忆 | 技能 | 可重复步骤、检查清单 | `skills/<name>/SKILL.md` |

判断口诀：**事实写语义、故事写情景、步骤写技能。**

## 安装

```sh
git clone <this-repo> ~/Projects/agent-memory-skill
cd ~/Projects/agent-memory-skill
./scripts/install.sh                # 软链到 ~/.claude/skills、~/.codex/skills、~/.agents/skills
# 或指定目标 / 复制安装
./scripts/install.sh --target ~/.claude/skills
./scripts/install.sh --copy
```

安装完在 agent 里就能通过 `agent-memory` 这个 skill 名触发（描述里包含“记一下 / 记住 / 以前做过”）。

## 使用

```sh
# 初始化记忆根目录（默认 ~/.agent-memory，可用 AGENT_MEMORY_HOME 覆盖）
node scripts/memory.mjs init

# 体检：frontmatter、非法 status、坏索引链接、未进索引的文件、重复内容
node scripts/memory.mjs lint

# 看索引 / 统计 / 搜索
node scripts/memory.mjs index
node scripts/memory.mjs stats
node scripts/memory.mjs search xcodegen
```

`lint` 有问题会以退出码 1 结束，方便接进 CI 或 pre-commit。

### 目录结构

```
~/.agent-memory/
├── -HOME/                 # 家目录（全局偏好）
│   ├── MEMORY.md          # 索引：Active / History
│   └── <topic>.md
└── -Projects-demo/        # 项目键 = 路径把 / 换成 -
    ├── MEMORY.md
    └── <topic>.md
```

主题文件示例：

```markdown
---
name: build-commands
description: 本项目的构建与工程生成方式
metadata:
  type: reference
  modified: 2026-11-05
  status: active
---

# 构建命令

- `xcodegen generate` 生成工程；不要手改 `.xcodeproj`。
```

## 为什么这样设计

- **分层**：事实短小、经历留证据、步骤可复用，各自用不同寿命管理。
- **索引与正文分离**：索引只做发现（80–120 字摘要），正文做细节，Skill 做流程。
- **只增不删**：旧结论降级为 `consolidated` / `superseded` / `archived` /
  `historical_detail` 并移入 History，保留回溯价值。
- **防漂移**：一个规则只允许一个现行入口；`lint` 检查重复与坏链。
- **可迁移**：纯 Markdown + 一个无依赖脚本；记忆目录本身可以是 Git 仓库，跨机器同步。

## 多机器（可选）

多台机器共享一个记忆库（记忆目录本身用 Git 同步）时，让每台机器把本技能 clone 到**同一路径**，
并在共享技能目录里放一个软链：

```sh
git clone <this-repo> ~/Projects/agent-memory-skill
ln -s ~/Projects/agent-memory-skill ~/.claude/skills/agent-memory   # 或 ./scripts/install.sh
export AGENT_MEMORY_HOME="$HOME/agent-home/memory"                  # 指向真实记忆库
```

这样每台机器的 agent 都从同一份技能定义工作，记忆数据仍由你自己的仓库同步。

## 自测

```sh
./scripts/selftest.sh
```

会验证：合法样例通过、缺 `status` 报错、坏索引链接报错（绿→红→绿）。

## 许可

[MIT](LICENSE)。无第三方代码。
