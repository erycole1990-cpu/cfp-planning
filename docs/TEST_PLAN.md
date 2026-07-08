# Test Plan

## v1 Success Scenario (manual)
> Advisor finds an off-track goal, logs progress, adds a next-step action, sees dashboard update.

1. Open `/` — dashboard loads; summary cards show values from seed data (no login prompt)
2. Confirm at least one goal shows **Off Track** badge
3. Click customer name → `/customers/[id]` — customer detail loads with goals list
4. On an Off Track goal, click **Log Progress** — form opens
5. Enter a current value lower than target; add a note; submit
6. Confirm RAG badge recalculates (stays Off Track if still below threshold)
7. Enter a value that moves status → verify badge changes to **At Risk**
8. Click **Add Action** — enter title "Review asset allocation", assign to advisor, set due date 2 weeks out
9. Submit — action appears in the goal's action list with status **Open**
10. Return to `/` dashboard — open actions count has incremented by 1
11. Mark the action **Complete** — action moves to completed list; counter decrements
12. Refresh page — all changes still present (confirms DB persistence, not local state)

## Empty State Tests
- Add a brand-new customer with no goals → `/customers/[id]` shows empty goals state with "Add First Goal" CTA
- New goal with no progress logs → goal card shows "No progress logged yet" and Log Progress button
- Dashboard with all goals On Track → off-track card shows 0, no error

## Error State Tests
- Submit Add Goal form with target_date in the past → inline validation error, no DB write
- Submit Log Progress with a non-numeric amount → form rejects, error message shown
- Simulate network failure on progress save → error toast displayed; form stays open with entered values
- Try to mark an already-completed action complete again → button disabled or no-op

## Loading State Tests
- Slow network (throttle to 3G in DevTools) — skeleton loaders visible on `/customers` and dashboard before data arrives

## Permissions (post Sprint 4)
- Log in as Advisor A; confirm Advisor B's customers are not visible
- Log in as Team Lead; confirm all team customers are visible
- Attempt direct Supabase query with anon key on a non-owned row — RLS blocks it
