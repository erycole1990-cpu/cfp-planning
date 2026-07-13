# Operations, Backup, and PDPA Checklist

This checklist is an operating baseline for CFP Planning. Final retention periods and legal wording must be approved by the agency's Malaysian compliance or legal adviser.

## Backup and recovery

- Check the Supabase Database Backups page monthly and record the date of the latest successful backup.
- On a plan without managed backups, create a regular encrypted logical database export and store it outside the production Supabase account.
- Back up uploaded documents separately because database backups do not include Storage objects.
- Perform a restore drill to a non-production environment at least quarterly. Record the date, owner, result, and corrective action.
- Take or verify a recent backup before applying a database migration that changes or removes data.

## Access and staff changes

- Review active admins and agents monthly.
- Require MFA for every admin and strongly recommend it for agents.
- Transfer an agent's active clients before changing the agent to inactive.
- Remove access promptly when employment or agency authority ends.
- Keep the administrator, time, reason, previous owner, and new owner in the audit log.

## Personal data and retention

- Collect only data required for financial planning, service, compliance, and agreed follow-up.
- Document the purpose and approved retention period for active customers, ended-service customers, uploaded statements, pending submissions, and audit records.
- Keep ended-service records read-only unless a customer is formally reactivated.
- Provide a controlled process for access, correction, export, and deletion requests. Do not delete information subject to an active legal or compliance hold.
- Use approved secure channels for identity documents and financial statements. Do not place secrets or client documents in source control.

## Client-submitted changes

- A client edit is a pending submission, not an immediate change to the official plan.
- The assigned adviser compares the original and proposed values and approves or rejects the submission with a reason.
- Only approved values update the official planning record.
- The submission, reviewer, decision, time, and reason remain auditable.

## Email delivery

- Verify an agency-owned sending domain or subdomain in Resend before production use.
- Set `NOTIFICATION_FROM_EMAIL` to an address on that verified domain.
- Use the admin Resend Notice action after correcting a failed delivery. Resending a notice must not create another ownership change.
