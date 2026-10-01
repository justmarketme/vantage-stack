import type { EventType } from "../../lib/consultant/types";

/**
 * Emma's DEFAULT follow-up sequences — the rules n8n is expected to run. Kept as data so they
 * can be tuned (and exported to n8n) without touching application code.
 *
 * How it works end to end:
 *   DB change → outbox trigger → `consultant_events` → dispatcher → signed POST to n8n
 *   → n8n waits `delayMinutes` (relative to the event, or to `data.startsAt` when
 *     `anchor = "startsAt"`), checks `stopIf` via its own reads, then calls back
 *   → POST /api/webhooks/n8n-ingress { action: "emma.send", idempotencyKey, leadId, template, variables }
 *
 * Idempotency key convention (so a replayed event never double-sends):
 *   `${event.id}:${step.id}` — the ingress stores it in `consultant_ingress_keys`.
 *
 * Emma still enforces consent at send time: a lead without opt-in is `skipped` (no_consent),
 * so a sequence can never message a scraped lead that hasn't agreed.
 */

export type SequenceStep = {
  id: string;
  template: string;
  /** Minutes after the anchor; negative = before (reminders). */
  delayMinutes: number;
  anchor: "event" | "startsAt";
  channel: "whatsapp" | "sms";
  /** Variables n8n must fill (SAST-formatted), beyond Emma's automatic ones. */
  variables?: Record<string, string>;
  /** Skip the step if any of these became true since the event (n8n evaluates). */
  stopIf: readonly ("lead_replied" | "meeting_rescheduled" | "meeting_held" | "stage_advanced" | "opted_out" | "lead_lost")[];
};

export type EmmaSequence = {
  id: string;
  trigger: EventType;
  /** Only when event.data matches (e.g. meeting kind). */
  when?: Record<string, string>;
  audience: "lead" | "consultant";
  description: string;
  steps: readonly SequenceStep[];
};

export const EMMA_SEQUENCES: readonly EmmaSequence[] = [
  {
    id: "discovery_reminders",
    trigger: "meeting.scheduled",
    when: { kind: "discovery" },
    audience: "lead",
    description: "Remind the clinic of a booked discovery call the day before and an hour before.",
    steps: [
      { id: "reminder_24h", template: "lead_discovery_reminder", delayMinutes: -24 * 60, anchor: "startsAt", channel: "whatsapp", variables: { meetingTime: "data.startsAt as SAST 'ddd D MMM, HH:mm'" }, stopIf: ["meeting_rescheduled", "opted_out", "lead_lost"] },
      { id: "reminder_1h", template: "lead_discovery_reminder", delayMinutes: -60, anchor: "startsAt", channel: "whatsapp", variables: { meetingTime: "data.startsAt as SAST 'HH:mm'" }, stopIf: ["meeting_rescheduled", "opted_out", "lead_lost"] },
    ],
  },
  {
    id: "no_show_reengagement",
    trigger: "meeting.no_show",
    audience: "lead",
    description: "Re-engage after a missed meeting: 2 hours later, then a final touch the next day.",
    steps: [
      { id: "reengage_2h", template: "lead_no_show_reengage", delayMinutes: 120, anchor: "event", channel: "whatsapp", stopIf: ["lead_replied", "meeting_rescheduled", "opted_out", "lead_lost"] },
      { id: "second_touch_next_day", template: "lead_no_show_second_touch", delayMinutes: 24 * 60, anchor: "event", channel: "whatsapp", stopIf: ["lead_replied", "meeting_rescheduled", "opted_out", "lead_lost"] },
    ],
  },
  {
    id: "post_demo_follow_up",
    trigger: "meeting.held",
    when: { kind: "demo" },
    audience: "lead",
    description: "The morning after a demo, ask what stood out.",
    steps: [{ id: "next_day", template: "lead_post_demo_follow_up", delayMinutes: 18 * 60, anchor: "event", channel: "whatsapp", stopIf: ["lead_replied", "stage_advanced", "opted_out", "lead_lost"] }],
  },
  {
    id: "proposal_nudge",
    trigger: "lead.stage_changed",
    when: { "lead.stage": "proposal" },
    audience: "lead",
    description: "Three days after a proposal with no movement, a calm nudge.",
    steps: [{ id: "day_3", template: "lead_proposal_nudge", delayMinutes: 3 * 24 * 60, anchor: "event", channel: "whatsapp", stopIf: ["lead_replied", "stage_advanced", "opted_out", "lead_lost"] }],
  },
  {
    id: "payment_thank_you",
    trigger: "deal.paid",
    audience: "lead",
    description: "Thank the clinic as soon as payment is confirmed.",
    steps: [{ id: "immediate", template: "lead_payment_thank_you", delayMinutes: 0, anchor: "event", channel: "whatsapp", variables: { amount: "data.amount as 'R12 500'" }, stopIf: ["opted_out"] }],
  },
  {
    id: "consultant_new_lead",
    trigger: "lead.claimed",
    audience: "consultant",
    description: "Tell the consultant a lead just landed in their pipeline.",
    steps: [{ id: "immediate", template: "consultant_new_lead_assigned", delayMinutes: 0, anchor: "event", channel: "whatsapp", stopIf: [] }],
  },
];
