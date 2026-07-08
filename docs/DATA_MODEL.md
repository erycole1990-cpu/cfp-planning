# Data Model

## customers
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid nullable | owner ref (set at lock-down sprint) |
| full_name | text | required |
| email | text | |
| phone | text | |
| date_of_birth | date | |
| risk_profile | text | conservative / moderate / aggressive |
| assigned_advisor_name | text | free text v1; FK to users at lock-down |
| notes | text | |
| created_at | timestamptz | now() |

## financial_goals
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| customer_id | uuid FK → customers | cascade delete |
| goal_type | text | Retirement / Education / Emergency Fund / Wealth Accumulation / Protection |
| goal_name | text | human label |
| target_amount | numeric | |
| current_amount | numeric | updated on each progress log |
| target_date | date | |
| priority | text | high / medium / low |
| status | text | active / achieved / paused |
| on_track_status | text | on_track / at_risk / off_track / unreviewed |
| created_at | timestamptz | |

## goal_progress_logs
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| goal_id | uuid FK → financial_goals | cascade delete |
| logged_amount | numeric | current value at log time |
| logged_by | text | advisor name (v1 free text) |
| notes | text | |
| on_track_status | text | computed and stored at log time |
| created_at | timestamptz | |

## next_step_actions
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| customer_id | uuid FK → customers | |
| goal_id | uuid FK → financial_goals nullable | |
| action_title | text | |
| action_description | text | |
| assigned_to | text | advisor name v1 |
| due_date | date | |
| completed | boolean | default false |
| completed_at | timestamptz | |
| priority | text | high / medium / low |
| created_at | timestamptz | |

## goal_ai_insights (later sprint)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| goal_id | uuid FK → financial_goals | |
| insight_type | text | gap_analysis / coaching_draft |
| value | text | AI output |
| source | text | model name e.g. openai-gpt-4o |
| confidence | numeric | 0–1 |
| review_status | text | unreviewed / approved / rejected |
| created_at | timestamptz | |

## audit_logs
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| actor | text | advisor name / system |
| action | text | e.g. progress_logged, action_completed |
| entity_type | text | financial_goals / next_step_actions / etc. |
| entity_id | uuid | |
| payload | jsonb | before/after snapshot |
| created_at | timestamptz | |

## RLS
- v1: permissive read + write on all tables (demo-first)
- Lock-down sprint: `auth.uid() = user_id` owner policy; team_lead role sees all team rows
