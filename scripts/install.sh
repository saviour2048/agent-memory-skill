#!/bin/bash
#
# 把本 skill 链接到各 agent 的技能目录。
#
#   ./scripts/install.sh              # 链接到 ~/.claude/skills、~/.codex/skills、~/.agents/skills
#   ./scripts/install.sh --copy       # 复制而不是软链（跨机器/只读场景）
#   ./scripts/install.sh --target ~/.claude/skills
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$HERE/.." && pwd)"
NAME="agent-memory"
MODE="link"

TARGETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --copy) MODE="copy"; shift ;;
    --target) TARGETS+=("$2"); shift 2 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=(~/.claude/skills ~/.codex/skills ~/.agents/skills)
fi

backup() {
  local dst="$1"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    local ts; ts="$(date +%Y%m%d-%H%M%S)"
    mv "$dst" "$dst.bak-$ts"
    echo "  backed up existing -> $dst.bak-$ts"
  fi
}

for dir in "${TARGETS[@]}"; do
  mkdir -p "$dir"
  dst="$dir/$NAME"
  backup "$dst"
  if [ "$MODE" = "copy" ]; then
    cp -R "$SKILL_DIR" "$dst"
    echo "  copied -> $dst"
  else
    ln -s "$SKILL_DIR" "$dst"
    echo "  linked -> $dst"
  fi
done

echo ""
echo "done. 验证："
echo "  head -5 \"\${TARGETS[0]}/$NAME/SKILL.md\""
echo "  node \"\${TARGETS[0]}/$NAME/scripts/memory.mjs\" init"
