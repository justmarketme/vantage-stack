"use client";

import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useSpeechInput } from "@/lib/clinic-crm/client/speech";
import { Button } from "./Button";

/**
 * Dictation for any text field. Speech is never committed straight into the
 * field — the transcript is shown back for a confirm step first, because
 * recognisers mishear names and numbers and this text may go to a patient.
 * Renders nothing where the browser has no speech recognition.
 */
export function MicButton({ onCommit, label = "Dictate" }: { onCommit: (text: string) => void; label?: string }) {
  const [heard, setHeard] = useState<string | null>(null);
  const speech = useSpeechInput({ onResult: (text) => setHeard(text.trim() || null) });

  if (!speech.supported) return null;

  const showPanel = speech.listening || heard !== null || Boolean(speech.error);

  return (
    <div className="relative">
      <Button
        variant={speech.listening ? "primary" : "ghost"}
        iconOnly
        aria-label={speech.listening ? "Stop dictation" : label}
        aria-pressed={speech.listening}
        onClick={() => {
          setHeard(null);
          if (speech.listening) speech.stop();
          else speech.start();
        }}
      >
        {speech.listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
      </Button>

      {showPanel && (
        <div
          className="cc-card absolute bottom-full right-0 z-20 mb-2 w-[min(320px,calc(100vw-32px))] p-3"
          role="region"
          aria-label="Dictation"
          aria-live="polite"
        >
          {speech.listening && (
            <p className="text-sm">
              <span className="cc-accent font-semibold">Listening… </span>
              <span className="cc-muted">{speech.interim || "Start speaking"}</span>
            </p>
          )}
          {!speech.listening && speech.error && <p className="cc-error mt-0">{speech.error}</p>}
          {!speech.listening && heard !== null && (
            <>
              <p className="cc-muted text-xs font-semibold uppercase tracking-wider">Did we hear you right?</p>
              <p className="mt-1 text-sm leading-relaxed">{heard}</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setHeard(null)}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onCommit(heard);
                    setHeard(null);
                  }}
                >
                  Insert
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
