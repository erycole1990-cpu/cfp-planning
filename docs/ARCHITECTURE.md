# Architecture

## Stack
- **Frontend:** Next.js 14 (App Router) on Vercel
- **Database & Auth:** Supabase (Postgres + RLS + Auth in lock-down sprint)
- **Styling:** Tailwind CSS
- **Charts:** Recharts (goal timeline)
- **AI (later):** OpenAI GPT-4o via server-side API route only

## Now vs Later
| Now | Later |
|---|---|
| Customer + goal CRUD | Auth & team-scoped RLS |
| Progress logging + RAG status | Advisor assignment ownership |
| Next-step actions dashboard | AI gap analysis & coaching draft |
| Seed demo data, no login wall | CFP plan PDF export |

## Key Action Flow — "Log Progress & Set Next Step"
1. Advisor opens `/customers/[id]` — page fetches customer + goals from Supabase
2. Advisor taps **Log Progress** on a goal — form captures current value + notes
3. On submit: server action inserts a `goal_progress_logs` row; updates `financial_goals.current_amount` and recalculates `on_track_status` (pure arithmetic — no AI needed)
4. RAG badge updates immediately via revalidation
5. Advisor taps **Add Action** — form captures title, assigned advisor, due date
6. Row inserted into `next_step_actions`; dashboard counter increments
7. Audit log row written for both inserts

## Layer Order
1. **Data** — tables, constraints, RLS (foundation; truth lives here)
2. **App logic** — CRUD forms, RAG calculation, dashboard aggregation (coded, runs without AI)
3. **Intelligence** — AI gap summaries, coaching drafts (additive, never blocking)

The core workflow runs fully if AI is disabled.
