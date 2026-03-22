"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";

const AGENT_ID =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "YOUR_AGENT_ID";

/** Isabel avatar - add your image at public/images/isabel-avatar.png */
const ISABEL_AVATAR = "/images/isabel-avatar.png";

type Message = { role: "user" | "assistant"; content: string };

/** Parse markdown links [text](url) and render as clickable anchors for section navigation */
function MessageContent({ content }: { content: string }) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: Array<{ type: "text"; text: string } | { type: "link"; text: string; url: string }> = [];
  let lastIndex = 0;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "link", text: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }
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
          <a
            key={i}
            href={p.url}
            className="text-accent underline decoration-accent/50 underline-offset-2 hover:text-accent/90"
          >
            {p.text}
          </a>
        )
      )}
    </p>
  );
}

function IsabelAvatar({
  className = "h-10 w-10",
  isActive,
}: { className?: string; isActive?: boolean }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className={`relative shrink-0 ${className}`}>
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-accent/60"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div
        className={`h-full w-full overflow-hidden rounded-full ring-1 ${
          isActive ? "ring-accent/40" : "ring-white/10"
        }`}
      >
        {imgError ? (
          <div className="flex h-full w-full items-center justify-center bg-accent/20 text-accent font-heading text-lg font-semibold">
            I
          </div>
        ) : (
          <img
            src={ISABEL_AVATAR}
            alt="Isabel"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  );
}

export function IsabelWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [feedbackSent, setFeedbackSent] = useState<boolean | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const {
    startSession,
    endSession,
    sendUserMessage,
    sendFeedback,
    status,
    canSendFeedback,
    isSpeaking,
  } = useConversation({
    onConnect: () => {
      if (pendingMessage) {
        sendUserMessage(pendingMessage);
        setPendingMessage(null);
      }
    },
    onDisconnect: () => {
      setFeedbackSent(null);
    },
    onMessage: (msg) => {
      if (msg.message) {
        setMessages((prev) => [
          ...prev,
          {
            role: msg.source === "user" ? "user" : "assistant",
            content: msg.message,
          },
        ]);
      }
    },
    onError: (err) => console.error("Isabel error:", err),
  });

  const agentState = status;
  const isConnected = agentState === "connected";
  const isTransitioning = agentState === "connecting" || agentState === "disconnecting";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const getMicStream = useCallback(async () => {
    if (mediaStreamRef.current) return mediaStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    return stream;
  }, []);

  const startVoice = useCallback(async () => {
    try {
      await getMicStream();
      await startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc",
        overrides: {
          conversation: { textOnly: false },
        },
      });
    } catch (err) {
      console.error("Failed to start voice:", err);
    }
  }, [getMicStream, startSession]);

  const startText = useCallback(async () => {
    try {
      await startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
        overrides: {
          conversation: { textOnly: true },
        },
      });
    } catch (err) {
      console.error("Failed to start text:", err);
    }
  }, [startSession]);

  const endVoice = useCallback(async () => {
    await endSession();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, [endSession]);

  const handleCall = useCallback(async () => {
    if (agentState === "disconnected") {
      await startVoice();
    } else if (isConnected) {
      await endVoice();
    }
  }, [agentState, isConnected, startVoice, endVoice]);

  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setTextInput("");

    if (agentState === "disconnected") {
      setPendingMessage(text);
      await startText();
    } else if (isConnected) {
      sendUserMessage(text);
    }
  }, [textInput, agentState, isConnected, startText, sendUserMessage]);

  const handleFeedback = useCallback(
    (positive: boolean) => {
      if (canSendFeedback) {
        sendFeedback(positive);
        setFeedbackSent(positive);
      }
    },
    [canSendFeedback, sendFeedback]
  );

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <>
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-surface shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-accent/50 hover:shadow-[0_0_28px_rgba(56,189,248,0.3)]"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg className="h-5 w-5 text-textPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <img src="/icons/phone-icon.svg" alt="" className="h-6 w-6 opacity-90" />
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-40 flex h-[440px] w-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#141518] via-surface to-[#0a0b0c] shadow-[0_25px_60px_rgba(0,0,0,0.6),0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(56,189,248,0.06)]"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <IsabelAvatar className="h-12 w-12" isActive={isConnected} />
                <div>
                  <p className="font-heading text-sm font-semibold text-textPrimary">Talk to Isabel</p>
                  <p className="text-[11px] text-textMuted">
                    {isTransitioning
                      ? "Connecting..."
                      : isConnected
                        ? isSpeaking
                          ? "Speaking..."
                          : "Listening..."
                        : "AI voice assistant"}
                  </p>
                </div>
              </div>
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  isConnected
                    ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
                    : isTransitioning
                      ? "animate-pulse bg-accent/70"
                      : "bg-textMuted/50"
                }`}
              />
            </div>

            {/* Talk to interrupt - shown when Isabel is speaking */}
            {isConnected && isSpeaking && (
              <div className="shrink-0 border-b border-white/5 bg-accent/5 px-4 py-2">
                <p className="flex items-center justify-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-medium text-accent/90">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Talk to interrupt
                </p>
              </div>
            )}

            {/* Messages or feedback */}
            <div className="flex-1 overflow-y-auto p-4">
              {canSendFeedback && feedbackSent === null ? (
                <div className="flex flex-col items-center justify-center gap-5 py-10">
                  <p className="font-heading text-base font-medium text-textPrimary">How was this conversation?</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleFeedback(star >= 4)}
                        className="rounded-lg p-2 text-textMuted/60 transition-all hover:scale-110 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-[#141518]"
                        aria-label={`Rate ${star} stars`}
                      >
                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-textMuted/80">You ended the conversation</p>
                </div>
              ) : feedbackSent !== null ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <p className="text-sm text-textMuted">Thanks for your feedback!</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-6 py-14 text-center">
                  <IsabelAvatar className="h-24 w-24" isActive={false} />
                  <div className="space-y-3 px-2">
                    <p className="text-sm leading-relaxed text-textMuted">
                      Type a message or tap the phone button to start a voice conversation.
                    </p>
                    <p className="text-[11px] text-textMuted/60">
                      Isabel can answer questions about VantageStack and take you to sections like the Blueprint.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-accent">
                      Voice
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-textMuted">
                      Text
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "user" && <div className="min-w-0 flex-1" />}
                      {msg.role === "assistant" && (
                        <IsabelAvatar className="h-8 w-8 shrink-0" isActive={isConnected && i === messages.length - 1} />
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          msg.role === "user"
                            ? "bg-accent/15 text-accent border border-accent/25"
                            : "bg-white/[0.07] text-textPrimary border border-white/10"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <MessageContent content={msg.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            {!canSendFeedback && feedbackSent === null && (
              <div className="shrink-0 border-t border-white/5 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendText())}
                    placeholder="Send a message..."
                    className="vs-input flex-1 text-sm"
                    disabled={isTransitioning}
                  />
                  <button
                    onClick={handleCall}
                    disabled={isTransitioning}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                      isConnected
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        : "border-white/10 bg-white/5 text-accent hover:bg-accent/10 hover:border-accent/30"
                    }`}
                    aria-label={isConnected ? "End call" : "Start voice call"}
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C2.95 22.5 0 19.55 0 16.5V6.257c0-1.655.967-3.113 2.437-3.757l.063-.063z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim() || isTransitioning}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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
