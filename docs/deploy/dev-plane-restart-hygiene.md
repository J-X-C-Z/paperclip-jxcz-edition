# Dev-Plane 部署与重启规范

本运维手册介绍如何重启开发/共享 Paperclip control plane，同时避免终止正在运行的 agent 任务。本文写于 2026-07-06/07 故障激增之后；当时，部署期间频繁重启是任务失败的最大来源。

<a id="why-this-matters"></a>

## 为什么需要注意

每次重启 control plane 都会强制终止当时正在运行的 heartbeat run。该 run 会以 `failed` 状态结束，并将 `error_code` 设为 `'process_lost'`。系统会自动重试一次（`process_lost_retry`），但只能尽力而为：在 07-06/07 故障期间，36 个丢失的 run 只有 12 个成功恢复。07-06 晚间，**90 分钟内重启 9 次，导致 16 个正在运行的 run 被终止**。

<a id="rules-of-thumb"></a>

## 实用准则

1. **合并部署批次。** 集中累积变更后一次重启，不要每项变更都重启一次。重启风暴（1 小时内多次重启）会显著增加 run 丢失，却几乎没有收益。
2. **在集群活动较少时重启。** 重启前检查活动 run；尽量选择集群较空闲的时段。可在 control-plane 数据库中快速查询：

   ```sql
   SELECT count(*) FROM heartbeat_runs WHERE status = 'running';
   ```

3. **重启前先排空（即将支持）。**PAP-12930 正在添加通过 SIGTERM 优雅排空的能力：停止接收新 run，让运行中的 run 完成或创建检查点，然后退出。功能上线后，应发送 SIGTERM 并等待排空完成，不要强制重启。在此之前，请将准则 2 视为排空操作。
4. **重启后检查影响。**使用下方的检测查询，确认丢失的 run 已重试成功，或已安排人工跟进。

<a id="how-to-spot-a-restart-burst"></a>

## 如何识别重启突发

交叉核对以下两种信号：

**1. 实例日志中的服务器启动标记。**每次启动都会记录 `Server listening on <host>:<port>`。日志位于 `~/.paperclip/instances/<instance>/server.log`，每天轮转为 `server.log-YYYYMMDD.gz`。

```bash
grep -h "Server listening" ~/.paperclip/instances/default/server.log
zgrep -h "Server listening" ~/.paperclip/instances/default/server.log-20260706.gz
```

如果几分钟内出现多个标记，即为重启突发。

**2. `heartbeat_runs` 中同一分钟内的 `process_lost` 集中记录。**重启终止的 run 会同时结束，因此会集中在同一分钟内：

```sql
SELECT date_trunc('minute', finished_at) AS minute, count(*)
FROM heartbeat_runs
WHERE error_code = 'process_lost'
GROUP BY 1 HAVING count(*) > 1
ORDER BY 1 DESC;
```

如果这些集中出现的分钟与 `Server listening` 时间戳吻合，则失败由重启导致，而非产品回归。

**注意：**请直接查询数据库；`/heartbeat-runs` 列表 API 会忽略 `status=` 筛选条件，也不会返回错误字段。

<a id="checking-recovery-after-a-burst"></a>

## 检查重启突发后的恢复情况

每个 `process_lost` run 都应触发一次重试唤醒（`reason = 'process_lost_retry'`）。要找出未恢复的 run，请检查是否有 `process_lost` 失败记录，且同一 issue 后续没有成功 run；然后手动重新唤醒或重新分配这些 issue。

<a id="related-failure-modes-not-restart-caused"></a>

## 相关故障模式（并非由重启导致）

这些故障也出现在同一故障期间，但不要将其与重启造成的影响混淆：

- `workspace_validation_failed` ——确定性的工作区校验重试循环（自动修复：PAP-12931）。
- Provider 配额耗尽——`claude_transient_upstream` 失败的主要原因（配额感知处理：PAP-12932）。
