"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import { createBlueprintClientTools, BLUEPRINT_TOOL_EVENT } from "../lib/blueprint/voice-tools";
import { ISABEL_BLUEPRINT_FIRST_MESSAGE } from "../lib/isabel/persona";

const AGENT_ID =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "YOUR_AGENT_ID";

// Debug: log the agent ID to verify it's loading
if (typeof window !== 'undefined') {
  console.log('📌 Isabel Agent ID loaded:', AGENT_ID === "YOUR_AGENT_ID" ? "⚠️ FALLBACK (missing env var)" : "✅ From environment");
  console.log('Agent ID value:', AGENT_ID.substring(0, 10) + '...');
}

/** Isabel avatar — place your photo at public/images/isabel-avatar.png */
const ISABEL_AVATAR = "/images/isabel-avatar.jpg";

type Message = { role: "user" | "assistant"; content: string };

type BlueprintData = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  preferredTime: string;
  industry: string;
};

const EMPTY_BLUEPRINT: BlueprintData = {
  name: "", email: "", phone: "", whatsapp: "", preferredTime: "", industry: "",
};

/** Extract structured data from conversation — context-aware based on what Isabel just asked */
function extractFromMessages(messages: Message[]): Partial<BlueprintData> {
  const allText = messages.map((m) => m.content).join(" ");
  const data: Partial<BlueprintData> = {};

  // --- Email: appears anywhere in any message ---
  const emailMatch = allText.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) data.email = emailMatch[0].toLowerCase();

  // --- Phone numbers anywhere ---
  const allPhoneMatches = allText.match(/(?:\+27|27|0)[6-8]\d[\s\-]?\d{3}[\s\-]?\d{4}/g);
  if (allPhoneMatches) {
    data.phone = allPhoneMatches[0].replace(/[\s\-]/g, "");
    if (allPhoneMatches.length >= 2) {
      data.whatsapp = allPhoneMatches[1].replace(/[\s\-]/g, "");
    }
  }

  // --- WhatsApp same as cell ---
  if (data.phone && /same|yes.*whatsapp|whatsapp.*same|it['']?s the same|same number/i.test(allText)) {
    data.whatsapp = data.phone;
  }

  // --- Time preference ---
  if (/\bmorning\b/i.test(allText)) data.preferredTime = "Morning";
  else if (/\bafternoon\b/i.test(allText)) data.preferredTime = "Afternoon";

  // --- Context-aware name extraction ---
  // Look for Isabel asking for a name, then grab the next user reply
  const nameAskPatterns = /name|call you|who (am i|are you)|didn'?t catch your name|what'?s your name/i;
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (msg.role === "assistant" && nameAskPatterns.test(msg.content) && next.role === "user") {
      const reply = next.content.trim();
      const words = reply.split(/\s+/);
      // Short reply after name question = likely their name
      if (words.length <= 5 && !/\b(my|the|it|is|are|i|we)\b/i.test(reply)) {
        data.name = reply;
        break;
      }
      // Handle "I'm John" / "My name is Sarah"
      const nameMatch = reply.match(/(?:i'?m|my name is|it'?s|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (nameMatch) { data.name = nameMatch[1]; break; }
    }
  }

  // --- Context-aware email confirmation: Isabel spells it back ---
  // "your email is john@example.com, right?" — extract from assistant message
  const emailConfirmMatch = allText.match(/email is\s+([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/i);
  if (emailConfirmMatch) data.email = emailConfirmMatch[1].toLowerCase();

  // --- Industry: look for user mentioning their business type ---
  const industries = ["e-commerce", "retail", "real estate", "construction", "healthcare", "technology", "financial", "hospitality", "education", "marketing", "food", "restaurant"];
  for (const ind of industries) {
    if (new RegExp(ind, "i").test(allText)) {
      data.industry = ind.charAt(0).toUpperCase() + ind.slice(1);
      break;
    }
  }

  return data;
}

/** Isabel emits %%BOOK name="..." email="..."%% when ready to book. On the
 *  website we open the existing Cal.com embed (prefilled) and never show it. */
function parseBookDirective(text: string): { name: string; email: string } | null {
  const m = text.match(/%%\s*BOOK\b([^%]*)%%/i);
  if (!m) return null;
  const inner = m[1] || "";
  return {
    name: inner.match(/name\s*=\s*"([^"]*)"/i)?.[1]?.trim() || "",
    email: inner.match(/email\s*=\s*"([^"]*)"/i)?.[1]?.trim() || "",
  };
}

function stripBookDirective(text: string): string {
  return text.replace(/%%[^%]*%%/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Isabel emits %%GOTO_BLUEPRINT%% to take a website visitor to the guided
 *  /blueprint page. (On WhatsApp the directive is stripped and never sent.) */
function hasGotoBlueprint(text: string): boolean {
  return /%%\s*GOTO_BLUEPRINT\b[^%]*%%/i.test(text);
}

/** Open the Cal.com Discovery Call booking, prefilled. Falls back to a new tab. */
function openCalBooking(name: string, email: string) {
  const w = window as unknown as { Cal?: (...a: unknown[]) => void };
  try {
    if (typeof w.Cal === "function") {
      w.Cal("modal", { calLink: "vantagestack/discovery-call", config: { name, email, layout: "month_view" } });
      return;
    }
  } catch {
    /* fall through */
  }
  window.open("https://cal.com/vantagestack/discovery-call", "_blank");
}

/** Parse markdown links [text](url) and render as clickable anchors */
function MessageContent({ content }: { content: string }) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: Array<{ type: "text"; text: string } | { type: "link"; text: string; url: string }> = [];
  let lastIndex = 0;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    parts.push({ type: "link", text: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push({ type: "text", text: content.slice(lastIndex) });
  if (parts.length === 0) parts.push({ type: "text", text: content });

  const handleLinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "A" && target.getAttribute("href")?.startsWith("#")) {
      e.preventDefault();
      document.querySelector(target.getAttribute("href")!)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <p className="whitespace-pre-wrap" onClick={handleLinkClick}>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <a key={i} href={p.url} className="text-accent underline decoration-accent/50 underline-offset-2 hover:text-accent/90">
            {p.text}
          </a>
        )
      )}
    </p>
  );
}

/** Isabel's avatar — photo with animated ring when active, elegant SVG fallback */
function IsabelAvatar({ className = "h-10 w-10", isActive }: { className?: string; isActive?: boolean }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`relative shrink-0 ${className}`}>
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-accent/60"
          animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.15, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className={`h-full w-full overflow-hidden rounded-full ring-1 ${isActive ? "ring-accent/40" : "ring-white/10"}`}>
        {imgError ? (
          /* Professional illustrated fallback — elegant portrait silhouette */
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1e1a2e] via-[#1a1628] to-[#0f0d1a] relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-accent/10 via-transparent to-transparent" />
            {/* Shoulder/body shape */}
            <svg viewBox="0 0 100 100" className="absolute bottom-0 left-0 right-0 w-full" fill="none">
              <ellipse cx="50" cy="105" rx="38" ry="28" fill="#2a2040" />
            </svg>
            {/* Head shape */}
            <svg viewBox="0 0 100 100" className="absolute w-[55%] top-[18%]" fill="none">
              <ellipse cx="50" cy="45" rx="30" ry="34" fill="#3d2f52" />
              {/* Hair */}
              <ellipse cx="50" cy="22" rx="30" ry="18" fill="#1a1020" />
              <path d="M20 40 Q18 25 28 18 Q50 8 72 18 Q82 25 80 40 Q76 28 50 26 Q24 28 20 40Z" fill="#1a1020" />
              {/* Face highlight */}
              <ellipse cx="50" cy="50" rx="20" ry="23" fill="#4a3860" opacity="0.6" />
              {/* Subtle eyes */}
              <ellipse cx="42" cy="47" rx="3" ry="2" fill="#1a1020" opacity="0.7" />
              <ellipse cx="58" cy="47" rx="3" ry="2" fill="#1a1020" opacity="0.7" />
              {/* Smile hint */}
              <path d="M44 57 Q50 62 56 57" stroke="#1a1020" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" fill="none" />
            </svg>
            {/* "I" initial overlay */}
            <span className="relative z-10 mt-6 text-base font-bold tracking-tight text-accent/80 font-heading select-none">I</span>
          </div>
        ) : (
          <img
            src={ISABEL_AVATAR}
            alt="Isabel"
            className="h-full w-full object-cover object-top"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  );
}

export function IsabelWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [introCued, setIntroCued] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [feedbackSent, setFeedbackSent] = useState<boolean | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintData>(EMPTY_BLUEPRINT);
  const [showForm, setShowForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const onBlueprint = !!pathname?.startsWith("/blueprint");

  const { startSession, endSession, sendUserMessage, sendFeedback, status, canSendFeedback, isSpeaking } =
    useConversation({
      onConnect: () => {
        console.log("✅ Isabel connected!");
        if (onBlueprint) {
          // Light up the first field so her opening ("see this lighting up?") is
          // true from the first second. The MUSIC is intentionally NOT started
          // here — Isabel turns it on herself (controlBlueprintMusic) when she
          // says she's putting it on, so it lines up with her words.
          window.dispatchEvent(
            new CustomEvent(BLUEPRINT_TOOL_EVENT, { detail: { tool: "highlight", fieldId: "personName" } }),
          );
        }
        if (pendingMessage) { sendUserMessage(pendingMessage); setPendingMessage(null); }
      },
      onDisconnect: () => {
        console.log("🔌 Isabel disconnected");
        setFeedbackSent(null);
      },
      onMessage: (msg) => {
        if (!msg.message) return;
        if (msg.source === "user") {
          setMessages((prev) => [...prev, { role: "user", content: msg.message }]);
          return;
        }
        // Assistant: strip directives from display; act on any present.
        const dir = parseBookDirective(msg.message);
        const goto = hasGotoBlueprint(msg.message);
        const clean = stripBookDirective(msg.message);
        if (clean) setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
        if (dir) openCalBooking(dir.name, dir.email);
        if (goto) router.push("/blueprint");
      },
      onError: (err) => {
        console.error("❌ Isabel error:", err);
        if (typeof err === 'object' && err !== null) {
          console.error("Error details:", {
            message: (err as any)?.message,
            code: (err as any)?.code,
            stack: (err as any)?.stack
          });
        }
      },
    });

  const agentState = status;
  const isConnected = agentState === "connected";
  const isTransitioning = agentState === "connecting" || agentState === "disconnecting";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Broadcast Isabel's speaking state so the blueprint ambient audio can duck
  // the music while she talks (BlueprintAmbientAudio listens for this event).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("isabel:speaking", { detail: { speaking: isSpeaking } }));
  }, [isSpeaking]);

  // On the blueprint, keep Isabel's invite visible (un-dismissed) so the single
  // "Talk to Isabel" voice CTA is always there — without covering her on screen.
  useEffect(() => {
    if (onBlueprint) setDismissed(false);
  }, [onBlueprint]);

  // When the intro video finishes (Isabel fades back), draw the eye to the chat CTA.
  useEffect(() => {
    function onIntroDone() {
      setIntroCued(true);
      setDismissed(false);
      setIsOpen(false);
    }
    window.addEventListener("blueprint:intro-done", onIntroDone);
    return () => window.removeEventListener("blueprint:intro-done", onIntroDone);
  }, []);

  // Auto-extract data from conversation into blueprint form
  useEffect(() => {
    if (messages.length === 0) return;
    const extracted = extractFromMessages(messages);
    setBlueprint((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(extracted).filter(([, v]) => v)) }));
    // Show form once Isabel has asked the first question (at least 1 exchange)
    // Only show form once Isabel has captured at least a name or email
    const hasData = !!(extracted.name || extracted.email || extracted.phone);
    if (hasData) setShowForm(true);
  }, [messages]);

  const getMicStream = useCallback(async () => {
    if (mediaStreamRef.current) return mediaStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    return stream;
  }, []);

  // On /blueprint, give Isabel the walkthrough-specific spoken intro (requires
  // the first_message override enabled on the agent).
  const blueprintOverrides = useCallback(
    (textOnly: boolean) => ({
      conversation: { textOnly },
      ...(onBlueprint ? { agent: { firstMessage: ISABEL_BLUEPRINT_FIRST_MESSAGE } } : {}),
    }),
    [onBlueprint],
  );

  const startVoice = useCallback(async () => {
    try {
      console.log("🎤 Starting voice call with agent:", AGENT_ID.substring(0, 10) + "...");
      await getMicStream();
      console.log("🎤 Mic stream acquired, initiating session...");
      const sessionId = await startSession({ agentId: AGENT_ID, connectionType: "webrtc", overrides: blueprintOverrides(false), clientTools: createBlueprintClientTools() });
      console.log("✅ Voice session started:", sessionId);
    } catch (err) {
      console.error("❌ Failed to start voice:", err);
      console.error("Error type:", typeof err);
      console.error("Error details:", err);
    }
  }, [getMicStream, startSession, blueprintOverrides]);

  const startText = useCallback(async () => {
    try {
      console.log("💬 Starting text chat with agent:", AGENT_ID.substring(0, 10) + "...");
      const sessionId = await startSession({ agentId: AGENT_ID, connectionType: "websocket", overrides: blueprintOverrides(true), clientTools: createBlueprintClientTools() });
      console.log("✅ Text session started:", sessionId);
    } catch (err) {
      console.error("❌ Failed to start text:", err);
      console.error("Error details:", err);
    }
  }, [startSession, blueprintOverrides]);

  const endVoice = useCallback(async () => {
    await endSession();
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
  }, [endSession]);

  const handleCall = useCallback(async () => {
    if (agentState === "disconnected") await startVoice();
    else if (isConnected) await endVoice();
  }, [agentState, isConnected, startVoice, endVoice]);

  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setTextInput("");
    if (agentState === "disconnected") { setPendingMessage(text); await startText(); }
    else if (isConnected) sendUserMessage(text);
  }, [textInput, agentState, isConnected, startText, sendUserMessage]);

  const handleFeedback = useCallback((positive: boolean) => {
    if (canSendFeedback) { sendFeedback(positive); setFeedbackSent(positive); }
  }, [canSendFeedback, sendFeedback]);

  const handleVoiceQuickStart = useCallback(async () => {
    // On /blueprint the on-screen form (left) is the star — Isabel highlights and
    // fills it as she talks, so we DON'T open the big chat panel over her. A slim
    // live bar handles status + End instead. Elsewhere, open the panel as normal.
    if (!onBlueprint) setIsOpen(true);
    await startVoice();
  }, [startVoice, onBlueprint]);

  const handleTextQuickStart = useCallback(() => {
    setIsOpen(true);
  }, []);

  useEffect(() => { return () => { mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); }; }, []);

  return (
    <>
      {/* ── Collapsed invite widget ───────────────────────────────────────── */}
      {/* Hidden during an active /blueprint voice session — the slim live bar
          (below) takes over so nothing covers the on-screen form. */}
      <AnimatePresence>
        {!isOpen && !dismissed && !(onBlueprint && (isConnected || isTransitioning)) && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 1.2 }}
            className="fixed bottom-6 right-4 sm:right-6 z-50"
          >
            {/* Dismiss button */}
            <button
              onClick={() => setDismissed(true)}
              className="absolute -top-2 -left-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#1e1e24] border border-white/[0.1] text-textMuted hover:text-textPrimary transition text-xs leading-none shadow-lg"
              aria-label="Dismiss"
            >
              ×
            </button>

            {/* Main card */}
            <motion.div
              className={`relative flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#17171f] via-[#141418] to-[#101014] border px-5 py-4 cursor-pointer max-w-[360px] transition-all ${introCued ? "border-accent/70 shadow-[0_0_55px_rgba(56,189,248,0.55)]" : "border-white/[0.09] shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.03),0_0_50px_rgba(56,189,248,0.07)]"}`}
              whileHover={{ scale: 1.015, boxShadow: "0 24px 70px rgba(0,0,0,0.7), 0 0 60px rgba(56,189,248,0.12)" }}
              whileTap={{ scale: 0.98 }}
              onClick={onBlueprint ? handleVoiceQuickStart : handleTextQuickStart}
            >
              {/* Subtle shimmer line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent rounded-t-2xl" />

              {/* Avatar */}
              <div className="relative shrink-0">
                <IsabelAvatar className="h-16 w-16" isActive={false} />
                {/* Online indicator */}
                <span className="absolute bottom-0.5 right-0.5 flex h-3 w-3 items-center justify-center">
                  <span className="absolute h-full w-full rounded-full bg-emerald-400 opacity-40 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400 border border-[#141418]" />
                </span>
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-textPrimary leading-snug">
                    {onBlueprint ? "Talk to Isabel" : "Want to chat?"}
                  </p>
                </div>
                <p className="text-[11px] text-textMuted mt-0.5 leading-snug">
                  {onBlueprint ? "Tap to start — I'll walk you through it 👋" : "Isabel · AI assistant — text or voice"}
                </p>

                {onBlueprint ? (
                  <div className="mt-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleVoiceQuickStart(); }}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow shadow-accent/25 hover:opacity-90 transition-all"
                    >
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Talk to Isabel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTextQuickStart(); }}
                      className="flex items-center gap-1.5 rounded-lg bg-accent/12 border border-accent/25 px-2.5 py-1 text-[10px] font-semibold text-accent hover:bg-accent/20 transition-all"
                    >
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      Text chat
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleVoiceQuickStart(); }}
                      className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.09] px-2.5 py-1 text-[10px] font-semibold text-textMuted hover:bg-white/[0.1] hover:text-textPrimary transition-all"
                    >
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Voice call
                    </button>
                  </div>
                )}
              </div>

              {/* Chevron */}
              <svg className="shrink-0 text-textMuted/40" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Minimised button (after dismissed / when open) ────────────────── */}
      <AnimatePresence>
        {(dismissed || isOpen) && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => { setIsOpen(!isOpen); if (dismissed) setDismissed(false); }}
            className="fixed bottom-6 right-4 sm:right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#17171f] shadow-[0_10px_40px_rgba(0,0,0,0.55)] transition-all hover:border-accent/40 hover:shadow-[0_0_30px_rgba(56,189,248,0.2)]"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            aria-label={isOpen ? "Close chat" : "Open chat"}
          >
            {isOpen ? (
              <svg className="h-5 w-5 text-textPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <IsabelAvatar className="h-10 w-10" isActive={isConnected} />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── /blueprint live bar — slim, never covers the on-screen form ───── */}
      <AnimatePresence>
        {onBlueprint && (isConnected || isTransitioning) && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#17171f] via-[#141418] to-[#101014] px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_50px_rgba(56,189,248,0.1)]"
          >
            <IsabelAvatar className="h-11 w-11" isActive={isConnected} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-textPrimary">Isabel</p>
              <p className="text-[11px] leading-snug text-accent/80">
                {isTransitioning ? "Connecting…" : isSpeaking ? "Speaking — talk to interrupt" : "Listening — go ahead 👋"}
              </p>
            </div>
            {isConnected && (
              <span className="flex items-end gap-[3px] px-0.5">
                <span className="h-2.5 w-[3px] animate-pulse rounded-full bg-accent" />
                <span className="h-4 w-[3px] animate-pulse rounded-full bg-accent [animation-delay:140ms]" />
                <span className="h-2 w-[3px] animate-pulse rounded-full bg-accent [animation-delay:280ms]" />
              </span>
            )}
            <button
              onClick={endVoice}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-400 transition-all hover:bg-rose-500/20"
            >
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 7l-7.59 7.59L5.41 7 4 8.41l8 8 8-8z" /></svg>
              End
            </button>
            <button
              onClick={() => setIsOpen(true)}
              title="Show transcript"
              aria-label="Show transcript"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted transition hover:bg-white/[0.07] hover:text-textPrimary"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-4 sm:right-6 z-40 flex h-[480px] w-[calc(100vw-32px)] sm:w-[390px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#141518] via-[#111115] to-[#0a0b0c] shadow-[0_30px_70px_rgba(0,0,0,0.7),0_0_1px_rgba(255,255,255,0.04),0_0_70px_rgba(56,189,248,0.06)]"
          >
            {/* Shimmer top edge */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <IsabelAvatar className="h-11 w-11" isActive={isConnected} />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-heading text-sm font-semibold text-textPrimary">Isabel</p>
                    <span className="rounded-full bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">AI</span>
                  </div>
                  <p className="text-[11px] text-textMuted">
                    {isTransitioning ? "Connecting…" : isConnected ? isSpeaking ? "Speaking…" : "Listening…" : "VantageStack assistant"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full transition-all ${isConnected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : isTransitioning ? "animate-pulse bg-accent/70" : "bg-white/20"}`} />
                <button onClick={() => setIsOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-textMuted hover:bg-white/[0.07] hover:text-textPrimary transition" aria-label="Close">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Active session bar — End button + talk-to-interrupt hint */}
            {isConnected && (
              <div className="shrink-0 border-b border-white/[0.05] bg-black/20 px-3 py-2 flex items-center gap-2">
                {isSpeaking && (
                  <p className="flex flex-1 items-center gap-1.5 text-[11px] font-medium text-accent/80">
                    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Talk to interrupt
                  </p>
                )}
                {!isSpeaking && <div className="flex-1" />}
                <button
                  onClick={endVoice}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20 transition-all"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 7l-7.59 7.59L5.41 7 4 8.41l8 8 8-8z" />
                  </svg>
                  End conversation
                </button>
              </div>
            )}

            {/* Messages / empty / feedback */}
            <div className="flex-1 overflow-y-auto">
              {canSendFeedback && !isConnected && !isTransitioning && messages.length > 0 && feedbackSent === null ? (
                <div className="flex flex-col items-center justify-center gap-5 py-10 px-4">
                  <p className="font-heading text-base font-medium text-textPrimary">How was our chat?</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => handleFeedback(star >= 4)} className="rounded-lg p-2 text-textMuted/60 transition-all hover:scale-110 hover:text-accent focus:outline-none">
                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-textMuted/70">Your feedback helps Isabel improve</p>
                </div>
              ) : feedbackSent !== null && !isConnected ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
                  <p className="text-sm text-textMuted">Thanks for the feedback! 🙏</p>
                </div>
              ) : messages.length === 0 ? (
                /* Empty state — invite to start */
                <div className="flex flex-col items-center justify-center gap-5 py-10 px-4 text-center">
                  <IsabelAvatar className="h-24 w-24" isActive={false} />
                  <div className="space-y-1.5 px-2">
                    <p className="text-sm font-semibold text-textPrimary">Hi, I'm Isabel 👋</p>
                    <p className="text-xs leading-relaxed text-textMuted">
                      {onBlueprint
                        ? "I'll walk you through your blueprint — just tap below and we'll talk it through together."
                        : "I'm VantageStack's AI assistant. Ask me anything, or let's have a voice conversation — I'm here to help."}
                    </p>
                  </div>
                  {onBlueprint ? (
                    <div className="w-full space-y-2.5 px-2">
                      <button
                        onClick={handleVoiceQuickStart}
                        disabled={isTransitioning}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:opacity-90 disabled:opacity-50"
                      >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        {isTransitioning ? "Connecting…" : "Talk to Isabel"}
                      </button>
                      <button
                        onClick={handleTextQuickStart}
                        className="text-[11px] text-textMuted/70 underline-offset-2 transition hover:text-textMuted hover:underline"
                      >
                        or type instead
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleTextQuickStart}
                        className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-all"
                      >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Type a message
                      </button>
                      <button
                        onClick={handleVoiceQuickStart}
                        className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-textMuted hover:bg-white/[0.09] hover:text-textPrimary transition-all"
                      >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start voice call
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Chat messages — scrollable, compact when form is visible */}
                  <div className={`overflow-y-auto p-3 space-y-3 ${showForm ? "max-h-[160px]" : "flex-1 p-4 space-y-4"}`}>
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                          <IsabelAvatar className="h-6 w-6 shrink-0" isActive={isConnected && i === messages.length - 1} />
                        )}
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                          msg.role === "user"
                            ? "bg-accent/15 text-accent border border-accent/25"
                            : "bg-white/[0.07] text-textPrimary border border-white/10"
                        }`}>
                          {msg.role === "assistant" ? <MessageContent content={msg.content} /> : <p className="whitespace-pre-wrap">{msg.content}</p>}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Live Blueprint form — appears once conversation starts */}
                  {showForm && (
                    <div className="flex-1 overflow-y-auto border-t border-white/[0.06] bg-black/20 px-3 py-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Blueprint — filling live</p>
                        <span className="flex items-center gap-1 text-[10px] text-textMuted/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Auto-capturing
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {(
                          [
                            { key: "name", label: "Name" },
                            { key: "email", label: "Email" },
                            { key: "phone", label: "Cell no." },
                            { key: "whatsapp", label: "WhatsApp" },
                            { key: "preferredTime", label: "Best time" },
                            { key: "industry", label: "Industry" },
                          ] as { key: keyof BlueprintData; label: string }[]
                        ).map(({ key, label }) => {
                          const val = blueprint[key];
                          const filled = val.trim().length > 0;
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filled ? "bg-emerald-400" : "bg-white/20"}`} />
                              <span className="text-[10px] text-textMuted/60 w-16 shrink-0">{label}</span>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => setBlueprint((prev) => ({ ...prev, [key]: e.target.value }))}
                                placeholder={filled ? "" : "Waiting…"}
                                className={`flex-1 rounded-md border px-2 py-0.5 text-[11px] bg-transparent outline-none transition-all ${
                                  filled
                                    ? "border-emerald-500/30 text-textPrimary"
                                    : "border-white/[0.06] text-textMuted/40 placeholder:text-white/20"
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {/* Submit CTA */}
                      {(blueprint.name && blueprint.email && blueprint.phone) && (
                        <motion.a
                          href="#blueprint"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={(e) => { e.preventDefault(); document.querySelector("#blueprint")?.scrollIntoView({ behavior: "smooth" }); }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-[11px] font-semibold text-white hover:opacity-90 transition-all"
                        >
                          Submit Blueprint
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </motion.a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input area */}
            {!canSendFeedback && feedbackSent === null && (
              <div className="shrink-0 border-t border-white/[0.06] bg-black/10 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendText())}
                    placeholder="Message Isabel…"
                    className="vs-input flex-1 text-sm"
                    disabled={isTransitioning}
                  />
                  {/* Voice button */}
                  <button
                    onClick={handleCall}
                    disabled={isTransitioning}
                    title={isConnected ? "End voice call" : "Start voice call"}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                      isConnected
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        : "border-white/10 bg-white/[0.05] text-accent hover:bg-accent/10 hover:border-accent/30"
                    }`}
                    aria-label={isConnected ? "End call" : "Start voice call"}
                  >
                    <svg className="h-4.5 w-4.5" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C2.95 22.5 0 19.55 0 16.5V6.257c0-1.655.967-3.113 2.437-3.757l.063-.063z" />
                    </svg>
                  </button>
                  {/* Send button */}
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim() || isTransitioning}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Send message"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
