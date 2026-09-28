"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Inbox, Info, Send, TriangleAlert } from "lucide-react";
import type { Channel, Conversation } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useContinuity } from "@/lib/clinic-crm/client/continuity";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { MicButton } from "../ui/MicButton";
import { Skeleton } from "../ui/Skeleton";
import { Textarea } from "../ui/Textarea";
import { cx } from "../ui/cx";
import { BASE } from "./AppShell";
import { errorMessage } from "./errors";
import { fmtStamp, fmtTime, fullName, initials } from "./format";

export function InboxView() {
  const params = useSearchParams();
  const convos = useQuery("conversations", () => api.conversations.list(), { persist: false });
  const [openId, setOpenId] = useState<string | null>(params.get("patient"));
  const list = convos.data ?? [];

  return (
    <div className="cc-page md:h-[calc(100dvh-32px)] md:py-6">
      <div className="grid gap-4 md:h-full md:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label="Conversations" className={cx("cc-card flex min-h-0 flex-col overflow-hidden", openId && "hidden md:flex")}>
          <header className="px-4 pb-3 pt-4">
            <h1 className="text-2xl font-semibold">Inbox</h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {convos.loading && !convos.data ? (
              <div className="flex flex-col gap-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState icon={<Inbox size={26} />} title="No conversations yet">
                WhatsApp and SMS messages from patients appear here. New enquiries get an instant automatic reply.
              </EmptyState>
            ) : (
              <ul role="list">
                {list.map((c) => (
                  <li key={c.patientId}>
                    <ConversationRow c={c} active={c.patientId === openId} onOpen={() => setOpenId(c.patientId)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-label="Conversation" className={cx(
            "cc-card h-[calc(100dvh-var(--cc-tabbar)-6.5rem)] min-h-0 flex-col overflow-hidden md:h-auto",
            openId ? "flex" : "hidden md:flex",
          )}>
          {openId ? (
            <Thread
              key={openId}
              patientId={openId}
              conversation={list.find((c) => c.patientId === openId)}
              onBack={() => setOpenId(null)}
              onActivity={() => convos.refresh()}
            />
          ) : (
            <div className="grid flex-1 place-items-center">
              <EmptyState icon={<Inbox size={26} />} title="Pick a conversation">
                Replies go out on the patient’s preferred channel.
              </EmptyState>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationRow({ c, active, onOpen }: { c: Conversation; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active || undefined}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--cc-surface-2)]"
      style={active ? { background: "var(--cc-accent-soft)" } : undefined}
    >
      <span className="cc-heading grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold cc-surface-2" aria-hidden>
        {initials(c.patientName) || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cx("flex-1 truncate", c.unread ? "font-bold" : "font-semibold")}>{c.patientName}</span>
          <span className="cc-muted shrink-0 text-xs">{fmtStamp(c.lastAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cx("flex-1 truncate text-sm", !c.unread && "cc-muted")}>{c.lastMessage}</span>
          {c.unread > 0 && (
            <span className="cc-nav-dot cc-num" data-inline aria-label={`${c.unread} unread`}>
              {c.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Thread({
  patientId,
  conversation,
  onBack,
  onActivity,
}: {
  patientId: string;
  conversation: Conversation | undefined;
  onBack: () => void;
  onActivity: () => void;
}) {
  const msgs = useQuery(`conversation:${patientId}`, () => api.conversations.get(patientId), { persist: false });
  const patient = useQuery(`patient:${patientId}`, () => api.patients.get(patientId), { persist: false });
  const [draft, setDraft] = useContinuity<string>(`draft:${patientId}`, "");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loaded = Boolean(msgs.data);

  // Opening a thread marks it read server-side; refresh the list's unread counts.
  useEffect(() => {
    if (loaded) onActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs.data?.length]);

  const p = patient.data;
  const name = p ? fullName(p) : conversation?.patientName ?? "Patient";
  const via: Channel = channel ?? p?.preferredChannel ?? "whatsapp";
  const optedOut = Boolean(p?.optedOutAt);
  const windowClosed = via === "whatsapp" && conversation?.windowOpen === false;

  const send = async () => {
    const body = draft.trim();
    if (!body || optedOut) return;
    setSending(true);
    setError(null);
    try {
      await api.messages.send({ patientId, body, channel: via });
      setDraft("");
      msgs.refresh();
      onActivity();
    } catch (e) {
      setError(errorMessage(e, "Message not sent."));
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <header className="flex items-center gap-2 px-2 py-2 md:px-4" style={{ borderBottom: "1px solid var(--cc-border)" }}>
        <Button variant="ghost" iconOnly aria-label="Back to conversations" onClick={onBack} className="md:hidden">
          <ArrowLeft size={20} aria-hidden />
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-lg font-semibold leading-tight">{name}</h2>
          <p className="cc-muted text-xs">{via === "whatsapp" ? "WhatsApp" : "SMS"}</p>
        </div>
        <Link href={`${BASE}/patients/${patientId}`} className="cc-btn cc-btn-ghost cc-btn-sm">
          View record
        </Link>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.loading && !msgs.data ? (
          <>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </>
        ) : (msgs.data ?? []).length === 0 ? (
          <p className="cc-muted m-auto text-sm">No messages yet — say hello.</p>
        ) : (
          (msgs.data ?? []).map((m) => (
            <div key={m.id} className={cx("flex flex-col", m.direction === "out" ? "items-end" : "items-start")}>
              <div className="cc-bubble" data-dir={m.direction}>
                {m.body}
              </div>
              <span className="cc-muted mt-1 px-1 text-[11px]">
                {fmtTime(m.createdAt)}
                {m.automation && " · automated"}
                {m.direction === "out" && m.status === "failed" && <span className="cc-danger-text"> · failed</span>}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3 pt-2" style={{ borderTop: "1px solid var(--cc-border)" }}>
        {optedOut ? (
          <p className="cc-notice" data-tone="danger">
            <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {p?.firstName ?? "This patient"} replied STOP and has opted out of messages. Under POPIA you can’t message them
              until they opt back in — call them instead.
            </span>
          </p>
        ) : (
          windowClosed && (
            <p className="cc-notice">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                WhatsApp 24h window closed — a template will be used.{" "}
                <button type="button" className="font-semibold underline" onClick={() => setChannel("sms")}>
                  Send as SMS instead
                </button>
              </span>
            </p>
          )
        )}
        {channel === "sms" && p?.preferredChannel === "whatsapp" && !optedOut && (
          <p className="cc-muted flex items-center gap-2 text-xs">
            <Badge>SMS</Badge> This reply goes by SMS.
            <button type="button" className="underline" onClick={() => setChannel(null)}>
              Use WhatsApp
            </button>
          </p>
        )}
        {error && (
          <p className="cc-notice" data-tone="danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            label="Reply"
            hideLabel
            rows={2}
            placeholder={optedOut ? "Messaging is blocked" : "Write a reply…"}
            disabled={optedOut}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            wrapperClassName="flex-1"
            className="max-h-40"
          />
          {!optedOut && <MicButton onCommit={(text) => setDraft(draft ? `${draft.trimEnd()} ${text}` : text)} />}
          <Button variant="primary" iconOnly aria-label="Send" loading={sending} disabled={optedOut || !draft.trim()} onClick={send}>
            {!sending && <Send size={18} aria-hidden />}
          </Button>
        </div>
      </div>
    </>
  );
}
