# Security

## Secret Handling
- Supabase service role key: server-side only (`SUPABASE_SERVICE_ROLE_KEY` in Vercel env, never in client bundle)
- OpenAI key: server-side API route only
- Client uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key is safe; RLS enforces access

## Permission Model
| Sprint | Model |
|---|---|
| v1 (demo) | Permissive RLS — all reads and writes open; no login required |
| Lock-down | Auth required; `user_id = auth.uid()` on all writes; team_lead role sees all team rows via membership join |

### Roles (lock-down sprint)
- `advisor` — read/write own customers; read team actions on shared dashboard
- `team_lead` — read/write all customers in team; can reassign actions

## Approved-Tools Rule
Agents may only call explicitly named tools (see AGENTIC_LAYER.md). Generic SQL execution or `eval`-style tools are never permitted. Every agent action is logged to `audit_logs` before returning a result to the UI.

## Audit Principle
Every meaningful state change (create, update, complete, approve, reject) writes an `audit_logs` row server-side. The row is append-only — no update or delete policy on `audit_logs`. This cannot be circumvented by the client.

## Stop and Get a Human
If a task involves bulk deletion of customer records, export of full portfolio data to an external system, or any action touching payment or legal compliance — stop, do not automate, involve the team lead manually.
