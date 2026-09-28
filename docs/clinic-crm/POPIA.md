# Clinic CRM — POPIA control map

Protection of Personal Information Act 4 of 2013 ("POPIA"). This maps what the product does
to the Act's conditions and says plainly what the **clinic** still has to do.

> **Not legal advice.** Items marked **⚖ LAWYER** need review by a South African data-protection
> attorney before the product is sold as "POPIA-compliant". Section references are to POPIA
> unless stated (PAIA = Promotion of Access to Information Act 2 of 2000).

## Roles

| Party | POPIA role | Why |
|---|---|---|
| The clinic / practice | **Responsible party** (s.1) | Decides why and how patient information is processed. |
| Vantage Stack | **Operator** (s.1, s.20–21) | Processes on the clinic's behalf under a mandate. |
| Supabase, Vercel, Twilio, Meta (WhatsApp) | Sub-operators, all **outside South Africa** | Store, host or carry the data. See cross-border section. |

A written **operator agreement** between each clinic and Vantage Stack is mandatory (s.21(1)),
requiring Vantage Stack to maintain s.19 safeguards and to notify the clinic immediately of
any suspected compromise (s.21(2)). It must flow the same duties down to every sub-operator.
**USER-GATED ⚖ LAWYER** — no template exists in this repo yet.

---

## Special personal information — the biggest issue

An appointment at a named clinic, a practitioner, a service ("root canal", "Botox") or a free-
text note can reveal **health information**, which is *special personal information* (s.26).
Processing it is prohibited unless an exception applies (s.27 consent, or s.32(1)(a):
medical professionals / healthcare institutions where necessary for proper treatment and
care, subject to a duty of confidentiality). Children's information (patients under 18) is
separately restricted (s.34–35; consent of a *competent person*, i.e. a parent/guardian).

Product stance:
- The CRM is for **scheduling and communication**, not clinical records. The UI and onboarding
  must tell clinics not to put diagnoses or clinical notes in `notes`/`service`/`tags`.
  **Recommendation:** add that warning to the patient form (Agent 1).
- Message templates must not name a condition or treatment (a reminder that says "your HIV
  follow-up" on a shared phone is a disclosure). Default templates comply; clinics editing
  them must be warned. **⚖ LAWYER** on whether appointment metadata alone is "health
  information" for this purpose and whether s.32 covers a CRM operator.

---

## Condition-by-condition

### s.8 Accountability / s.17 Documentation
- **AUTOMATED:** `clinic_crm.audit_log` — append-only record of every patient read and write,
  logins, failed logins, lockouts, logouts, seeding (`lib/clinic-crm/db.ts → audit()`).
- **Clinic:** keep the PAIA manual (PAIA s.51) covering this processing.

### s.9–12 Processing limitation — lawful basis (s.11) and minimality (s.10)
| Data flow | Basis (s.11(1)) | Control |
|---|---|---|
| Registered patient | (a) consent **and** (b) steps for a contract of care | `PatientInput.consent` must be `true`; `consent_at` + `consent_by` (staff id) stored. |
| **Inbound enquiry** (a stranger messages the clinic first) | (b) "necessary to carry out actions for the conclusion … of a contract" at the data subject's request; the person initiated contact. Arguably also (f) legitimate interest. | Stored as a *lead* with `consent_at = NULL`. The app may answer them (instant acknowledgement) but must not put them into reminders/recalls until converted with consent. **⚖ LAWYER** on (b) vs (f) and on the auto-acknowledgement. |
| Reminders / no-show follow-ups | (b) performance of the booked appointment | Only for patients with consent; stop on opt-out. |
| Recalls | Direct marketing — see s.69 below | |
- s.10 minimality: fields are limited to name, phone, email, channel, notes, tags. No ID
  number, medical aid number or date of birth is collected. Keep it that way.
- s.11(3) right to object: STOP handling (below) is the object mechanism for messaging.

### s.13 Collection for a specific purpose / s.15 further processing
- Purpose (to state in the clinic's notice): *booking management, appointment reminders,
  responding to enquiries and, with consent or as an existing patient, check-up recalls.*
- No analytics, profiling, resale or AI training on patient data. Dashboard metrics are
  aggregate counts per clinic.

### s.14 Retention
- **Gap:** no automatic retention/deletion job yet. Health-practitioner record-keeping
  guidance (HPCSA) generally expects records to be kept for years; a CRM message log is not
  the clinical record, so a shorter period (e.g. 24 months after last contact) is defensible.
  **USER-GATED ⚖ LAWYER:** agree a retention period per clinic, then add a purge job.
- Erasure on request is available now (s.24 below).

### s.16 Information quality
- Phone numbers normalised to E.164 on input; staff can correct any field (PATCH).

### s.18 Notification to the data subject
When information is collected the clinic must tell the patient (s.18(1)): its name and
address; the purpose; whether supply is voluntary and the consequences of not supplying it;
any law requiring it; **that the information will be transferred outside South Africa**
(s.18(1)(g)) and to whom (categories of recipients); and the rights of access, correction,
objection and complaint to the Information Regulator (s.18(1)(h)).
- **USER-GATED (clinic):** display a notice at reception/website/intake form.
  **Recommendation:** ship a template privacy notice per clinic. **⚖ LAWYER**
- For inbound enquiries, the first automated reply is the practical point to link that notice.

### s.19–22 Security safeguards
| Measure | Status |
|---|---|
| Patient data in a Postgres schema not exposed by Supabase's REST API; RLS enabled with no policies | AUTOMATED |
| Tenancy: every query filters on `clinic_id` from the verified session or the Twilio `To` number, never from the request body | AUTOMATED (Agent 3; tested by Agent 4) |
| Staff auth: bcrypt cost 12, generic errors, rate limiting, DB account lockout, 12 h httpOnly/Secure/SameSite cookie, staff deletion revokes access on the next request | AUTOMATED |
| Transport: HTTPS only (HSTS), webhook signatures (HMAC-SHA1, Twilio), bearer-protected cron | AUTOMATED |
| Browser: strict CSP, no framing, no caching, noindex, microphone limited to the app | AUTOMATED |
| No patient data in logs, URLs or error bodies | AUTOMATED (convention + review) |
| Role separation: owner/manager/reception; automations owner/manager only | AUTOMATED |
| Staff offboarding (delete staff row), unique logins, no shared accounts | USER-GATED (clinic process) |
| MFA for staff | **Gap** — not implemented. Recommended before larger clinics. |
| Encryption at rest | Provided by Supabase (disk-level). Field-level encryption not implemented. |
| Backups / restore test | USER-GATED — confirm Supabase plan's backup/PITR for `tinkmipmxunwvyemhalu`. |
- **s.22 security compromise:** the clinic (responsible party) must notify the Information
  Regulator and affected patients as soon as reasonably possible; the Regulator requires
  notification in its prescribed form via its portal. Vantage Stack must notify the clinic
  immediately (s.21(2)). **USER-GATED:** written incident-response runbook + contact list.
  **⚖ LAWYER** on timelines in the operator agreement.

### s.23 Access / s.24 Correction and deletion / s.25 manner
- **AUTOMATED:** `GET /api/clinic-crm/patients/[id]/export` returns everything held on a
  patient (profile, appointments, messages) as JSON — answers an access request.
- **AUTOMATED:** `PATCH` corrects; `DELETE /patients/[id]` is a hard delete (cascades to
  appointments, messages, outbox; also deletes staff message drafts `draft:<patientId>`) and is audited.
  Not covered: an unsaved *new-patient* form draft (`draft:new-patient`) lives with the staff member
  until they save or clear it.
- Note: the audit log keeps the patient's **id** (not their details) after erasure, which is
  needed for accountability. Copies held by Twilio (message logs) and Meta are **not** erased
  by this call — **USER-GATED:** document that Twilio message bodies can be redacted via the
  Twilio API/Console and consider enabling Twilio message-body redaction. **⚖ LAWYER**

### s.69 Direct marketing by electronic communication (SMS, WhatsApp)
- Unsolicited electronic direct marketing is prohibited unless the recipient **consented**
  (s.69(1)(a)) or is an **existing customer** (s.69(1)(b)) whose details were obtained in the
  context of a sale of a service, for marketing the responsible party's own similar services,
  who was given the chance to object at collection **and on every communication** (s.69(3)).
  A non-customer may be asked for consent **only once** (s.69(2)). Every marketing message
  must identify the sender and give an address/contact to opt out (s.69(4)).
- **AUTOMATED:** STOP / STOPALL / UNSUBSCRIBE / OPT OUT (case-insensitive) sets
  `opted_out_at`, cancels queued messages and blocks all further outbound except one
  confirmation; START re-subscribes.
- **Gap to fix (Agent 3):** the default **recall** template ("you're due for a check-up") is
  the message most likely to be treated as direct marketing, and it does **not** contain an
  opt-out instruction. Reminder copy does ("Reply STOP to opt out"); recall must too. The
  same is advisable for no-show and new-lead messages. Every template also names the clinic
  (`{{clinicName}}`), satisfying sender identity.
- Appointment reminders for a booked visit are service messages, not marketing — but keeping
  STOP in them costs nothing. **⚖ LAWYER** on classifying recalls.
- Quiet hours are not in POPIA, but sending recalls at night invites complaints; consider a
  send window in the dispatcher.

### s.72 Transfers of personal information outside South Africa
All sub-operators process outside the Republic:

| Sub-operator | Processing | Location | What the clinic / Vantage Stack needs |
|---|---|---|---|
| Supabase (`tinkmipmxunwvyemhalu`) | Database — all patient data at rest | The project's chosen AWS region — **verify in the Supabase dashboard**; Supabase offers no South African region. | Supabase DPA (accepted in the dashboard/organisation settings). |
| Vercel | Runs the app; data in transit and in function memory; logs | Function region (default US East `iad1` unless configured) | Vercel DPA. Keep function logs free of patient data (done). |
| Twilio | SMS/WhatsApp delivery; stores message bodies and numbers | United States (+ carriers) | Twilio DPA (includes cross-border terms). |
| Meta (WhatsApp Business Platform) | Carries WhatsApp messages; Meta is the platform operator | Global | WhatsApp Business terms / data processing terms accepted with the WABA. |

- A transfer is lawful if the recipient is bound by law, binding corporate rules or a **binding
  agreement** giving protection substantially similar to POPIA (s.72(1)(a)), or with the data
  subject's consent (s.72(1)(b)), or where necessary for a contract with/for the data subject
  (s.72(1)(c)–(d)). The practical route: s.72(1)(a) via the DPAs above **plus** disclosure in
  the s.18 notice, with consent captured at registration as a fallback.
- Health information is special personal information: transferring it to a third party in a
  foreign country without adequate protection requires the Regulator's **prior
  authorisation** (s.57(1)(d)). If the DPAs are relied on as "adequate protection", s.57 may
  not bite — **⚖ LAWYER, highest priority.**
- **USER-GATED:** accept/file the Supabase, Vercel and Twilio DPAs; confirm the Supabase region.

### Information Officer (s.55–56; PAIA)
- Each clinic's head (e.g. practice owner) is its **Information Officer** by default and must
  be **registered with the Information Regulator** before taking up duties (s.55(2)), may
  designate deputies (s.56), and must: encourage compliance, handle access/correction
  requests, work with the Regulator on investigations, maintain a compliance framework, do a
  personal-information impact assessment, and keep the PAIA manual.
- Vantage Stack, as a private body processing personal information, must register its own
  Information Officer too. **USER-GATED.**
- Onboarding checklist for each clinic: IO registered ✔, privacy notice live ✔, operator
  agreement signed ✔, templates reviewed ✔, staff accounts individual ✔.

---

## Summary of open items

| # | Item | Owner |
|---|---|---|
| 1 | Operator agreement template (clinic ↔ Vantage Stack) with sub-operator flow-down | Jono + ⚖ lawyer |
| 2 | s.72 / s.57 position on health data offshore; accept DPAs; confirm Supabase region | Jono + ⚖ lawyer |
| 3 | Opt-out line: **done** for reminder, no-show and recall defaults; new-lead ack still has none (advisable) | Agent 3 |
| 4 | "No clinical notes" warning on the patient form — **done** ("Admin notes only…") | Agent 1 |
| 5 | Retention period + purge job | Jono + clinic, then dev |
| 6 | Privacy notice template for clinics (s.18) | ⚖ lawyer |
| 7 | Incident-response runbook (s.21(2), s.22) | Jono |
| 8 | MFA for staff | Backlog |
| 9 | Information Officer registrations (each clinic + Vantage Stack) | Clinic / Jono |
