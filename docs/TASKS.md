# Tasks & Sprints

## Sprint 1 — Database & Customer CRUD
**Goal:** Core tables live; customers and goals are addable and viewable without login.

- [ ] Apply migration SQL to Supabase project
- [ ] Verify seed data renders on `/customers` (4 demo customers visible)
- [ ] Build `/customers` page — table of all customers with advisor name and goal count
- [ ] Build `/customers/new` — Add Customer form (full_name, email, DOB, risk_profile, advisor)
- [ ] Build `/customers/[id]` — customer detail: info block + goals list
- [ ] Build Add Goal form: goal_type, goal_name, target_amount, target_date, priority
- [ ] All screens: loading skeleton, empty state with CTA, form error messages, success confirmation
- [ ] Audit log row written on customer create and goal create

**Definition of Done:** A tester can open `/customers` without logging in, see 4 demo customers, add a new customer, add a goal to that customer, and refresh — data persists. No dead buttons.

---

## Sprint 2 — Progress Logging & RAG Engine ✦ v1 functional milestone
**Goal:** The core workflow works end-to-end: log progress, see RAG status, add a next-step action.

- [ ] Build Log Progress form on goal card (current value, logged_by, notes)
- [ ] On save: insert `goal_progress_logs` row; update `financial_goals.current_amount`; recalculate `on_track_status` using time-vs-amount rule
- [ ] Display RAG badge (green / amber / red) on each goal card
- [ ] Build Add Next-Step Action form (title, description, assigned_to, due_date, priority)
- [ ] Mark action complete — sets `completed = true`, `completed_at = now()`
- [ ] Build `/` dashboard: summary cards (total customers, goals off-track count, open actions count, actions due this week)
- [ ] Dashboard goal list sorted: off_track first, then at_risk, then on_track
- [ ] Audit log written for progress log and action create/complete

**Definition of Done:** Advisor opens a customer goal marked Off Track, logs a new progress value that changes status to At Risk, adds a next-step action, marks it complete — all changes persist and dashboard counts update. Success scenario from PRD passes in under 60 seconds.

---

## Sprint 3 — Dashboard Polish & Team Usability
**Goal:** The app is reliable, filterable, and usable in a real client meeting.

- [ ] Goal progress timeline chart on `/customers/[id]/goals/[goalId]` (logged_amount over time using Recharts)
- [ ] Dashboard filter: All / On Track / At Risk / Off Track
- [ ] Activity feed on customer detail (chronological: progress logs + actions)
- [ ] Responsive layout (tablet-friendly, 768px+)
- [ ] Empty states on every list with clear CTA copy
- [ ] Full manual test pass against TEST_PLAN.md
- [ ] No console errors in production build

**Definition of Done:** All TEST_PLAN.md steps pass. Dashboard loads in < 2 s on a standard connection. All five screen states (loading, empty, partial, error, ready) handled on every page.

---

## Sprint 4 — Lock It Down (Auth & Permissions)
**Goal:** Team data is protected; only authenticated team members can write.

- [ ] Enable Supabase Auth (email + password, invite-only)
- [ ] Add `teams` and `memberships` tables; seed team for demo accounts
- [ ] Replace permissive RLS with owner/team-scoped policies on all tables
- [ ] `advisor` role: own customers only; `team_lead`: all team customers
- [ ] Login page at `/login`; redirect unauthenticated users from write actions
- [ ] Attach `user_id = auth.uid()` on all inserts post-auth
- [ ] Verify no cross-team data leaks (write a test with two separate team accounts)

**Definition of Done:** Advisor A cannot read or write Advisor B's customers. Team lead sees all. Unauthenticated GET to `/customers` returns only public seed rows or redirects (per chosen policy). No secrets in client bundle confirmed via build output inspection.

---

## Sprint 5 — Intelligence Layer
**Goal:** AI gap analysis and coaching drafts available with mandatory advisor approval.

- [ ] Server-side API route `/api/ai/gap-analysis` — takes goal_id, calls GPT-4o, returns draft text
- [ ] Store result in `goal_ai_insights` with source, confidence, review_status = unreviewed
- [ ] Advisor sees draft in UI: Approve / Edit / Reject
- [ ] On Approve: review_status → approved; coaching action draft offered
- [ ] `draft_next_step_action` tool: advisor approves before `next_step_actions` row is written
- [ ] Audit log for every AI generate + every approve/reject
- [ ] CFP plan text export (structured markdown from goal + progress data)

**Definition of Done:** AI insight generated for a goal, advisor rejects it — no row persisted. Advisor approves a different insight — row persisted with review_status = approved and audit log entry confirmed.

---

## Gantt (sprint → feature)
```
Week 1: Sprint 1 (DB + Customer CRUD) → Sprint 2 (Progress + RAG + Dashboard) ← v1 functional
Week 2: Sprint 3 (Polish + Usability)
Week 3: Sprint 4 (Auth + Lock Down)
Week 4: Sprint 5 (AI Layer)
```
