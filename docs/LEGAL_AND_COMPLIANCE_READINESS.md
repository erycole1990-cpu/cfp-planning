# Legal and Compliance Readiness

This checklist is a production gate, not a declaration of legal compliance. Complete it with Malaysian legal and compliance advisers before storing real client data.

## Operator and Regulatory Position

- [ ] Confirm the legal operator, registration number, business address, privacy contact, and complaints contact.
- [ ] Set `NEXT_PUBLIC_AGENCY_LEGAL_NAME`, `NEXT_PUBLIC_AGENCY_CONTACT_EMAIL`, `NEXT_PUBLIC_AGENCY_REGISTRATION`, and `NEXT_PUBLIC_AGENCY_LICENSE` in Vercel.
- [ ] Confirm whether the operator and each representative may lawfully use the title "Financial Planner" and provide the services shown in the app.
- [ ] Align the Terms of Use with engagement letters, fee disclosures, conflicts policy, product documents, and professional indemnity insurance.
- [ ] Review whether advice, referrals, tax, estate, insurance, lending, or investment features trigger additional licensing or disclosure duties.

## Malaysian Personal Data Protection

- [ ] Obtain legal review of the Privacy Notice under the Personal Data Protection Act 2010 and the Personal Data Protection (Amendment) Act 2024.
- [ ] Publish usable English and Bahasa Malaysia notices before production collection.
- [ ] Record the purposes, legal basis or consent approach, mandatory and optional fields, data sources, disclosures, and consequences of not providing data.
- [ ] Maintain a register of processors, subprocessors, data locations, overseas transfers, contracts, and security reviews.
- [ ] Assess whether a Data Protection Officer is required under the applicable Malaysian thresholds and register the officer when required.
- [ ] Document access, correction, withdrawal, deletion, direct-marketing objection, complaint, identity-verification, and response workflows.

## Security and Incidents

- [ ] Require multi-factor authentication for administrators and strongly encourage it for advisers.
- [ ] Review least-privilege access, client ownership, admin reassignment, audit logging, service-role key handling, backups, and recovery.
- [ ] Create a written data-breach response plan with owners, evidence preservation, severity assessment, and statutory notification steps.
- [ ] Test account suspension, staff departure, lost device, compromised credential, and unauthorised client-access scenarios.
- [ ] Complete penetration and dependency reviews before real data, then repeat on a defined schedule.

## Records and Operations

- [ ] Approve a category-specific retention schedule rather than relying only on the seven-year review default.
- [ ] Define legal holds, deletion approval, backup expiry, ended-client access, and audit-log retention.
- [ ] Confirm calculator assumptions, warnings, version control, professional review, and correction records.
- [ ] Train admins and advisers on conflicts, client assignment, privacy requests, incident reporting, and appropriate use of automated extraction.
- [ ] Keep evidence of training, policy acceptance, consent, complaints, breaches, corrective action, and annual reviews.

## Launch Decision

- [ ] Malaysian counsel signs off on the final notices and terms.
- [ ] Licensing or regulatory counsel confirms the offered services and titles.
- [ ] Insurance coverage is confirmed for professional, cyber, privacy, and employee risks.
- [ ] A named owner accepts each unresolved risk and records a remediation date.
- [ ] Only after these gates are complete may real client financial data be entered.
