"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSystemHealth } from "../../../hooks/consultant/useSystemHealth";
import { formatSastDateTime, formatSastTime } from "../../../lib/consultant/client/format";
import type { SystemHealth } from "../../../lib/consultant/types";
import type { DeadLetter } from "../wave2/data";
import { Button, EmptyState, SectionTitle, Skeleton, SkeletonList, SURFACE } from "../ui";
import { cx, describeError, timeAgo } from "../utils";
import { Chip, LoadError, num, type ChipTone } from "../wave2/parts";

type Tile = { title: string; state: { label: string; tone: ChipTone }; lines: string[] };

const OK = { label: "OK", tone: "progress" as const };
const OFF = { label: "Not configured", tone: "neutral" as const };
const ISSUE = (label: string) => ({ label, tone: "risk" as const });

function last(iso: string | null): string {
  return iso ? `Last delivery ${timeAgo(iso)}` : "No deliveries yet";
}

/** Plain-language tiles; red only when something needs a human. */
function tiles(h: SystemHealth): Tile[] {
  return [
    {
      title: "Database",
      state: h.database.ok ? OK : ISSUE("Down"),
      lines: [h.database.latencyMs != null ? `${h.database.latencyMs} ms` : "No response"],
    },
    { title: "Twilio (calls + WhatsApp)", state: h.twilio.configured ? OK : OFF, lines: [] },
    { title: "Anthropic (Coach Alex)", state: h.anthropic.configured ? OK : OFF, lines: [] },
    {
      title: "n8n deliveries",
      state: !h.n8n.configured ? OFF : h.n8n.dead > 0 ? ISSUE(`${h.n8n.dead} dead`) : OK,
      lines: h.n8n.configured ? [last(h.n8n.lastDeliveryAt), `${num(h.n8n.pending)} pending`] : [],
    },
    {
      title: "EMMA (owner updates)",
      state: !h.emmaOwner.configured ? OFF : h.emmaOwner.dead > 0 ? ISSUE(`${h.emmaOwner.dead} dead`) : OK,
      lines: h.emmaOwner.configured ? [last(h.emmaOwner.lastDeliveryAt), `${num(h.emmaOwner.pending)} pending`] : [],
    },
    {
      title: "Emma messages",
      state: h.emmaMessages.dead > 0 ? ISSUE(`${h.emmaMessages.dead} dead`) : h.emmaMessages.failed24h > 0 ? ISSUE(`${h.emmaMessages.failed24h} failed`) : OK,
      lines: [`${num(h.emmaMessages.queued)} queued`, `${num(h.emmaMessages.failed24h)} failed in 24h`],
    },
    {
      title: "Calendars",
      state: h.calendars.errors > 0 ? ISSUE(`${h.calendars.errors} errors`) : OK,
      lines: [`${num(h.calendars.connected)} connected`],
    },
    {
      title: "Call summaries",
      state: h.summaries.failed > 0 ? ISSUE(`${h.summaries.failed} failed`) : OK,
      lines: [`${num(h.summaries.pending)} pending`],
    },
  ];
}

/** Systems & Operations: platform health + the dead-letter queue with retry. */
export function SystemsView() {
  const health = useSystemHealth();
  const dead = health.deadLetters;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = async (d: DeadLetter) => {
    setBusy(`${d.kind}:${d.id}`);
    setError(null);
    try {
      await health.retry(d.kind, d.id);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="health-h">
        <SectionTitle
          aside={
            health.data && (
              <span className="flex items-center gap-2 text-xs text-[--cp-muted]">
                Checked {formatSastTime(health.data.checkedAt)}
                <Button variant="ghost" className="px-3" onClick={() => void health.refresh()} aria-label="Refresh health">
                  <RefreshCw size={15} aria-hidden />
                </Button>
              </span>
            )
          }
        >
          <span id="health-h">Health</span>
        </SectionTitle>
        <div aria-live="polite">
          {health.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading health">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[112px] rounded-2xl" />
              ))}
            </div>
          ) : health.error && !health.data ? (
            <LoadError error={health.error} onRetry={() => void health.refresh()} />
          ) : health.data ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles(health.data).map((t) => (
                <li key={t.title} className={cx(SURFACE, "min-h-[112px] p-4")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[--cp-text]">{t.title}</p>
                    <Chip tone={t.state.tone}>{t.state.label}</Chip>
                  </div>
                  {t.lines.map((l) => (
                    <p key={l} className="mt-1 text-xs text-[--cp-muted]">
                      {l}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="dead-h">
        <SectionTitle>
          <span id="dead-h">Dead letters</span>
        </SectionTitle>
        <p className="mb-3 text-sm text-[--cp-muted]">Events and Emma messages that ran out of retries. Nothing is dropped silently — retry once the cause is fixed.</p>
        <div aria-live="polite">
          {error && (
            <p role="alert" className="mb-2 text-sm text-[--cp-risk]">
              {error}
            </p>
          )}
          {dead.loading ? (
            <SkeletonList rows={3} rowClass="h-[72px]" />
          ) : dead.error && !dead.data ? (
            <LoadError error={dead.error} onRetry={() => void dead.refresh()} />
          ) : (dead.data ?? []).length === 0 ? (
            <EmptyState title="Nothing stuck" body="Every event and message has been delivered or is still retrying." />
          ) : (
            <ul className="space-y-2">
              {(dead.data ?? []).map((d) => (
                <li key={`${d.kind}:${d.id}`} className={cx(SURFACE, "flex flex-wrap items-center gap-3 p-3")}>
                  <Chip tone={d.kind === "event" ? "info" : "neutral"}>{d.kind === "event" ? "Event" : "Message"}</Chip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[--cp-text]">
                      {d.type ?? d.id}
                      {d.target ? <span className="font-normal text-[--cp-muted]"> → {d.target}</span> : null}
                    </p>
                    <p className="truncate text-xs text-[--cp-muted]">
                      {d.attempts != null ? `${d.attempts} attempts` : ""}
                      {d.createdAt ? ` · ${formatSastDateTime(d.createdAt)}` : ""}
                      {d.lastError ? ` · ${d.lastError}` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" disabled={busy === `${d.kind}:${d.id}`} onClick={() => void retry(d)}>
                    <RefreshCw size={15} aria-hidden /> {busy === `${d.kind}:${d.id}` ? "Retrying…" : "Retry"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
