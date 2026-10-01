import { EMMA_OPT_OUT_FOOTER } from "./system";

/**
 * Emma's message templates — the ONLY wording Emma sends. Tune copy here, not in code.
 *
 * - `body` uses `{{variable}}` placeholders. Rendering fails (message dead-lettered, never sent
 *   half-filled) if a listed variable is missing.
 * - Variables every message gets automatically: `clinicName`, `contactName` (or "there"),
 *   `consultantName` (first name). Others (e.g. `meetingTime`, `amount`) come from the caller —
 *   n8n passes them in `emma.send`; times must already be SAST-formatted, money as "R12 500".
 * - `contentSidEnv`: WhatsApp only allows free-form text within 24h of the clinic's last
 *   message. Business-initiated messages outside that window need a Meta-approved template:
 *   set this env var to the Twilio Content SID and Emma sends `ContentSid` + `ContentVariables`
 *   (numbered in `contentVariables` order) instead of the body. SMS always uses the body.
 * - `audience`: who receives it. Lead templates are consent-gated (see EMMA_RULES).
 */

export type EmmaTemplateAudience = "lead" | "consultant" | "owner";

export type EmmaTemplate = {
  id: string;
  audience: EmmaTemplateAudience;
  /** Preferred channel; `emma.send` may override for lead templates. */
  channel: "whatsapp" | "sms";
  description: string;
  body: string;
  /** Variables the caller must supply (beyond the automatic ones). */
  variables: readonly string[];
  contentSidEnv?: string;
  /** Order of `ContentVariables` {"1": …, "2": …} for the approved WhatsApp template. */
  contentVariables?: readonly string[];
  /**
   * Transactional messages that must go out even without marketing consent (e.g. the single
   * STOP confirmation). Never set this on a marketing/follow-up template.
   */
  transactional?: boolean;
};

export const AUTO_VARIABLES = ["clinicName", "contactName", "consultantName"] as const;

export const EMMA_TEMPLATES: readonly EmmaTemplate[] = [
  // ── Lead-facing ──────────────────────────────────────────────────────────
  {
    id: "lead_discovery_reminder",
    audience: "lead",
    channel: "whatsapp",
    description: "Reminder before a booked discovery call (n8n: ~24h and ~1h before).",
    body: `Hi {{contactName}}, it's Emma from VantageStack. Just a reminder that {{consultantName}} will call {{clinicName}} on {{meetingTime}} (SAST) for your discovery chat. Need a different time? Just reply here. ${EMMA_OPT_OUT_FOOTER}`,
    variables: ["meetingTime"],
    contentSidEnv: "EMMA_CONTENT_SID_DISCOVERY_REMINDER",
    contentVariables: ["contactName", "consultantName", "clinicName", "meetingTime"],
  },
  {
    id: "lead_no_show_reengage",
    audience: "lead",
    channel: "whatsapp",
    description: "After a missed meeting — no guilt, easy reschedule.",
    body: `Hi {{contactName}}, it's Emma from VantageStack. Sorry we missed each other today — clinics get busy! Would you like {{consultantName}} to find another time that suits {{clinicName}}? ${EMMA_OPT_OUT_FOOTER}`,
    variables: [],
    contentSidEnv: "EMMA_CONTENT_SID_NO_SHOW",
    contentVariables: ["contactName", "consultantName", "clinicName"],
  },
  {
    id: "lead_no_show_second_touch",
    audience: "lead",
    channel: "whatsapp",
    description: "Second, final touch the next day after a no-show.",
    body: `Hi {{contactName}}, Emma from VantageStack again. If now isn't the right time for {{clinicName}}, no problem at all — just reply with a day that works and {{consultantName}} will make it happen. ${EMMA_OPT_OUT_FOOTER}`,
    variables: [],
    contentSidEnv: "EMMA_CONTENT_SID_NO_SHOW_2",
    contentVariables: ["contactName", "clinicName", "consultantName"],
  },
  {
    id: "lead_post_demo_follow_up",
    audience: "lead",
    channel: "whatsapp",
    description: "The day after a demo: what stood out, what's still unclear.",
    body: `Hi {{contactName}}, thanks for your time on the demo with {{consultantName}}. Out of curiosity, what stood out most for {{clinicName}}, and is there anything you'd want to see again before deciding? ${EMMA_OPT_OUT_FOOTER}`,
    variables: [],
    contentSidEnv: "EMMA_CONTENT_SID_POST_DEMO",
    contentVariables: ["contactName", "consultantName", "clinicName"],
  },
  {
    id: "lead_proposal_nudge",
    audience: "lead",
    channel: "whatsapp",
    description: "A calm nudge a few days after the proposal was sent.",
    body: `Hi {{contactName}}, it's Emma from VantageStack. {{consultantName}} wanted to check whether the proposal for {{clinicName}} raised any questions — happy to walk through anything that isn't clear. ${EMMA_OPT_OUT_FOOTER}`,
    variables: [],
    contentSidEnv: "EMMA_CONTENT_SID_PROPOSAL_NUDGE",
    contentVariables: ["contactName", "consultantName", "clinicName"],
  },
  {
    id: "lead_payment_thank_you",
    audience: "lead",
    channel: "whatsapp",
    description: "Payment confirmed — thank you + what happens next.",
    body: `Hi {{contactName}}, we've received your payment of {{amount}} — thank you and welcome to VantageStack! {{consultantName}} will be in touch shortly about setting up {{clinicName}}'s booking agent.`,
    variables: ["amount"],
    contentSidEnv: "EMMA_CONTENT_SID_PAYMENT_THANKS",
    contentVariables: ["contactName", "amount", "consultantName", "clinicName"],
  },
  {
    id: "lead_opt_out_confirmation",
    audience: "lead",
    channel: "whatsapp",
    description: "Sent ONCE when a lead replies STOP. Transactional: allowed after opt-out.",
    body: "You've been unsubscribed from VantageStack messages and won't hear from us here again. Reply START if you change your mind.",
    variables: [],
    transactional: true,
  },
  {
    id: "lead_opt_in_confirmation",
    audience: "lead",
    channel: "whatsapp",
    description: "Sent when a lead replies START.",
    body: `Thanks {{contactName}} — you're subscribed to VantageStack updates again. ${EMMA_OPT_OUT_FOOTER}`,
    variables: [],
    transactional: true,
  },

  // ── Consultant-facing ────────────────────────────────────────────────────
  {
    id: "consultant_new_lead_assigned",
    audience: "consultant",
    channel: "whatsapp",
    description: "A lead was assigned to / claimed by the consultant.",
    body: "Emma here: {{clinicName}} is now in your pipeline. Open the Consultant Portal and make the first call while it's fresh.",
    variables: [],
  },
  {
    id: "consultant_follow_up_due",
    audience: "consultant",
    channel: "whatsapp",
    description: "A lead's next action is due.",
    body: "Emma here: your follow-up with {{clinicName}} is due ({{dueTime}} SAST). Call now and lock in the next step.",
    variables: ["dueTime"],
  },
  {
    id: "consultant_lead_replied",
    audience: "consultant",
    channel: "whatsapp",
    description: "The clinic replied to Emma — the consultant should respond personally.",
    body: "Emma here: {{clinicName}} just replied on {{channel}}. Open the lead in the Consultant Portal and respond personally.",
    variables: ["channel"],
  },
];

export function findTemplate(id: string): EmmaTemplate | undefined {
  return EMMA_TEMPLATES.find((t) => t.id === id);
}
