"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call as TwilioCall, Device as TwilioDevice } from "@twilio/voice-sdk";
import { api, ApiClientError } from "../../lib/consultant/client/api";
import { VOICE_ERRORS, voiceErrorKey, voiceErrorMessage } from "../../lib/consultant/client/voiceErrors";
import type { Call } from "../../lib/consultant/types";

/**
 * Browser calling via the Twilio Voice JS SDK.
 *
 *   const v = useVoiceCall();
 *   <button disabled={!v.ready} onClick={() => v.start(lead.id)}>Call</button>
 *
 * Lifecycle
 * - The SDK is dynamic-imported (warmed on idle), so it never ships in the
 *   server bundle or blocks first paint.
 * - `start(leadId)` must be called from a tap: the microphone prompt is
 *   requested synchronously inside the gesture (iOS Safari needs this), in
 *   parallel with fetching a voice token and creating the Device (first call
 *   only). Then `api.calls.start(leadId)` creates the call row (the server
 *   owns the number) and `device.connect({ params: { CallId } })` dials.
 * - SDK events → `state`: ringing → "ringing", accept → "in_progress" (timer
 *   starts), disconnect/cancel/reject → "ended". Errors before answer →
 *   "error"; a mid-call network drop keeps "in_progress" with
 *   `reconnecting: true` until the SDK reconnects or gives up.
 * - `tokenWillExpire` → fetch a fresh token → `device.updateToken`.
 * - Unmount disconnects the call, destroys the Device, releases the mic.
 *
 * `ready` = this browser can place calls and no call is in flight.
 */

export type VoiceCallState = "idle" | "connecting" | "ringing" | "in_progress" | "ended" | "error";

export interface UseVoiceCallResult {
  ready: boolean;
  state: VoiceCallState;
  call: Call | null;
  muted: boolean;
  durationSec: number;
  error: string | null;
  start: (leadId: string) => Promise<Call | null>;
  hangup: () => void;
  toggleMute: () => void;
  /** Additive: the SDK is re-establishing media after a network blip. */
  reconnecting: boolean;
  /** Additive: false when the browser can't place calls (no WebRTC / mic API / insecure origin). */
  supported: boolean;
}

type Sdk = typeof import("@twilio/voice-sdk");

let sdkPromise: Promise<Sdk> | null = null;
function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = import("@twilio/voice-sdk").catch((e) => {
      sdkPromise = null; // allow a retry after a chunk-load failure
      throw e;
    });
  }
  return sdkPromise;
}

const BUSY: VoiceCallState[] = ["connecting", "ringing", "in_progress"];

function detectSupport(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    window.isSecureContext !== false
  );
}

function stopStream(s: MediaStream | null): void {
  s?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

export function useVoiceCall(): UseVoiceCallResult {
  const [state, setStateRaw] = useState<VoiceCallState>("idle");
  const [call, setCall] = useState<Call | null>(null);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [supported, setSupported] = useState(false);

  const stateRef = useRef<VoiceCallState>("idle");
  const deviceRef = useRef<TwilioDevice | null>(null);
  const twCallRef = useRef<TwilioCall | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const acceptedAtRef = useRef<number | null>(null);
  const abortRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setState = useCallback((s: VoiceCallState) => {
    stateRef.current = s;
    if (mountedRef.current) setStateRaw(s);
  }, []);

  // Support detection + idle warm-up of the SDK chunk.
  useEffect(() => {
    mountedRef.current = true;
    const ok = detectSupport();
    setSupported(ok);
    if (!ok) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const warm = () => void loadSdk().catch(() => undefined);
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 5_000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(warm, 1_500);
    return () => clearTimeout(t);
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      try {
        twCallRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      twCallRef.current = null;
      try {
        deviceRef.current?.destroy();
      } catch {
        /* ignore */
      }
      deviceRef.current = null;
      stopStream(micRef.current);
      micRef.current = null;
    };
  }, []);

  // Call timer — derived from the accept timestamp, so it never drifts.
  useEffect(() => {
    if (state !== "in_progress") return;
    const tick = () => {
      const at = acceptedAtRef.current;
      if (at !== null) setDuration(Math.max(0, Math.floor((Date.now() - at) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state]);

  const destroyDevice = useCallback(() => {
    try {
      deviceRef.current?.destroy();
    } catch {
      /* ignore */
    }
    deviceRef.current = null;
  }, []);

  const refreshToken = useCallback(async (attempt = 0): Promise<void> => {
    const device = deviceRef.current;
    if (!device || !mountedRef.current) return;
    try {
      const t = await api.voice.token();
      deviceRef.current?.updateToken(t.token);
    } catch {
      if (attempt < 3 && mountedRef.current) {
        refreshTimer.current = setTimeout(() => void refreshToken(attempt + 1), 5_000 * (attempt + 1));
      }
    }
  }, []);

  const ensureDevice = useCallback(async (): Promise<TwilioDevice> => {
    if (deviceRef.current) return deviceRef.current;
    const [sdk, tok] = await Promise.all([loadSdk(), api.voice.token()]);
    const device = new sdk.Device(tok.token, {
      codecPreferences: [sdk.Call.Codec.Opus, sdk.Call.Codec.PCMU],
      closeProtection: "You're on a call. Leaving will hang up.",
      logLevel: "error",
      appName: "vantage-consultant",
      tokenRefreshMs: 30_000,
    });
    device.on("tokenWillExpire", () => void refreshToken());
    device.on("error", (e: unknown) => {
      // Token/auth failures while idle: drop the device so the next start() rebuilds it.
      if (voiceErrorKey(e) === "token" && !twCallRef.current) destroyDevice();
    });
    deviceRef.current = device;
    return device;
  }, [refreshToken, destroyDevice]);

  const finish = useCallback(() => {
    twCallRef.current = null;
    if (acceptedAtRef.current !== null) {
      setDuration(Math.max(0, Math.floor((Date.now() - acceptedAtRef.current) / 1000)));
    }
    if (mountedRef.current) {
      setReconnecting(false);
      setMuted(false);
    }
    if (stateRef.current !== "error") setState("ended");
  }, [setState]);

  const wire = useCallback(
    (tw: TwilioCall) => {
      tw.on("ringing", () => {
        if (stateRef.current === "connecting") setState("ringing");
      });
      tw.on("accept", () => {
        acceptedAtRef.current = Date.now();
        setState("in_progress");
      });
      tw.on("disconnect", finish);
      tw.on("cancel", finish);
      tw.on("reject", finish);
      tw.on("reconnecting", () => mountedRef.current && setReconnecting(true));
      tw.on("reconnected", () => mountedRef.current && setReconnecting(false));
      tw.on("mute", (isMuted: boolean) => mountedRef.current && setMuted(isMuted));
      tw.on("error", (e: unknown) => {
        if (!mountedRef.current) return;
        setError(voiceErrorMessage(e));
        if (stateRef.current !== "in_progress") {
          // Failed before answer: surface as error and make sure the leg is gone.
          setState("error");
          try {
            tw.disconnect();
          } catch {
            /* ignore */
          }
        }
        // In progress: keep the state; `disconnect` follows if the SDK gives up.
      });
    },
    [finish, setState],
  );

  const start = useCallback(
    async (leadId: string): Promise<Call | null> => {
      if (BUSY.includes(stateRef.current)) return null;
      abortRef.current = false;
      acceptedAtRef.current = null;
      setError(null);
      setCall(null);
      setMuted(false);
      setDuration(0);
      setReconnecting(false);

      if (!detectSupport()) {
        setError(typeof window !== "undefined" && window.isSecureContext === false ? VOICE_ERRORS.insecure : VOICE_ERRORS.unsupported);
        setState("error");
        return null;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setError(VOICE_ERRORS.offline);
        setState("error");
        return null;
      }
      setState("connecting");

      // Ask for the mic NOW, synchronously inside the user gesture (iOS Safari).
      const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      let stream: MediaStream | null = null;
      try {
        const [s, device] = await Promise.all([micPromise, ensureDevice()]);
        stream = s;
        micRef.current = s;
        if (abortRef.current) {
          stopStream(stream);
          micRef.current = null;
          return null;
        }

        const created = await api.calls.start(leadId);
        if (mountedRef.current) setCall(created);
        if (abortRef.current) {
          stopStream(stream);
          micRef.current = null;
          return created;
        }

        const tw = await device.connect({ params: { CallId: created.id } });
        twCallRef.current = tw;
        wire(tw);
        // The SDK holds its own track now; release the pre-flight one.
        stopStream(stream);
        micRef.current = null;
        if (abortRef.current) tw.disconnect();
        return created;
      } catch (e) {
        // If the mic was granted but something later failed, release it.
        void micPromise.then(stopStream, () => undefined);
        stopStream(stream);
        micRef.current = null;
        if (abortRef.current) return null;
        const key = voiceErrorKey(e);
        if (key === "token" || (e instanceof ApiClientError && e.status === 401)) destroyDevice();
        if (mountedRef.current) setError(voiceErrorMessage(e));
        setState("error");
        return null;
      }
    },
    [ensureDevice, wire, destroyDevice, setState],
  );

  const hangup = useCallback(() => {
    abortRef.current = true;
    const tw = twCallRef.current;
    if (tw) {
      try {
        tw.disconnect(); // `disconnect` event → finish()
      } catch {
        finish();
      }
      return;
    }
    if (BUSY.includes(stateRef.current)) setState("ended");
  }, [finish, setState]);

  const toggleMute = useCallback(() => {
    const tw = twCallRef.current;
    if (!tw) return;
    const next = !tw.isMuted();
    tw.mute(next);
    setMuted(next);
  }, []);

  return {
    ready: supported && !BUSY.includes(state),
    state,
    call,
    muted,
    durationSec,
    error,
    start,
    hangup,
    toggleMute,
    reconnecting,
    supported,
  };
}
