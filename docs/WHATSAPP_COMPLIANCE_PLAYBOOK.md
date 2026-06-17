# VantageStack WhatsApp / Meta Compliance Playbook — Isabel AI Booking Flow

Sender `whatsapp:+27600132533` (Twilio, WABA-approved, 250 msg/24h tier, quality HIGH, **not** Meta-verified). Reflects 2025/2026 WhatsApp Business Platform + Twilio enforcement. Researched + adversarially verified 2026-06-17.

## 1. Safe free-form (in-session)
The lead messages us first → opens a **24-hour customer service window (CSW)**, measured from their **last inbound message**, reset by every new inbound. While open, free-form messages (text, media, **links**) are allowed — no template, no approval, no fee. This covers:
- All of Isabel's discovery replies
- The Cal.com booking **confirmation**
- The Cal.com self-serve booking **link**
- The 2h "didn't finish" nudge **if still inside the window**

## 2. The 2-hour fallback rule (decided at SEND time, off **last inbound**)
```
elapsed = now − lastInboundTimestamp        # re-read at send time, NOT schedule time
if elapsed < 24h:  send Cal.com link FREE-FORM            # normal case (2h ≪ 24h)
else:              window CLOSED → free-form fails (Twilio 63016).
                   Needs an approved MARKETING template + marketing opt-in, else SUPPRESS.
```
Because the timer is anchored to last inbound and fires at ~2h, the **normal case is in-window → free-form link**. The template path is a rare edge case.

**Our decision:** in the `≥24h` edge we **SUPPRESS** (we have no MARKETING template approved and the business isn't verified, so approvals are slow). No drip, no risk. Revisit if we later want an approved MARKETING re-engagement template.

## 3. The abandoned-booking nudge is MARKETING, not UTILITY
A "come finish your booking" message drives a *not-yet-completed* conversion = MARKETING by Meta's definition. UTILITY requires an **already-completed** transaction. Mislabeling → auto-reclassified (default since 9 Apr 2025) and hurts WABA standing. So the only compliant outside-window path is a MARKETING template with opt-in.

## 4. Opt-in
- In-session free-form needs no separate opt-in (the inbound + open window suffices).
- A MARKETING template (outside window) needs **prior, logged marketing opt-in naming VantageStack** — an inbound message alone is NOT marketing opt-in.
- Capture consent at chat start, log timestamp + wording. Honour **STOP** and WhatsApp Block; suppress permanently.

## 5. Frequency / quality guardrails
- **One** nudge per lead per booking attempt. No drip.
- Prefer re-engaging in-session (a reply reopens the window).
- Quality rating is rolling-7-day; if Yellow/Flagged, pause outside-window sends. 7 consecutive Flagged days → tier downgrade.
- 250/24h cap is **pooled across the Business Portfolio** (since Oct 2025) — shared with Jessica's number. Don't starve confirmations.
- Pursue Meta Business Verification to lift to 1,000/24h.
- Disclose AI in Isabel's first message; route "human/agent" requests to Jono/KG.

## 6. Hard DO-NOTs
1. No free-form once `now − lastInbound ≥ 24h` (Twilio 63016).
2. Never label the abandoned-booking nudge UTILITY — it's MARKETING.
3. Anchor the 2h timer to **last inbound** only (never chat-start or our last outbound).
4. Outside window = template via `ContentSid` only (never template text in `Body`).
5. Don't assume Jessica's phone call keeps the WhatsApp window open — gate on actual WhatsApp `lastInbound`.
6. No MARKETING template without logged opt-in + STOP.
7. No more than one re-engagement nudge.
8. No urgency/discounts/ALL-CAPS/emoji-spam in templates.

## 7. Engineering invariants (baked into our code)
Persist per thread: `last_inbound_at` (update on **every** inbound), `marketing_opt_in` (+ timestamp/wording), `opted_out`, `nudge_sent_at`, `booking_status`/`booking_completed`.
- Inbound webhook updates `last_inbound_at` atomically on every received message.
- 2h worker: re-read `last_inbound_at` at send time; `<24h` → free-form link; `≥24h` → suppress (no approved MARKETING template yet).
- Handle `STOP` → set `opted_out`, suppress future sends.
- Booking confirmation: free-form while window open.
