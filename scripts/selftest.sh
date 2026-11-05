#!/bin/bash
#
# 自测：用 examples/mini 验证 lint 的「绿 → 红 → 绿」。
# 任何一步不符合预期都会非零退出。
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CLI="$HERE/memory.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

# 1) 合法样例必须通过
cp -R "$ROOT/examples/mini" "$TMP/case"
if node "$CLI" lint --root "$TMP/case" > "$TMP/out1" 2>&1; then
  pass "valid fixture lints clean"
else
  cat "$TMP/out1"; fail "valid fixture should pass"
fi

# 2) 破坏 frontmatter 必须报错
cp -R "$ROOT/examples/mini" "$TMP/broken"
python3 - "$TMP/broken/-Projects-demo/build-commands.md" << 'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("  status: active\n", "")
open(p, "w").write(s)
PY
if node "$CLI" lint --root "$TMP/broken" > "$TMP/out2" 2>&1; then
  cat "$TMP/out2"; fail "missing status should fail"
else
  grep -q "missing status" "$TMP/out2" || { cat "$TMP/out2"; fail "expected 'missing status'"; }
  pass "missing status detected"
fi

# 3) 坏索引链接必须报错
cp -R "$ROOT/examples/mini" "$TMP/badlink"
echo '- [不存在](nope.md) — 坏链测试' >> "$TMP/badlink/-Projects-demo/MEMORY.md"
if node "$CLI" lint --root "$TMP/badlink" > "$TMP/out3" 2>&1; then
  cat "$TMP/out3"; fail "broken link should fail"
else
  grep -q "broken link" "$TMP/out3" || { cat "$TMP/out3"; fail "expected 'broken link'"; }
  pass "broken index link detected"
fi

# 4) search / stats / index 能跑
node "$CLI" search "xcodegen" --root "$ROOT/examples/mini" > /dev/null || fail "search failed"
node "$CLI" stats --root "$ROOT/examples/mini" | grep -q "active" || fail "stats failed"
node "$CLI" index --root "$ROOT/examples/mini" | grep -q "Active" || fail "index failed"
pass "search/stats/index run"

echo "ALL PASS"
