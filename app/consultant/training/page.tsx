"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Lock } from "lucide-react";
import { useTraining } from "../../../hooks/consultant/useTraining";
import type { TrainingModule } from "../../../lib/consultant/types";
import { Button, PageHeader, Skeleton, SURFACE } from "../../../components/consultant/ui";
import { cx, describeError, FOCUS } from "../../../components/consultant/utils";
import { LoadError, ProgressBar } from "../../../components/consultant/wave2/parts";

/**
 * Sales Readiness & Training: six 8-second clips, unlocked one after another
 * (the server enforces the order). The next module is open by default — one
 * obvious thing to do (Fogg: Ability + Prompt).
 */
export default function TrainingPage() {
  const training = useTraining();
  const list = [...(training.data ?? [])].sort((a, b) => a.order - b.order);
  const next = list.find((m) => !m.completedAt && !m.locked);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Open the next module once the list arrives (and after each completion).
  useEffect(() => {
    if (next) setOpenId(next.id);
  }, [next?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = list.filter((m) => m.completedAt).length;

  const complete = async (m: TrainingModule) => {
    setSaving(m.id);
    setError(null);
    try {
      await training.complete(m.id);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Training" subtitle="Six 8-second clips. Watch one, mark it done, the next unlocks." />

      {training.loading ? (
        <div className="space-y-3" role="status" aria-label="Loading training">
          <Skeleton className="h-[64px] rounded-2xl" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : training.error && !training.data ? (
        <LoadError error={training.error} onRetry={() => void training.refresh()} />
      ) : (
        <>
          <div className={cx(SURFACE, "p-4")} aria-live="polite">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-[--cp-text]">{done === list.length && list.length > 0 ? "All modules complete" : "Your progress"}</span>
              <span className="tabular-nums text-[--cp-muted]">
                {done} of {list.length}
              </span>
            </div>
            <ProgressBar value={training.progress} label="Training progress" />
          </div>

          <div aria-live="assertive">
            {error && (
              <p role="alert" className="text-sm text-[--cp-risk]">
                {error}
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {list.map((m) => {
              const isOpen = openId === m.id && !m.locked;
              const prev = list.find((x) => x.order === m.order - 1);
              return (
                <li key={m.id} className={cx(SURFACE, m.locked && "opacity-70")}>
                  <button
                    type="button"
                    disabled={m.locked}
                    aria-expanded={m.locked ? undefined : isOpen}
                    aria-controls={`mod-${m.id}`}
                    onClick={() => setOpenId(isOpen ? null : m.id)}
                    className={cx("flex min-h-[76px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left disabled:cursor-not-allowed", FOCUS)}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        m.completedAt ? "bg-[--cp-progress-soft] text-[--cp-progress]" : m.locked ? "bg-[--cp-surface-2] text-[--cp-muted]" : "bg-[--cp-accent-soft] text-[--cp-accent-text]",
                      )}
                    >
                      {m.completedAt ? <Check size={18} /> : m.locked ? <Lock size={16} /> : m.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[--cp-text]">{m.title}</span>
                      <span className="block truncate text-sm text-[--cp-muted]">
                        {m.locked && prev ? `Finish “${prev.title}” first` : `${m.durationSec}s · ${m.completedAt ? "Done" : "Up next"}`}
                      </span>
                    </span>
                    <span className="sr-only">{m.completedAt ? "Completed" : m.locked ? "Locked" : "Not done yet"}</span>
                  </button>
                  {isOpen && (
                    <div id={`mod-${m.id}`} className="space-y-3 px-4 pb-4">
                      <p className="text-sm text-[--cp-muted]">{m.summary}</p>
                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[--cp-surface-2]">
                        {m.videoUrl ? (
                          <video className="absolute inset-0 h-full w-full" src={m.videoUrl} playsInline controls preload="metadata" aria-label={`${m.title} clip`} />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[--cp-muted]">
                            <Clapperboard size={28} aria-hidden />
                            <p className="text-sm">Clip coming soon</p>
                          </div>
                        )}
                      </div>
                      {!m.completedAt && (
                        <Button variant="primary" size="lg" className="w-full sm:w-auto" disabled={saving === m.id} onClick={() => void complete(m)}>
                          {saving === m.id ? "Saving…" : (
                            <>
                              <Check size={16} aria-hidden /> Mark as done
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
