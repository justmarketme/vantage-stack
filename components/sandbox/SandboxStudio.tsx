"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { Loader2, Mic, MessageSquare, Pause, Play, RotateCcw, Send } from "lucide-react";
import {
  DEMO_PERSONAS,
  DEFAULT_VARIABLES,
  buildFirstMessage,
  buildPrompt,
  elevenLabsSandbox,
  ultravoxSandbox,
  type DemoPersona,
  type DemoVariables,
} from "../../lib/sandbox/config";

/**
 * Sandbox Studio — the internal rehearsal surface at /sandbox.
 *
 * Laid out like the CRM "Configure Agent" drawer (persona/prompt/settings ·
 * voice · test), with one hard difference: NOTHING here is ever saved to
 * ElevenLabs. Every choice is a per-session override sent with startSession()
 * to the separate sandbox agent from `elevenLabsSandbox()`, which has no
 * production fallback. The drawer's Save/PATCH paths target the live Isabel
 * agent and are deliberately not reused.
 */

type Tab = "persona" | "prompt" | "settings";
type Mode = "voice" | "text";
type Line = { id: number; role: "user" | "agent"; text: string };

type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
  public_owner_id?: string;
  labels?: Record<string, string>;
};

const MAX_CALL_SECONDS = 300;
const DAILY_CALL_LIMIT = 50;

// ─── Small pieces ─────────────────────────────────────────────────────────────

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
      <code className="mt-2 inline-block rounded bg-black/40 px-2 py-1 text-[11px] text-textMuted">{envVar}</code>
    </div>
  );
}

function ColumnHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-white/[0.07] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-textMuted">{title}</p>
      {sub && <div className="mt-0.5 truncate text-sm font-medium text-textPrimary">{sub}</div>}
    </div>
  );
}

// ─── Left: Persona / Prompt / Settings ────────────────────────────────────────

function PersonaTab({
  persona,
  vars,
  locked,
  onPersona,
  onVar,
}: {
  persona: DemoPersona;
  vars: DemoVariables;
  locked: boolean;
  onPersona: (p: DemoPersona) => void;
  onVar: <K extends keyof DemoVariables>(k: K, v: DemoVariables[K]) => void;
}) {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="vs-section-heading">Persona</p>
        <div className="mt-3 space-y-2">
          {DEMO_PERSONAS.map((p) => {
            const active = p.id === persona.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPersona(p)}
                disabled={locked}
                aria-pressed={active}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 disabled:opacity-50",
                  active ? "border-accent/60 bg-accent/[0.07]" : "border-white/10 bg-white/[0.015] hover:border-white/25",
                ].join(" ")}
              >
                <p className="text-sm font-medium">{p.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-textMuted">{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="vs-section-heading">The prospect&rsquo;s details</p>
        <p className="mb-3 text-xs text-textMuted">These go into the prompt and the opening line.</p>
        <div className="space-y-3">
          {(
            [
              ["businessName", "Business name"],
              ["city", "City"],
              ["callerName", "Caller's name"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`sb-${key}`} className="block text-xs text-textMuted">
                {label}
              </label>
              <input
                id={`sb-${key}`}
                className="vs-input mt-1"
                value={vars[key]}
                disabled={locked}
                onChange={(e) => onVar(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptTab({
  prompt,
  firstMessage,
  isCustom,
  locked,
  onPrompt,
  onFirstMessage,
  onReset,
}: {
  prompt: string;
  firstMessage: string;
  isCustom: boolean;
  locked: boolean;
  onPrompt: (v: string) => void;
  onFirstMessage: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={[
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
            isCustom ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-white/10 text-textMuted",
          ].join(" ")}
        >
          {isCustom ? "Custom — persona changes no longer apply" : "From persona"}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!isCustom || locked}
          className="inline-flex items-center gap-1.5 text-xs text-textMuted hover:text-textPrimary disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw size={12} /> Reset to persona
        </button>
      </div>

      <div>
        <label htmlFor="sb-first" className="block text-xs text-textMuted">
          First message
        </label>
        <textarea
          id="sb-first"
          rows={2}
          value={firstMessage}
          disabled={locked}
          onChange={(e) => onFirstMessage(e.target.value)}
          className="vs-input mt-1 resize-y"
        />
      </div>

      <div>
        <label htmlFor="sb-prompt" className="block text-xs text-textMuted">
          System prompt <span className="text-textMuted/70">— exactly what will be sent</span>
        </label>
        <textarea
          id="sb-prompt"
          rows={16}
          value={prompt}
          disabled={locked}
          onChange={(e) => onPrompt(e.target.value)}
          className="vs-input mt-1 resize-y font-mono text-[12px] leading-relaxed"
        />
      </div>
    </div>
  );
}

function SettingsTab({ agentId }: { agentId: string | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Sandbox agent", agentId ? <code className="break-all text-[11px]">{agentId}</code> : "Not configured"],
    ["Max call length", `${MAX_CALL_SECONDS} s per call`],
    ["Daily limit", `${DAILY_CALL_LIMIT} calls per day`],
    ["End call", "Enabled (system tool)"],
    ["Overrides used", "System prompt · First message · Voice · Text only"],
  ];
  return (
    <div className="space-y-4 p-4">
      <dl className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <dt className="shrink-0 text-xs text-textMuted">{k}</dt>
            <dd className="text-xs text-textPrimary sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-textMuted">
        Read-only. These live on the sandbox agent in ElevenLabs; this page never changes them. Everything
        you pick here is sent as a per-session override and forgotten when the session ends.
      </p>
      <p className="text-xs leading-relaxed text-textMuted">
        No Knowledge or Phone tabs: knowledge bases can&rsquo;t be overridden per session, and phone calls
        are real calls.
      </p>
    </div>
  );
}

// ─── Middle: Voice ────────────────────────────────────────────────────────────

function VoicePanel({
  selected,
  locked,
  onSelect,
}: {
  selected: Voice | null;
  locked: boolean;
  onSelect: (v: Voice | null) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/elevenlabs/voices?scope=account")
      .then(async (r) => {
        if (r.status === 401) throw new Error("Session expired — sign in to the CRM again.");
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : `Voices failed (${r.status})`);
        // Library voices (public_owner_id) can't be used as a session override
        // without first being added to the account — which this page never does.
        const usable = ((d.voices ?? []) as Voice[]).filter((v) => !v.public_owner_id);
        if (!cancelled) setVoices(usable);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load voices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, []);

  const preview = (v: Voice) => {
    if (!v.preview_url) return;
    if (playing === v.voice_id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(v.preview_url);
    audioRef.current = audio;
    setPlaying(v.voice_id);
    audio.onended = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? voices.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          Object.values(v.labels ?? {}).some((l) => String(l).toLowerCase().includes(q)),
      )
    : voices;
  const groups: [string, Voice[]][] = [
    ["My voices", filtered.filter((v) => v.category !== "premade")],
    ["ElevenLabs", filtered.filter((v) => v.category === "premade")],
  ];

  const row = (v: Voice | null) => {
    const id = v?.voice_id ?? null;
    const active = (selected?.voice_id ?? null) === id;
    return (
      <div
        key={id ?? "default"}
        className={[
          "flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all",
          active ? "bg-accent/10 text-textPrimary" : "text-textMuted hover:bg-white/[0.04] hover:text-textPrimary",
        ].join(" ")}
      >
        <button
          type="button"
          disabled={locked}
          onClick={() => onSelect(v)}
          aria-pressed={active}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
          <span className={["h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-accent" : "bg-white/20"].join(" ")} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{v ? v.name : "Agent default"}</span>
            <span className="block truncate text-[10px] text-textMuted">
              {v
                ? [v.labels?.accent, v.labels?.gender, v.labels?.age].filter(Boolean).join(" · ")
                : "Whatever voice the sandbox agent is set to"}
            </span>
          </span>
        </button>
        {v?.preview_url && (
          <button
            type="button"
            onClick={() => preview(v)}
            aria-label={playing === v.voice_id ? `Stop ${v.name} preview` : `Preview ${v.name}`}
            className="shrink-0 rounded p-1.5 text-textMuted hover:bg-white/10 hover:text-textPrimary"
          >
            {playing === v.voice_id ? <Pause size={12} className="text-accent" /> : <Play size={12} />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ColumnHeader title="Voice" sub={selected ? selected.name : "Agent default"} />
      <div className="shrink-0 border-b border-white/[0.07] px-3 py-2.5">
        <input
          type="search"
          placeholder="Search voices…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs text-textPrimary outline-none transition-all placeholder:text-textMuted focus:border-accent/40"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-2">{!q && row(null)}</div>
        {loading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-textMuted">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading voices…</span>
          </div>
        ) : loadError ? (
          <p className="mx-3 rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
            {loadError}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-textMuted">No voices match</p>
        ) : (
          groups
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <div key={label}>
                <p className="sticky top-0 bg-background px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-textMuted">
                  {label}
                </p>
                <div className="space-y-0.5 p-2">{list.map((v) => row(v))}</div>
              </div>
            ))
        )}
      </div>
      <p className="shrink-0 border-t border-white/[0.07] px-4 py-2.5 text-[11px] leading-relaxed text-textMuted">
        Sent as a session override only. Requires the Voice override to be enabled on the sandbox agent.
      </p>
    </div>
  );
}

// ─── Right: Test ──────────────────────────────────────────────────────────────

function TestPanel({
  ready,
  mode,
  onMode,
  status,
  isSpeaking,
  lines,
  error,
  businessName,
  onStart,
  onEnd,
  onSend,
}: {
  ready: boolean;
  mode: Mode;
  onMode: (m: Mode) => void;
  status: string;
  isSpeaking: boolean;
  lines: Line[];
  error: string | null;
  businessName: string;
  onStart: () => void;
  onEnd: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const connected = status === "connected";
  const busy = status === "connecting" || status === "disconnecting";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  const send = () => {
    const t = draft.trim();
    if (!t || !connected) return;
    onSend(t);
    setDraft("");
  };

  const statusText = connected
    ? mode === "voice"
      ? isSpeaking
        ? "Speaking…"
        : "Listening — go ahead"
      : isSpeaking
        ? "Replying…"
        : "Connected — type a message"
    : status === "connecting"
      ? "Connecting…"
      : "Not connected";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ColumnHeader
        title="Test"
        sub={
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {connected && isSpeaking && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-accent" : "bg-white/25"}`}
              />
            </span>
            {statusText}
          </span>
        }
      />

      <div className="shrink-0 border-b border-white/[0.07] px-3 py-2.5">
        <div role="radiogroup" aria-label="Session mode" className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1">
          {(
            [
              ["voice", "Voice", Mic],
              ["text", "Text", MessageSquare],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={connected || busy}
              onClick={() => onMode(m)}
              className={[
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all disabled:cursor-not-allowed",
                mode === m ? "bg-accent/15 text-textPrimary" : "text-textMuted hover:text-textPrimary",
              ].join(" ")}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[220px] flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {lines.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-textMuted">
            {ready
              ? connected
                ? "Waiting for the first line…"
                : `Start a session and talk to ${businessName || "the business"} exactly as their customer would.`
              : "Configure the sandbox agent to enable this."}
          </p>
        ) : (
          lines.map((l) => (
            <div key={l.id} className={l.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p
                className={[
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  l.role === "user"
                    ? "rounded-br-sm bg-accent/15 text-textPrimary"
                    : "rounded-bl-sm border border-white/10 bg-white/[0.03] text-textPrimary",
                ].join(" ")}
              >
                {l.text}
              </p>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="mx-3 mb-2 shrink-0 rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="shrink-0 space-y-2 border-t border-white/[0.07] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!connected}
            placeholder={connected ? "Type as the caller…" : "Start a session to type"}
            aria-label="Message to the agent"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-sm text-textPrimary outline-none placeholder:text-textMuted focus:border-accent/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            aria-label="Send"
            className="vs-button-ghost !px-3 disabled:pointer-events-none disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </form>

        {!connected ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!ready || busy}
            className="vs-button-primary w-full justify-center disabled:pointer-events-none disabled:opacity-40"
          >
            {status === "connecting" ? "Connecting…" : mode === "voice" ? "Start voice session" : "Start text session"}
          </button>
        ) : (
          <button type="button" onClick={onEnd} className="vs-button-ghost w-full justify-center">
            End session
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Studio ───────────────────────────────────────────────────────────────────

export function SandboxStudio() {
  const el = useMemo(() => elevenLabsSandbox(), []);
  const uv = useMemo(() => ultravoxSandbox(), []);

  const [tab, setTab] = useState<Tab>("persona");
  const [persona, setPersona] = useState<DemoPersona>(DEMO_PERSONAS[0]);
  const [vars, setVars] = useState<DemoVariables>(DEFAULT_VARIABLES);
  // null = derived from persona + details; a string = operator's custom text,
  // kept until "Reset to persona".
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [customFirst, setCustomFirst] = useState<string | null>(null);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [mode, setMode] = useState<Mode>("voice");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lineId = useRef(0);
  // Text sent with sendUserMessage is shown immediately; if the server echoes
  // it back as a user transcript, skip the duplicate.
  const pendingEcho = useRef<string[]>([]);
  // Read inside SDK callbacks, which may hold the first render's closure.
  const voiceRef = useRef<Voice | null>(null);
  voiceRef.current = voice;

  const addLine = (role: Line["role"], text: string) =>
    setLines((ls) => [...ls, { id: ++lineId.current, role, text }]);

  const conversation = useConversation({
    onMessage: ({ role, message }) => {
      if (!message) return;
      if (role === "user") {
        const i = pendingEcho.current.indexOf(message.trim());
        if (i !== -1) {
          pendingEcho.current.splice(i, 1);
          return;
        }
      }
      addLine(role === "user" ? "user" : "agent", message);
    },
    onError: (e: unknown) =>
      setError(
        typeof e === "string" && e
          ? e
          : voiceRef.current
            ? "The session dropped. If it fails on start, check the Voice override is enabled on the sandbox agent."
            : "The session dropped. Try again.",
      ),
  });
  const { startSession, endSession, sendUserMessage, status, isSpeaking } = conversation;
  const live = status === "connected" || status === "connecting";

  const prompt = customPrompt ?? buildPrompt(persona, vars);
  const firstMessage = customFirst ?? buildFirstMessage(persona, vars);

  const start = async () => {
    if (!el.ready) return;
    setError(null);
    setLines([]);
    pendingEcho.current = [];
    try {
      if (mode === "voice") {
        // Ask for the mic on the operator's click rather than mid-demo.
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      }
      await startSession({
        agentId: el.agentId,
        // Text sessions carry no audio, so they use the plain WebSocket transport.
        connectionType: mode === "voice" ? "webrtc" : "websocket",
        overrides: {
          agent: {
            prompt: { prompt },
            firstMessage,
          },
          ...(voice ? { tts: { voiceId: voice.voice_id } } : {}),
          ...(mode === "text" ? { conversation: { textOnly: true } } : {}),
        },
      });
    } catch {
      setError(
        mode === "voice"
          ? "Could not start the session — check the mic permission and the sandbox agent id."
          : "Could not start the text session — check the sandbox agent id and its Text-only override.",
      );
    }
  };

  const send = (text: string) => {
    pendingEcho.current.push(text);
    addLine("user", text);
    sendUserMessage(text);
  };

  const setVar = <K extends keyof DemoVariables>(k: K, v: DemoVariables[K]) => setVars((s) => ({ ...s, [k]: v }));

  const tabs: [Tab, string][] = [
    ["persona", "Persona"],
    ["prompt", "Prompt"],
    ["settings", "Settings"],
  ];

  return (
    <div className="space-y-6">
      <div className="vs-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="vs-section-heading !mb-1">Environment</p>
            <p className="font-heading text-lg">Sandbox — production agent untouched</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={el.ready} label={el.ready ? "ElevenLabs ready" : "ElevenLabs not set up"} />
            <StatusPill ok={uv.ready} label={uv.ready ? "Ultravox ready" : "Ultravox not wired"} />
          </div>
        </div>
        {(!el.ready || !uv.ready) && (
          <div className="mt-4 space-y-3">
            {!el.ready && <NotConfigured reason={el.reason} envVar={el.envVar} />}
            {!uv.ready && <NotConfigured reason={uv.reason} envVar={uv.envVar} />}
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-textMuted">
          Every setting below is a per-session override on a dedicated sandbox agent. Nothing is saved to
          ElevenLabs, and there is no fallback to the production agent.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
        {/* Left */}
        <section className="vs-card flex min-h-0 flex-col !p-0 lg:h-[720px]" aria-label="Agent setup">
          <div role="tablist" aria-label="Setup" className="flex shrink-0 border-b border-white/[0.07]">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`sb-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`sb-panel-${id}`}
                onClick={() => setTab(id)}
                className={[
                  "flex-1 border-b-2 px-3 py-3 text-xs font-medium uppercase tracking-widest transition-colors",
                  tab === id ? "border-accent text-textPrimary" : "border-transparent text-textMuted hover:text-textPrimary",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`sb-panel-${tab}`}
            aria-labelledby={`sb-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {tab === "persona" && (
              <PersonaTab persona={persona} vars={vars} locked={live} onPersona={setPersona} onVar={setVar} />
            )}
            {tab === "prompt" && (
              <PromptTab
                prompt={prompt}
                firstMessage={firstMessage}
                isCustom={customPrompt !== null || customFirst !== null}
                locked={live}
                onPrompt={setCustomPrompt}
                onFirstMessage={setCustomFirst}
                onReset={() => {
                  setCustomPrompt(null);
                  setCustomFirst(null);
                }}
              />
            )}
            {tab === "settings" && <SettingsTab agentId={el.ready ? el.agentId : null} />}
          </div>
          {live && (
            <p className="shrink-0 border-t border-white/[0.07] px-4 py-2 text-[11px] text-textMuted">
              Locked while a session is running — end it to change setup.
            </p>
          )}
        </section>

        {/* Middle */}
        <section className="vs-card flex h-[480px] min-h-0 flex-col !p-0 lg:h-[720px]" aria-label="Voice">
          <VoicePanel selected={voice} locked={live} onSelect={setVoice} />
        </section>

        {/* Right */}
        <section className="vs-card flex h-[560px] min-h-0 flex-col !p-0 lg:h-[720px]" aria-label="Test">
          <TestPanel
            ready={el.ready}
            mode={mode}
            onMode={setMode}
            status={status}
            isSpeaking={isSpeaking}
            lines={lines}
            error={error}
            businessName={vars.businessName}
            onStart={() => void start()}
            onEnd={() => void endSession()}
            onSend={send}
          />
        </section>
      </div>

      <p className="text-xs leading-relaxed text-textMuted">
        Nothing said here is stored against a client record, and no production automation is triggered.
        This is a rehearsal surface, not a live channel.
      </p>
    </div>
  );
}
