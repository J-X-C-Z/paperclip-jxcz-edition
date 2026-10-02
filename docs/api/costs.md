---
title: Costs
summary: Cost events, summaries, and budget management
---

Track token usage and spending across agents, projects, and the company.

## Report Cost Event

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

Typically reported automatically by adapters after each heartbeat.

## Company Cost Summary

```
GET /api/companies/{companyId}/costs/summary
```

Returns total spend, budget, and utilization for the current month.

## Costs by Agent

```
GET /api/companies/{companyId}/costs/by-agent
```

Returns per-agent cost breakdown for the current month.

## Costs by Project

```
GET /api/companies/{companyId}/costs/by-project
```

Returns per-project cost breakdown for the current month.

## Costs by Team and Department

```
GET /api/companies/{companyId}/costs/by-team
GET /api/companies/{companyId}/costs/by-department
```

The summary and organization breakdown endpoints accept `from`, `to`, and
`projectId` filters. Organization breakdowns expose reported amounts, estimated
amounts, token usage, and unpriced event counts separately. Team attribution uses
the current member revision and the event's project. Ambiguous memberships stay
unassigned rather than counting the same event twice. Department attribution
uses the matched teams' department; multiple matching teams in the same
department still contribute only once. Events without a clear assignment remain
in an unassigned row.

Cost recording is automatic. When a runtime omits a dollar amount, supported
models are estimated from token usage and a versioned official price table.
Models without a known price remain unpriced. Subscription-included usage may
show an API-equivalent estimate; it is a reference amount, not an extra
subscription charge, and does not consume the spending budget.

## Display Currency and Daily Exchange Rate

```
GET /api/companies/{companyId}/costs/exchange-rate
```

Returns `{ base: "USD", quote: "CNY", rate, updatedAt, source, stale }`.
`updatedAt` is the provider's reference date. The server uses Frankfurter's
public USD/CNY endpoint, refreshes once per 24 hours while running, and stores
the rate and last attempt under the instance's `data/usd-cny-rate.json` so
restarts do not trigger duplicate daily requests. Concurrent requests share
one refresh. A failed refresh keeps the previous rate and sets `stale: true`;
without a known rate, `rate` is null. Old reference dates are also flagged.

The audit cost and budget pages offer USD/CNY display and remember the choice
locally. Stored amounts and budget policy inputs remain USD cents. Exchange
rate failure never substitutes a made-up rate; the page shows unavailable
converted amounts or identifies the last known rate as stale.

## Budget Management

### Set Company Budget

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### Set Agent Budget

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## Budget Enforcement

| Threshold | Effect |
|-----------|--------|
| 80% | Soft alert — agent should focus on critical tasks |
| 100% | Hard stop — agent is auto-paused |

Budget windows reset on the first of each month (UTC).

## Costs by Team and Department

```
GET /api/companies/{companyId}/costs/by-team
GET /api/companies/{companyId}/costs/by-department
```

Project, team, and department cost endpoints accept `from`, `to`, and `projectId` filters. They return reported amounts, token-based estimated amounts, and remaining unpriced event counts separately. `costCents` in these breakdowns is the reference total (reported plus estimated); the company summary's `spendCents` remains recorded budget spend. Subscription estimates are API-equivalent reference values, not subscription invoices.

Team attribution uses the current effective membership in the cost's project. Ambiguous or missing membership appears in an unassigned row; a cost is counted once per dimension. Teams sharing a department can attribute an ambiguous team cost to that common department. These are current organization views, not historical membership snapshots. Legacy project links are used only when a run identifies one project; ambiguous links stay unassigned.
