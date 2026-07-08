# Intelligence Layer

## Messy Inputs → Structured Data
| Raw input | Structured field |
|---|---|
| "She missed 3 months of savings" | progress log note + on_track_status = at_risk |
| "Market dropped her balance by 400k" | logged_amount delta; off_track flag |
| "Needs to retire in 3 years" | target_date, derived months_remaining |

## On-Track Calculation (rule-based, no AI)
```
pct_time_elapsed = (today - goal.created_at) / (target_date - goal.created_at)
pct_amount_achieved = current_amount / target_amount

if pct_amount_achieved >= pct_time_elapsed → on_track
if pct_amount_achieved >= pct_time_elapsed - 0.10 → at_risk
else → off_track
```
This runs on every progress log save. No external call required.

## Events to Track
- Goal created
- Progress logged (amount, delta, status change)
- Status flipped (e.g., on_track → off_track)
- Action created / completed
- AI insight generated + reviewed

## Scoring & Ranking
- Goals ranked on dashboard: off_track → at_risk → on_track (then by due date)
- Actions ranked: overdue → due this week → due later

## AI Features (later — Sprint 5)
| Feature | Trigger | Output stored as |
|---|---|---|
| Goal gap analysis | Advisor clicks "Generate Insight" | goal_ai_insights (value + source + confidence + review_status) |
| Coaching action draft | After gap analysis approved | next_step_actions (draft, needs advisor approval before save) |

All AI outputs start as `review_status = unreviewed`. Advisor approves or rejects before any row is persisted with `review_status = approved`.
