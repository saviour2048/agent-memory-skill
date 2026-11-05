---
name: build-commands
description: 本项目的构建与工程生成方式
metadata:
  type: reference
  modified: 2026-11-05
  status: active
---

# 构建命令

- `xcodegen generate`：由 `project.yml` 生成 `*.xcodeproj`（工程文件不进 Git）。
- `xcodebuild -project Foo.xcodeproj -scheme Foo -configuration Debug build`。
- 测试：`xcodebuild test`。

**Why:** 手改 `.xcodeproj` 会在下次生成时被覆盖。

**How to apply:** 改构建配置只改 `project.yml`，改完重新生成。
