"use client";

import { useMemo, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import {
  DEMO_PERSONAS,
  DEFAULT_VARIABLES,
  buildPrompt,
  elevenLabsSandbox,
  ultravoxSandbox,
  type DemoPersona,
  type DemoVariables,
} from "../../lib/sandbox/config";

/**
 * Live demo sandbox.
 *
 * For consultants running a demo in front of a prospect: pick a persona, drop in
 * the prospect's own business name and city, and talk to the agent as their
 * customer would. The prospect hears their own business answering the phone,
 * which lands far harder than a generic script.
 *
 * Every session here runs against a SEPARATE sandbox agent. If that agent is not
 * configured the controls stay disabled and say why — see lib/sandbox/config.ts
 * for why there is deliberately no fallback to production.
 */

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
        ok ? "border-accent/40 bg-accent/10 text-accent" : "border-amber-400/30 bg-amber-400/10 text-amber-300",
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-accent" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

function NotConfigured({ reason, envVar }: { reason: string; envVar: string }) {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-4 py-3">
      <p className="text-sm leading-relaxed text-amber-200/90">{reason}</p>
      <code className="mt-2 inline-block rounded bg-black/40 px-2 py-1 text-[11px] text-textMuted">
        {envVar}
      </code>
    </div>
  );
}

export function DemoSandbox() {
  const el = useMemo(() => elevenLabsSandbox(), []);
  const uv = useMemo(() => ultravoxSandbox(), []);

  const [persona, setPersona] = useState<DemoPersona>(DEMO_PERSONAS[0]);
  const [vars, setVars] = useState<DemoVariables>(DEFAULT_VARIABLES);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const conversation = useConversation({
    onError: (e: unknown) => setError(typeof e === "string" ? e : "The session dropped. Try again."),
  });
  const { startSession, endSession, status, isSpeaking } = conversation;
  const connected = status === "connected";

  const finalPrompt = useMemo(() => buildPrompt(persona, vars), [persona, vars]);

  const start = async () => {
    if (!el.ready) return;
    setError(null);
    try {
      // Mic permission is requested by the SDK on connect; asking here first
      // means the browser prompt appears on the operator's click rather than
      // mid-demo in front of a prospect.
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      await startSession({
        agentId: el.agentId,
        connectionType: "webrtc",
        overrides: {
          agent: {
            prompt: { prompt: finalPrompt },
            firstMessage: persona.firstMessage,
          },
        },
      });
    } catch {
      setError("Could not start the session — check the mic permission and the sandbox agent id.");
    }
  };

  const set = <K extends keyof DemoVariables>(k: K, v: DemoVariables[K]) =>
    setVars((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-6">
      {/* Provider status — the first thing an operator needs to know. */}
      <div className="vs-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="vs-section-heading !mb-1">Environment</p>
            <p className="font-heading text-lg">Sandbox — production credits untouched</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={el.ready} label={el.ready ? "ElevenLabs ready" : "ElevenLabs not set up"} />
            <StatusPill ok={uv.ready} label={uv.ready ? "Ultravox ready" : "Ultravox not wired"} />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {!el.ready && <NotConfigured reason={el.reason} envVar={el.envVar} />}
          {!uv.ready && <NotConfigured reason={uv.reason} envVar={uv.envVar} />}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-textMuted">
          Sessions run against a dedicated sandbox agent. There is no fallback to the production
          agent — if the sandbox is not configured, nothing connects, rather than quietly spending
          live minutes.
        </p>
      </div>

      <div className="vs-grid !gap-6">
        {/* ── Setup ─────────────────────────────────────────── */}
        <div className="vs-card">
          <p className="vs-section-heading">1 · Choose the persona</p>
          <div className="mt-3 space-y-2">
            {DEMO_PERSONAS.map((p) => {
              const active = p.id === persona.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersona(p)}
                  disabled={connected}
                  aria-pressed={active}
                  className={[
                    "w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 disabled:opacity-50",
                    active
                      ? "border-accent/60 bg-accent/[0.07]"
                      : "border-white/10 bg-white/[0.015] hover:border-white/25",
                  ].join(" ")}
                >
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-textMuted">{p.blurb}</p>
                </button>
              );
            })}
          </div>

          <p className="vs-section-heading mt-7">2 · The prospect&rsquo;s details</p>
          <p className="mb-3 text-xs text-textMuted">
            These go into the prompt, so the agent answers as their business.
          </p>
          <div className="space-y-3">
            {([
              ["businessName", "Business name"],
              ["city", "City"],
              ["callerName", "Caller's name"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="block text-xs text-textMuted">
                  {label}
                </label>
                <input
                  id={key}
                  className="vs-input mt-1"
                  value={vars[key]}
                  disabled={connected}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            aria-expanded={showPrompt}
            className="mt-5 text-xs text-textMuted underline-offset-4 hover:text-textPrimary hover:underline"
          >
            {showPrompt ? "Hide" : "Preview"} the exact prompt that will be sent
          </button>
          {showPrompt && (
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-textMuted">
              {finalPrompt}
            </pre>
          )}
        </div>

        {/* ── Run ───────────────────────────────────────────── */}
        <div className="vs-card flex flex-col">
          <p className="vs-section-heading">3 · Run the demo</p>

          <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-6 py-10 text-center">
            <span className="relative flex h-3 w-3">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${connected ? "bg-accent" : "bg-white/25"}`}
              />
            </span>

            <p className="mt-4 font-heading text-lg">
              {connected ? (isSpeaking ? "Speaking…" : "Listening — go ahead") : "Not connected"}
            </p>
            <p className="mt-1 text-xs text-textMuted">
              {connected
                ? `Answering as ${vars.businessName || "the business"}`
                : el.ready
                  ? "Talk to it exactly as their customer would."
                  : "Configure the sandbox agent to enable this."}
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              {!connected ? (
                <button
                  type="button"
                  onClick={start}
                  disabled={!el.ready || status === "connecting"}
                  className="vs-button-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  {status === "connecting" ? "Connecting…" : "Start demo"}
                </button>
              ) : (
                <button type="button" onClick={() => void endSession()} className="vs-button-ghost">
                  End demo
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-textMuted">
            Nothing said here is stored against a client record, and no production automation is
            triggered. This is a rehearsal surface, not a live channel.
          </p>
        </div>
      </div>
    </div>
  );
}
