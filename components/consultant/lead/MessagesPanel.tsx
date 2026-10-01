"use client";

import { MessageSquare } from "lucide-react";
import { formatSastDateTime } from "../../../lib/consultant/client/format";
import { isInboundSource, type EmmaMessage, type EmmaMessageStatus, type Lead } from "../../../lib/consultant/types";
import { EmptyState, SkeletonList, SURFACE } from "../ui";
import { cx } from "../utils";
import { useLeadMessages } from "../wave2/data";
import { Chip, LoadError, type ChipTone } from "../wave2/parts";
import { asLeadSource } from "./sources";

const STATUS: Record<EmmaMessageStatus, { label: string; tone: ChipTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "neutral" },
  delivered: { label: "Delivered", tone: "progress" },
  read: { label: "Read", tone: "progress" },
  failed: { label: "Failed — retrying", tone: "risk" },
  dead: { label: "Not delivered", tone: "risk" },
  skipped: { label: "Skipped", tone: "neutral" },
};

/** "demo_reminder_24h" → "Demo reminder 24h". Template names only — never message bodies. */
function templateLabel(t: string): string {
  const s = t.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Message";
}

/** Emma's WhatsApp / SMS history for this clinic (lead owner or manager). */
export function MessagesPanel({ lead }: { lead: Lead }) {
  const msgs = useLeadMessages(lead.id);
  const list = [...(msgs.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const blocked =
    lead.messagingConsent === "opted_out" ||
    (lead.messagingConsent !== "opted_in" && !isInboundSource(asLeadSource(lead.source)));

  return (
    <section aria-labelledby="emma-h">
      <h2 id="emma-h" className="mb-2 font-heading text-sm font-medium uppercase tracking-[0.14em] text-[--cp-muted]">
        Emma messages
      </h2>
      <div aria-live="polite">
        {msgs.loading ? (
          <SkeletonList rows={2} rowClass="h-[64px]" />
        ) : msgs.error && !msgs.data ? (
          <LoadError error={msgs.error} onRetry={() => void msgs.refresh()} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No messages yet"
            body={
              lead.messagingConsent === "opted_out"
                ? "This clinic opted out — Emma won't message them."
                : blocked
                  ? "Emma can message this clinic once they agree on a call (tick it in the wrap-up)."
                  : "Emma's follow-ups will show here as they go out."
            }
          />
        ) : (
          <ul className="space-y-2">
            {list.map((m) => (
              <MessageRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MessageRow({ m }: { m: EmmaMessage }) {
  const st = STATUS[m.status];
  return (
    <li className={cx(SURFACE, "flex items-start gap-3 p-3")}>
      <MessageSquare size={16} aria-hidden className="mt-0.5 shrink-0 text-[--cp-muted]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[--cp-text]">{templateLabel(m.template)}</p>
        <p className="text-xs text-[--cp-muted]">
          {m.channel === "whatsapp" ? "WhatsApp" : "SMS"} · to {m.audience === "lead" ? "clinic" : m.audience} ·{" "}
          {formatSastDateTime(m.sentAt ?? m.createdAt)}
          {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
        </p>
        {m.lastError && (m.status === "failed" || m.status === "dead") && <p className="mt-0.5 text-xs text-[--cp-risk]">{m.lastError}</p>}
      </div>
      <Chip tone={st.tone}>{st.label}</Chip>
    </li>
  );
}
