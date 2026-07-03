import type { Prospect, Track } from "./types";
import { PRICING, PROMO_DISCOUNT, STANDARD_TRACK_LANDING } from "./types";

const WHATSAPP_NUMBER = process.env.VANTAGE_WHATSAPP_NUMBER || "+27600132533";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vantagestack.co.za";
const CALENDAR_URL = process.env.CALENDAR_BOOKING_URL || "https://cal.com/vantagestack/discovery";

interface DraftResult {
  message_text: string;
  cta_type: string;
  cta_url: string;
}

const PAIN_RESPONSES: Record<string, { empathy: string; value: string; cta_hint: string }> = {
  missed_calls: {
    empathy: "I hear you — missing calls is the fastest way to lose business you've already earned. Studies show 42% of calls to SA SMBs go unanswered, and most of those callers never try again.",
    value: "There's a way to have every call answered 24/7 by an AI receptionist that sounds completely natural, qualifies the lead, and books them straight into your calendar.",
    cta_hint: "voice agent",
  },
  lead_overflow: {
    empathy: "When enquiries pile up faster than you can respond, the good leads slip through. Research shows 54% of SA business leads never get a follow-up.",
    value: "Automating your lead response — even just the first reply — can recover most of those lost opportunities without adding staff.",
    cta_hint: "lead automation",
  },
  no_website: {
    empathy: "Operating without a website in 2026 means you're invisible to everyone searching online — and that's where 80%+ of buying decisions start.",
    value: "A well-built website doesn't just look good. It works as your 24/7 salesperson, answering questions and capturing leads while you sleep.",
    cta_hint: "website build",
  },
  dead_website: {
    empathy: "Having a website that doesn't generate any business is almost worse than having none — you know the potential is there but it's not working.",
    value: "Usually the fix isn't a redesign — it's adding the right conversion points and follow-up automation so visitors actually become leads.",
    cta_hint: "website optimisation",
  },
  whatsapp_overload: {
    empathy: "WhatsApp is incredible for SA businesses, but when you're buried in messages, response times slip and customers feel ignored.",
    value: "An AI WhatsApp assistant can handle the initial conversation, qualify the lead, and only hand over to you when it matters — saving hours daily.",
    cta_hint: "WhatsApp automation",
  },
  admin_pain: {
    empathy: "Admin tasks eat into the time you should be spending on growing your business. It's the silent killer of SA service businesses.",
    value: "Most of the repetitive admin work — invoicing reminders, follow-ups, scheduling, data entry — can be automated without expensive software or extra hires.",
    cta_hint: "business automation",
  },
  gbp_setup: {
    empathy: "Google Business Profile is the single most underrated free marketing tool for local SA businesses. When it's set up properly, it puts you in front of people actively searching for what you offer.",
    value: "A properly optimised profile with the right categories, photos, and review strategy can dramatically increase your local visibility.",
    cta_hint: "Google Business setup",
  },
  automation_need: {
    empathy: "When you know automation could help but don't know where to start, it's easy to stay stuck doing everything manually.",
    value: "The biggest wins usually come from automating your lead response and follow-up first — that's where most SA businesses lose money.",
    cta_hint: "automation strategy",
  },
  slow_followup: {
    empathy: "Speed to lead is everything. Harvard research shows responding within 5 minutes makes you 100x more likely to close versus waiting 30 minutes.",
    value: "Even a simple automated first-response can bridge that gap while you or your team prepare a proper follow-up.",
    cta_hint: "follow-up automation",
  },
  default: {
    empathy: "Growing a service business in SA right now is tough — there's so much competition and so many things demanding your attention.",
    value: "The businesses pulling ahead are the ones automating their lead response and customer follow-up. It's not about replacing people — it's about freeing them up for work that actually grows revenue.",
    cta_hint: "business growth",
  },
};

function pickResponse(signals: string[]): { empathy: string; value: string; cta_hint: string } {
  for (const sig of signals) {
    if (PAIN_RESPONSES[sig]) return PAIN_RESPONSES[sig];
  }
  return PAIN_RESPONSES.default;
}

function formatPrice(amount: number, discounted: boolean): string {
  const final = discounted ? Math.round(amount * (1 - PROMO_DISCOUNT)) : amount;
  return `R${final.toLocaleString("en-ZA")}`;
}

export function draftReply(prospect: Prospect): DraftResult {
  const { empathy, value, cta_hint } = pickResponse(prospect.intent_signals);
  const isStandard = prospect.track === "standard";
  const landingUrl = isStandard
    ? `${APP_URL}${STANDARD_TRACK_LANDING}`
    : prospect.routed_landing_page
      ? `${APP_URL}${prospect.routed_landing_page}`
      : APP_URL;

  const name = prospect.name ? prospect.name.split(" ")[0] : "";
  const greeting = name ? `Hey ${name}, ` : "";

  let message: string;

  if (isStandard) {
    message = [
      `${greeting}${empathy}`,
      "",
      value,
      "",
      `We're actually running a limited 45% discount on our ${cta_hint} packages right now — bringing the entry point down to ${formatPrice(PRICING.starter.setup, true)} instead of ${formatPrice(PRICING.starter.setup, false)}.`,
      "",
      `Happy to chat if you want — no pressure, just a quick conversation to see if it's a fit:`,
      `📱 WhatsApp: ${WHATSAPP_NUMBER}`,
      `🔗 Or check it out: ${landingUrl}`,
    ].join("\n");
  } else {
    message = [
      `${greeting}${empathy}`,
      "",
      value,
      "",
      `If you'd like to explore this, happy to have a quick no-pressure conversation about your specific situation.`,
      "",
      `📱 WhatsApp: ${WHATSAPP_NUMBER}`,
      `📅 Or book a time: ${CALENDAR_URL}`,
    ].join("\n");
  }

  return {
    message_text: message,
    cta_type: isStandard ? "promo_landing" : "discovery_call",
    cta_url: isStandard ? landingUrl : CALENDAR_URL,
  };
}

export function draftFollowUp(prospect: Prospect, priorMessage: string): DraftResult {
  const name = prospect.name ? prospect.name.split(" ")[0] : "there";
  const isStandard = prospect.track === "standard";

  const message = [
    `Hey ${name} — just circling back on this.`,
    "",
    `Did you get a chance to think about it? No rush at all — just wanted to make sure my message didn't get lost in the noise.`,
    "",
    `If you'd prefer to just have a quick chat to see if it even makes sense for your business, here's my WhatsApp: ${WHATSAPP_NUMBER}`,
    "",
    isStandard ? `The 45% discount offer is still open for now.` : `Happy to answer any questions — completely no-pressure.`,
  ].join("\n");

  return {
    message_text: message,
    cta_type: isStandard ? "promo_followup" : "discovery_followup",
    cta_url: isStandard ? `${APP_URL}${STANDARD_TRACK_LANDING}` : CALENDAR_URL,
  };
}
