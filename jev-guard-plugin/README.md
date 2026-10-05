# jev-gate：DeepSeek Harness 的 Jev 安全门禁插件

把 [TypeSafe Jev](https://docs.typesafe.ai)（System One 决策模型）接到 DSH 的 `tools/pre-execute` 扩展点上：agent 每次调用 bash / pwsh 前，先过一道「原子问题电池 + 命名策略路由」的语义安全评估。**只收窄（deny/ask），从不放宽。**

决策核心与 `~/workspace/repo/jev-guard`（Python 版）逐字同构：同一组电池文本、同一组策略数字、同一套 route() 语义，两边可交叉验证。

## 文件

| 文件 | 作用 |
| --- | --- |
| `src/battery.ts` | 5 个原子 noul（删除/覆盖/绕过保护/系统范围/可逆性）+ 1 个 severity Score，criteria 双向判据 |
| `src/policies.ts` | HAZARD_ACTION / PRECEDENCE / POLICIES / `route()` 纯函数（评估与决策分离） |
| `src/jev.ts` | TypeSafe API 调用层（钉死 `jev-1.13.0`，单次请求跑完电池） |
| `src/gate.ts` | 插件入口：`tools/pre-execute` 瀑布 → allow / ask(review) / deny(block) |
| `src/selfcheck.ts` | route() 6 用例自检（对应 Python 版 pytest） |
| `cordis.yml` | Cordis 挂载清单（含策略配置） |

## 配置（cordis.yml 的 config 段）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `policy` | `strict` | 命名策略：`strict`（action≥0.70）/ `permissive`（action≥0.85） |
| `tools` | `[bash, pwsh]` | 监控的工具名；命令取 `arguments.command` |
| `apiKeyEnv` | `TYPESAFE_API_KEY` | TypeSafe Key 的凭证引用名；经 ctx.credentials 解析（见下） |
| `model` | `jev-1.13.0` | 钉死版本，不用 `jev-latest` |
| `timeoutMs` | `8000` | 评估请求超时 |
| `onError` | `allow` | 评估失败（含缺 key）：`allow` 放行+日志 / `deny` fail-closed |
| `verbose` | `false` | 开启后每次评估在实例终端留一行完整 nouls 摘要（含 pass），用于观测与阈值校准 |

## 运行

Key 配置（任选其一，插件经 dsh 凭证缝 ctx.credentials 按序解析）：
1. ~/.dsh/.credentials.yaml 的 refs: 段加 `TYPESAFE_API_KEY: ts_...`（受管存储，热更新，**推荐**）
2. 启动前 `export TYPESAFE_API_KEY=ts_...`（进程环境，优先级最高）
3. 启动 cwd 的 .env 或 ~/.dsh/.env（兜底回退）

```bash
cd ~/workspace/repo/deepseek-harness

# 1) 决策语义自检（纯函数，无需 key）
pnpm tsx jev-guard-plugin/src/selfcheck.ts

# 2) 启动带门禁的 web profile
pnpm dsh web --patch ./jev-guard-plugin/cordis.yml
```

在对话里让 agent 执行 `git clean -fdx` 或 `git push --force origin main`——会被 deny；执行 `ls` 正常放行；边缘命令（如 `mv a b`）走 ask 审批。

热挂载（不重启）：把 `cordis.yml` 里的行追加到 `$DSH_HOME/cordis.patch.yml` 并保存，运行中的 web app 会重组挂载插件。

## 处置映射

| route() 输出 | PreToolDecision | 效果 |
| --- | --- | --- |
| `pass` | `next()`（allow） | 正常执行 |
| `review` | `{ kind: 'ask' }` | 转审批服务，用户确认后放行一次 |
| `block` | `{ kind: 'deny', reason }` | 调用以错误收场，reason 含触发分解（可解释） |
