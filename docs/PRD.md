# Product Requirements — CFP Planning Tool

## Problem
Financial advisor teams manage multiple customer goals manually across spreadsheets. There is no shared view of who is on track, what the next coaching step is, or who owns follow-up — slowing the path to sale closure and goal achievement.

## Target Users
Internal financial planning team (advisors + team lead). ~5–15 users sharing one workspace.

## Core Objects
| Object | Purpose |
|---|---|
| Customer | The client being served |
| Financial Goal | A specific CFP-standard goal (retirement, education, emergency fund, etc.) |
| Goal Progress Log | A dated snapshot of current value vs target |
| Next-Step Action | A coaching task assigned to an advisor with a due date |
| Audit Log | Immutable record of every meaningful write |

## MVP Must-Haves (v1 checklist)
- [ ] Add / edit / view customers
- [ ] Add financial goals per customer (type, target amount, target date, priority)
- [ ] Log progress against a goal (current value, notes)
- [ ] RAG status auto-calculated: On Track / At Risk / Off Track
- [ ] Add next-step coaching actions per goal; mark complete
- [ ] Operational dashboard: all customers, goal statuses, open actions
- [ ] All screens visible without login (demo-first)

## Non-Goals (v1)
- Client-facing portal
- PDF plan generation
- AI-generated analysis
- Email/SMS reminders
- Billing or subscription management

## Success Criteria
An advisor opens the app, finds a customer whose goal is marked **Off Track**, reads the last progress note, creates a next-step action assigned to themselves with a due date, and sees it appear immediately on the dashboard — all without logging in, within 60 seconds.
