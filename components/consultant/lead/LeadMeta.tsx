"use client";

import { MessageCircle, Search } from "lucide-react";
import { isInboundSource, type Lead } from "../../../lib/consultant/types";
import { Chip } from "../wave2/parts";
import { asLeadSource, LEAD_SOURCE_LABELS, SOCIAL_PLATFORM_LABELS } from "./sources";

/**
 * Provenance + messaging consent for a lead (Decision 8, POPIA s.18 / s.69).
 * Consultants see at a glance where the clinic came from — so they can say so
 * on the call — and whether Emma is allowed to WhatsApp them.
 */
export function LeadMeta({ lead }: { lead: Lead }) {
  const source = asLeadSource(lead.source);
  const inbound = isInboundSource(source);
  const consent = lead.messagingConsent;

  // Inbound leads contacted us, so follow-ups on their enquiry are covered unless they opted out.
  const consentLabel =
    consent === "opted_out"
      ? "WhatsApp: opted out"
      : consent === "opted_in"
        ? "WhatsApp: agreed"
        : inbound
          ? "WhatsApp: covered (they contacted us)"
          : "WhatsApp: not yet";
  const consentTone = consent === "opted_out" ? "risk" : consent === "opted_in" || inbound ? "progress" : "neutral";

  const detail =
    source === "referral" && lead.referredBy
      ? `Referred by ${lead.referredBy}`
      : source === "social_inbound" && (lead.socialPlatform || lead.socialHandle)
        ? [lead.socialPlatform ? SOCIAL_PLATFORM_LABELS[lead.socialPlatform] : null, lead.socialHandle].filter(Boolean).join(" · ")
        : null;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={consentTone}>
          <MessageCircle size={12} aria-hidden />
          {consentLabel}
        </Chip>
        {source && <Chip>{LEAD_SOURCE_LABELS[source]}</Chip>}
        {!source && lead.source && <Chip>{lead.source}</Chip>}
      </div>
      {detail && <p className="text-xs text-[--cp-muted]">{detail}</p>}
      {source === "public_scrape" && (
        <p className="flex items-center gap-1.5 text-xs text-[--cp-muted]">
          <Search size={12} aria-hidden />
          Found via public listing — tell them where you found their details when you open the call.
        </p>
      )}
      {consent !== "opted_in" && consent !== "opted_out" && !inbound && (
        <p className="text-xs text-[--cp-muted]">Get their OK on the call before Emma messages them.</p>
      )}
    </div>
  );
}
