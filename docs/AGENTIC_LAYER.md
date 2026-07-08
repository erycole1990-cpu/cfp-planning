# Agentic Layer

## Risk Classification
| Risk | Actions |
|---|---|
| Low — auto | Calculate on_track_status; tag goal type; score priority |
| Medium — light approval | Draft next-step action text; suggest contribution increase |
| High — always approval | Send coaching message to client; update a goal target amount |
| Critical — human only | Delete customer record; export all client data; any irreversible write |

## Named Tools (approved list)
| Tool | What it does | Risk |
|---|---|---|
| `calculate_on_track_status` | Arithmetic on amounts + dates | Low |
| `generate_goal_gap_analysis` | Calls LLM, returns draft text only | Low |
| `draft_next_step_action` | Suggests action title + description | Medium |
| `update_goal_current_amount` | Writes to financial_goals after advisor confirm | High |

No `run_any`, no `send_any`, no raw SQL execution tools permitted.

## Approval Flow (Medium+)
1. Agent produces a **Draft** with reasoning
2. Advisor sees draft in UI with Approve / Edit / Reject
3. On Approve → named tool executes the write
4. Audit log records: actor, tool name, payload, timestamp

## Audit Log Fields (per agent action)
- `actor`: advisor user_id or "system"
- `action`: tool name
- `entity_type` + `entity_id`: what was affected
- `payload`: {input, output, approved_by, approved_at}

## v1 vs Later
- **v1:** only `calculate_on_track_status` runs automatically
- **Sprint 5:** `generate_goal_gap_analysis` + `draft_next_step_action` added with approval UI
