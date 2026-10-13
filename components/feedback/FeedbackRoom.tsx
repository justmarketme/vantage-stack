"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { upload } from "@vercel/blob/client";
import {
  ArrowRight,
  Captions,
  Check,
  CircleCheck,
  Clock,
  Eraser,
  Highlighter,
  Keyboard,
  ListChecks,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Mic,
  Monitor,
  MoveUpRight,
  Pause,
  PenLine,
  Play,
  RectangleHorizontal,
  Send,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Undo2,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { FeedbackBrand } from "@/lib/crm/feedback-brand";

type Kind = "pin" | "drawing" | "note";
type Item = { ref: string; kind: Kind; body: string; x: number | null; y: number | null; at: number | null; shot: Blob | null; shotUrl: string | null };
type Tool = "box" | "arrow" | "pen" | "highlight";
type Stroke = { tool: Tool; color: string; pts: { x: number; y: number }[] };
type Stage = "intro" | "review" | "confirm" | "sending" | "done";
type Mode = "browse" | "pin" | "draw";
type Draft = { kind: Kind; x: number | null; y: number | null; at: number | null; shot: Blob | null; shotUrl: string | null };

const TAGS = ["Copy", "Design", "Remove", "Add", "Question"];

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function pickMime(candidates: string[]) {
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function safeStorage(key: string, value?: string) {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
  return null;
}

type SpeechRec = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function FeedbackRoom(props: {
  token: string;
  linkId: string;
  firstName: string;
  title: string;
  proposalUrl: string;
  embeddable: boolean;
  brand: FeedbackBrand;
  fontsHref: string;
}) {
  const { token, linkId, firstName, title, proposalUrl, embeddable, brand, fontsHref } = props;

  const [stage, setStage] = useState<Stage>("intro");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<Mode>("browse");
  const [items, setItems] = useState<Item[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTag, setDraftTag] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [recState, setRecState] = useState<"idle" | "countdown" | "recording" | "paused" | "stopped">("idle");
  const [count, setCount] = useState(3);
  const [recKind, setRecKind] = useState<"screen" | "audio" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [progress, setProgress] = useState({ label: "", pct: 0 });
  const [support, setSupport] = useState({ screen: true, captions: false, mobile: false });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>("box");
  const [color, setColor] = useState(brand.highlight);
  const [camOn, setCamOn] = useState(false);
  const [camPos, setCamPos] = useState({ x: 24, y: 24 });
  const [captionsOn, setCaptionsOn] = useState(true);
  const [caption, setCaption] = useState("");
  const [tour, setTour] = useState<number | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [micTest, setMicTest] = useState<"idle" | "on" | "ok" | "blocked">("idle");
  const [logoWide, setLogoWide] = useState(false);

  useEffect(() => {
    if (!brand.logo) return;
    const img = new Image();
    img.onload = () => setLogoWide(img.naturalWidth / Math.max(1, img.naturalHeight) > 2.2);
    img.src = brand.logo;
  }, [brand.logo]);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streams = useRef<MediaStream[]>([]);
  const clock = useRef({ base: 0, startedAt: 0 });
  const frameVideo = useRef<HTMLVideoElement | null>(null);
  const camVideo = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Stroke | null>(null);
  const refCounter = useRef(0);
  const draftBox = useRef<HTMLTextAreaElement | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const levelRaf = useRef<number | null>(null);
  const speech = useRef<SpeechRec | null>(null);
  const dockRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sent = useRef(false);

  const theme = useMemo(
    () =>
      ({
        "--fb-bg": brand.bg,
        "--fb-surface": brand.surface,
        "--fb-text": brand.text,
        "--fb-muted": brand.muted,
        "--fb-border": brand.border,
        "--fb-accent": brand.accent,
        "--fb-accent-text": brand.accentText,
        "--fb-hl": brand.highlight,
        "--fb-radius": `${brand.radius}px`,
        "--fb-display": `"${brand.displayFont}", ui-sans-serif, system-ui, sans-serif`,
        "--fb-body": `"${brand.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
        colorScheme: brand.mode,
      }) as CSSProperties,
    [brand],
  );

  const recording = recState === "recording" || recState === "paused";
  const nowSec = useCallback(() => {
    if (recState === "recording") return clock.current.base + (Date.now() - clock.current.startedAt) / 1000;
    if (recState === "paused") return clock.current.base;
    return null;
  }, [recState]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupport({
      screen: !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices && !/Android|iPhone|iPad/i.test(navigator.userAgent),
      captions: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
      mobile: /Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 640,
    });
    fetch(`/api/feedback/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "opened" }) }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (recState !== "recording") return;
    const t = window.setInterval(() => setElapsed(clock.current.base + (Date.now() - clock.current.startedAt) / 1000), 250);
    return () => window.clearInterval(t);
  }, [recState]);

  useEffect(() => {
    if (draft) window.setTimeout(() => draftBox.current?.focus(), 60);
  }, [draft]);

  // Nothing the client typed or said should vanish on an accidental tab close.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (sent.current || stage === "intro" || stage === "done") return;
      if (items.length || recBlob || recording) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [items.length, recBlob, recording, stage]);

  const stopAll = useCallback(() => {
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    if (levelRaf.current) cancelAnimationFrame(levelRaf.current);
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    try {
      speech.current?.stop();
    } catch {
      /* ignore */
    }
    speech.current = null;
  }, []);

  useEffect(
    () => () => {
      stopAll();
      camStream.current?.getTracks().forEach((t) => t.stop());
    },
    [stopAll],
  );

  function meter(stream: MediaStream) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtx.current = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 70) {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 60));
        last = t;
      }
      levelRaf.current = requestAnimationFrame(tick);
    };
    levelRaf.current = requestAnimationFrame(tick);
  }

  async function testMic() {
    setMicTest("on");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.current.push(s);
      meter(s);
      window.setTimeout(() => {
        stopAll();
        setLevel(0);
        setMicTest("ok");
      }, 6000);
    } catch {
      setMicTest("blocked");
    }
  }

  function startCaptions() {
    if (!support.captions || !captionsOn) return;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    const r = new Rec();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-ZA";
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      setCaption(text.trim().split(/\s+/).slice(-14).join(" "));
    };
    r.onend = () => {
      if (speech.current === r && recorder.current?.state === "recording") {
        try {
          r.start();
        } catch {
          /* ignore */
        }
      }
    };
    r.onerror = () => {};
    speech.current = r;
    try {
      r.start();
    } catch {
      /* ignore */
    }
  }

  async function toggleCam() {
    if (camOn) {
      camStream.current?.getTracks().forEach((t) => t.stop());
      camStream.current = null;
      setCamOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320, facingMode: "user" } });
      camStream.current = s;
      setCamOn(true);
      window.setTimeout(() => {
        if (camVideo.current) {
          camVideo.current.srcObject = s;
          camVideo.current.play().catch(() => {});
        }
      }, 30);
    } catch {
      setError("Camera permission was blocked. You can carry on without your face bubble.");
    }
  }

  const stopRecording = useCallback(() => {
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  async function startRecording() {
    setError(null);
    const kind: "screen" | "audio" = support.screen ? "screen" : "audio";
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const tracks: MediaStreamTrack[] = [...mic.getAudioTracks()];
      streams.current = [mic];
      let mime = pickMime(["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]);
      if (kind === "screen") {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: "include",
        } as DisplayMediaStreamOptions);
        streams.current.push(display);
        const vt = display.getVideoTracks()[0];
        tracks.unshift(vt);
        vt.addEventListener("ended", () => stopRecording());
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = new MediaStream([vt]);
        await v.play().catch(() => {});
        frameVideo.current = v;
        mime = pickMime(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]);
      }
      meter(mic);
      setRecKind(kind);
      setRecState("countdown");
      for (let n = 3; n > 0; n--) {
        setCount(n);
        await new Promise((r) => setTimeout(r, 800));
      }
      const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const type = (rec.mimeType || mime || (kind === "screen" ? "video/webm" : "audio/webm")).split(";")[0];
        const blob = new Blob(chunks.current, { type });
        setRecBlob(blob);
        setRecUrl(URL.createObjectURL(blob));
        clock.current.base = recorder.current?.state === "inactive" ? clock.current.base : clock.current.base;
        setRecState("stopped");
        stopAll();
        frameVideo.current = null;
        setCaption("");
        setLevel(0);
        flash("Recording saved");
      };
      rec.start(1000);
      recorder.current = rec;
      clock.current = { base: 0, startedAt: Date.now() };
      setElapsed(0);
      setRecState("recording");
      startCaptions();
    } catch (e) {
      stopAll();
      setRecState("idle");
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Recording needs your permission. Allow the microphone and choose “This tab” when asked, or skip recording and use Pin, Draw and Note."
          : "Your browser couldn't start recording. You can still pin, draw and type notes.",
      );
    }
  }

  function pauseResume() {
    const r = recorder.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      clock.current.base += (Date.now() - clock.current.startedAt) / 1000;
      setElapsed(clock.current.base);
      setRecState("paused");
    } else if (r.state === "paused") {
      r.resume();
      clock.current.startedAt = Date.now();
      setRecState("recording");
    }
  }

  function discardRecording() {
    if (recUrl) URL.revokeObjectURL(recUrl);
    setRecBlob(null);
    setRecUrl(null);
    setRecState("idle");
    setElapsed(0);
  }

  /** Grabs the current shared-screen frame (if recording) and burns the client's marks onto it. */
  async function snapshot(mark: { pin?: { x: number; y: number; n: string }; strokes?: Stroke[] }): Promise<Blob | null> {
    const v = frameVideo.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(v, 0, 0, c.width, c.height);
    const sx = c.width / window.innerWidth;
    const sy = c.height / window.innerHeight;
    if (mark.pin) {
      const px = (mark.pin.x / 100) * c.width;
      const py = (mark.pin.y / 100) * c.height;
      g.fillStyle = brand.highlight;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 3 * sx;
      g.beginPath();
      g.arc(px, py, 15 * sx, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.font = `700 ${14 * sx}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(mark.pin.n, px, py);
    }
    if (mark.strokes) {
      g.save();
      g.scale(sx, sy);
      paint(g, mark.strokes);
      g.restore();
    }
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.85));
  }

  const nextRef = (kind: Kind) => {
    refCounter.current += 1;
    return `${kind === "pin" ? "P" : kind === "drawing" ? "D" : "N"}${refCounter.current}`;
  };

  async function onPinClick(e: React.MouseEvent<HTMLDivElement>) {
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    const n = String(items.filter((i) => i.kind === "pin").length + 1);
    const shot = await snapshot({ pin: { x, y, n } });
    openDraft({ kind: "pin", x, y, at: nowSec(), shot, shotUrl: shot ? URL.createObjectURL(shot) : null });
  }

  async function finishDrawing() {
    if (!strokes.length) {
      setMode("browse");
      return;
    }
    const shot = await snapshot({ strokes });
    openDraft({ kind: "drawing", x: null, y: null, at: nowSec(), shot, shotUrl: shot ? URL.createObjectURL(shot) : null });
  }

  function openDraft(d: Draft) {
    setDraft(d);
    setDraftText("");
    setDraftTag(null);
    setEditingRef(null);
  }

  function saveDraft() {
    if (!draft) return;
    const body = `${draftTag ? `[${draftTag}] ` : ""}${draftText.trim()}`.trim();
    if (draft.kind === "note" && !body) return;
    if (editingRef) {
      setItems((xs) => xs.map((x) => (x.ref === editingRef ? { ...x, body } : x)));
      flash("Updated");
    } else {
      const ref = nextRef(draft.kind);
      setItems((xs) => [...xs, { ref, kind: draft.kind, body, x: draft.x, y: draft.y, at: draft.at, shot: draft.shot, shotUrl: draft.shotUrl }]);
      flash(draft.kind === "pin" ? "Pin saved" : draft.kind === "drawing" ? "Drawing saved" : "Note saved");
    }
    setDraft(null);
    setDraftText("");
    setDraftTag(null);
    setEditingRef(null);
    setStrokes([]);
    setMode("browse");
  }

  function cancelDraft() {
    setDraft(null);
    setEditingRef(null);
    if (draft?.kind === "drawing") setStrokes([]);
    setMode("browse");
  }

  function editItem(it: Item) {
    const m = it.body.match(/^\[(\w+)\]\s*/);
    setDraft({ kind: it.kind, x: it.x, y: it.y, at: it.at, shot: it.shot, shotUrl: it.shotUrl });
    setDraftTag(m ? m[1] : null);
    setDraftText(m ? it.body.slice(m[0].length) : it.body);
    setEditingRef(it.ref);
  }

  // Drawing canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    paint(g, strokes);
  }, [strokes, mode]);

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draft) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { tool, color, pts: [{ x: e.clientX, y: e.clientY }] };
    setStrokes((s) => [...s, live.current!]);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s) return;
    const p = { x: e.clientX, y: e.clientY };
    if (s.tool === "pen" || s.tool === "highlight") s.pts.push(p);
    else s.pts[1] = p;
    setStrokes((xs) => [...xs.slice(0, -1), { ...s, pts: [...s.pts] }]);
  };
  const up = () => {
    live.current = null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (stage !== "review") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("textarea,input");
      if (e.key === "Escape") {
        if (draft) cancelDraft();
        else if (mode !== "browse") {
          setMode("browse");
          setStrokes([]);
        } else setDrawer(false);
        return;
      }
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveDraft();
        return;
      }
      if (draft || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") recording ? stopRecording() : recState !== "stopped" && recState !== "countdown" && startRecording();
      if (k === "p" && embeddable) setMode((m) => (m === "pin" ? "browse" : "pin"));
      if (k === "d") {
        setStrokes([]);
        setMode((m) => (m === "draw" ? "browse" : "draw"));
      }
      if (k === "n") openDraft({ kind: "note", x: null, y: null, at: nowSec(), shot: null, shotUrl: null });
      if (k === "l") setDrawer((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function enterReview() {
    setStage("review");
    if (!safeStorage("vs-fb-tour")) window.setTimeout(() => setTour(0), 900);
  }

  function endTour() {
    setTour(null);
    safeStorage("vs-fb-tour", "1");
  }

  function goConfirm() {
    if (recording) {
      setError("Stop the recording first, then send.");
      return;
    }
    if (!recBlob && !items.length) {
      setError("Record yourself, drop a pin or add a note first, so there's something for us to work on.");
      return;
    }
    setError(null);
    setStage("confirm");
  }

  async function submit() {
    setStage("sending");
    const allItems = extraNote.trim()
      ? [...items, { ref: nextRef("note"), kind: "note" as const, body: extraNote.trim(), x: null, y: null, at: null, shot: null, shotUrl: null }]
      : items;
    try {
      const uploaded: Record<string, string> = {};
      const shots = allItems.filter((i) => i.shot);
      const total = shots.length + (recBlob ? 4 : 0) + 1;
      let done = 0;
      for (const it of shots) {
        setProgress({ label: "Uploading your screenshots", pct: (done / total) * 100 });
        const r = await upload(`feedback/${linkId}/shot-${it.ref}.jpg`, it.shot!, { access: "private", handleUploadUrl: `/api/feedback/${token}/upload` });
        uploaded[it.ref] = r.url;
        done += 1;
      }
      let recordingUrl: string | null = null;
      if (recBlob) {
        const ext = recBlob.type.includes("mp4") ? "mp4" : "webm";
        const base = done;
        const r = await upload(`feedback/${linkId}/recording.${ext}`, recBlob, {
          access: "private",
          handleUploadUrl: `/api/feedback/${token}/upload`,
          multipart: recBlob.size > 8 * 1024 * 1024,
          onUploadProgress: (p) => setProgress({ label: "Uploading your recording", pct: ((base + (p.percentage / 100) * 4) / total) * 100 }),
        });
        recordingUrl = r.url;
        done += 4;
      }
      setProgress({ label: "Handing it to the team", pct: (done / total) * 100 });
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          consent: true,
          recording_url: recordingUrl,
          recording_kind: recBlob ? recKind : null,
          duration_seconds: recBlob ? Math.round(elapsed) : null,
          items: allItems.map((i) => ({ client_ref: i.ref, kind: i.kind, body: i.body, x: i.x, y: i.y, at_seconds: i.at, screenshot_url: uploaded[i.ref] ?? null })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Sending failed");
      setProgress({ label: "Sent", pct: 100 });
      sent.current = true;
      camStream.current?.getTracks().forEach((t) => t.stop());
      setCamOn(false);
      setStage("done");
    } catch (e) {
      setStage("confirm");
      setError(`${e instanceof Error ? e.message : "Sending failed"}. Nothing is lost. Check your connection and press Send again.`);
    }
  }

  const initials = brand.name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  // Wordmark logos (e.g. a 1000x110 header logo) render at full width instead of squashed into a square.
  const Logo = ({ size = 36 }: { size?: number }) =>
    brand.logo && logoWide ? (
      <img src={brand.logo} alt={brand.name} className="fb-logo-wide" style={{ height: Math.round(size * 0.62) }} />
    ) : brand.logo ? (
      <img src={brand.logo} alt={brand.name} width={size} height={size} className="fb-logo" style={{ width: size, height: size }} />
    ) : (
      <span className="fb-mono" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
        {initials}
      </span>
    );

  const counts = {
    pins: items.filter((i) => i.kind === "pin").length,
    drawings: items.filter((i) => i.kind === "drawing").length,
    notes: items.filter((i) => i.kind === "note").length,
  };

  const tourSteps = [
    { key: "rec", title: "Talk us through it", body: support.screen ? "Press Record and pick “This tab”. Then scroll and talk, like you would in a meeting." : "Press Record and talk while you scroll. On phones we record your voice." },
    { key: "pin", title: "Point at anything", body: "Press Pin, tap the exact spot, and say what should change." },
    { key: "draw", title: "Draw on the page", body: "Box a section or add an arrow, then add a short note." },
    { key: "send", title: "Send when you're done", body: "You'll see everything before it goes. That's it." },
  ];

  return (
    <div className="fb-root" style={theme}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={fontsHref} />
      <style>{CSS}</style>

      {stage === "intro" ? (
        <main className="fb-intro">
          <header className="fb-top">
            <div className="fb-brandline">
              <Logo />
              <div>
                {logoWide ? null : <div className="fb-brandname">{brand.name}</div>}
                <div className="fb-eyebrow">Proposal feedback</div>
              </div>
            </div>
            <span className="fb-powered">
              <ShieldCheck size={14} /> Private link
            </span>
          </header>

          <section className="fb-hero">
            <div className="fb-hero-copy">
              <p className="fb-eyebrow fb-accent-text">For {firstName}</p>
              <h1 className="fb-h1">Walk us through {/^(the|your|our)\b/i.test(title) ? title : `your ${title}`}.</h1>
              <p className="fb-lead">Go through it the way you would in a meeting. Talk, point and draw. Everything you share comes straight to the team as a clear list of changes.</p>
              <p className="fb-meta">
                <Clock size={15} /> About 5 to 10 minutes · nothing to install
              </p>
            </div>
            <DemoCard brand={brand} />
          </section>

          <ol className="fb-steps">
            {[
              [Mic, "Talk", support.screen ? "Press Record, share this tab, and talk while you scroll." : "Press Record and talk while you scroll."],
              [MapPin, "Pin", "Pin the exact spot that needs to change."],
              [PenLine, "Draw", "Box or arrow anything, then add a quick note."],
              [Send, "Send", "Review everything, then send it to the team."],
            ].map(([Icon, h, d], i) => {
              const I = Icon as typeof Mic;
              return (
                <li key={h as string} className="fb-step" style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <span className="fb-step-n">{i + 1}</span>
                  <I size={18} className="fb-accent-text" />
                  <span className="fb-step-h">{h as string}</span>
                  <span className="fb-step-d">{d as string}</span>
                </li>
              );
            })}
          </ol>

          <section className="fb-setup">
            <div className="fb-setup-row">
              <div className="fb-setup-item">
                {support.screen ? <Monitor size={18} /> : <Smartphone size={18} />}
                <span>{support.screen ? "Screen and voice recording ready" : "Voice recording on this device. Use a laptop to record your screen too."}</span>
              </div>
              <div className="fb-setup-item">
                <Mic size={18} />
                {micTest === "idle" ? (
                  <button type="button" className="fb-link" onClick={testMic}>
                    Test your microphone
                  </button>
                ) : micTest === "on" ? (
                  <span className="fb-meter-wrap">
                    Say something… <Meter level={level} />
                  </span>
                ) : micTest === "ok" ? (
                  <span className="fb-ok">
                    <Check size={15} /> Microphone works
                  </span>
                ) : (
                  <span className="fb-warn">Microphone blocked. Allow it in your browser’s address bar, or use pins and notes.</span>
                )}
              </div>
            </div>
          </section>

          <label className="fb-consent" htmlFor="fb-consent">
            <input id="fb-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree that Vantage Stack may record my screen and voice while I review this proposal, and use AI (Google Gemini) to turn it into a list of changes. It’s only used for this proposal, stored privately, and deleted on request. Recording is optional.
            </span>
          </label>

          <div className="fb-cta-row">
            <button type="button" className="fb-btn fb-btn-primary fb-btn-lg" disabled={!consent} onClick={enterReview}>
              Start reviewing <ArrowRight size={18} />
            </button>
            {!embeddable ? <p className="fb-note">This proposal opens in its own tab. Keep this page open for your tools, and share your entire screen when you record.</p> : null}
          </div>
          <footer className="fb-foot">Feedback room by Vantage Stack</footer>
        </main>
      ) : null}

      {stage === "done" ? (
        <main className="fb-done">
          <Logo size={44} />
          <span className="fb-done-check">
            <CircleCheck size={40} />
          </span>
          <h1 className="fb-h1">Thank you, {firstName}. We’ve got it.</h1>
          <p className="fb-lead">
            {(() => {
              const c = `${items.length} ${items.length === 1 ? "comment" : "comments"}`;
              if (recBlob && items.length) return `Your ${fmt(elapsed)} walkthrough and ${c} are with the team.`;
              if (recBlob) return `Your ${fmt(elapsed)} walkthrough is with the team.`;
              return `Your ${c} ${items.length === 1 ? "is" : "are"} with the team.`;
            })()}
          </p>
          <ol className="fb-timeline">
            <li>
              <b>Now</b> We turn everything you said and marked into a list of changes.
            </li>
            <li>
              <b>Next</b> The team works through each point.
            </li>
            <li>
              <b>Then</b> We send you the updated proposal.
            </li>
          </ol>
          <button
            type="button"
            className="fb-btn fb-btn-ghost"
            onClick={() => {
              sent.current = false;
              setItems([]);
              discardRecording();
              setExtraNote("");
              setStage("review");
            }}
          >
            Add more feedback
          </button>
        </main>
      ) : null}

      {stage === "review" || stage === "confirm" || stage === "sending" ? (
        <main className="fb-stagewrap">
          {embeddable ? (
            <iframe src={proposalUrl} title={title} className="fb-frame" />
          ) : (
            <div className="fb-noembed">
              <Logo size={40} />
              <p>This proposal can’t be shown inside this page. Start recording here and share your entire screen, then open the proposal and talk us through it.</p>
              <a href={proposalUrl} target="_blank" rel="noreferrer" className="fb-btn fb-btn-primary">
                Open the proposal <ArrowRight size={16} />
              </a>
            </div>
          )}

          {mode === "pin" && !draft ? (
            <div className="fb-pinlayer" onClick={onPinClick} role="presentation">
              <p className="fb-hint">
                <MapPin size={15} /> Click the spot you want to comment on · Esc to cancel
              </p>
            </div>
          ) : null}

          {mode === "draw" ? (
            <>
              <canvas ref={canvasRef} className="fb-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
              {!draft ? (
                <div className="fb-drawbar">
                  {(
                    [
                      ["box", RectangleHorizontal, "Box"],
                      ["arrow", MoveUpRight, "Arrow"],
                      ["pen", PenLine, "Pen"],
                      ["highlight", Highlighter, "Highlight"],
                    ] as const
                  ).map(([t, I, label]) => (
                    <button key={t} type="button" title={label} aria-label={label} className={`fb-icon ${tool === t ? "is-on" : ""}`} onClick={() => setTool(t)}>
                      <I size={17} />
                    </button>
                  ))}
                  <span className="fb-sep" />
                  {[brand.highlight, brand.accent, "#f5c400", brand.mode === "light" ? "#111111" : "#ffffff"].map((c) => (
                    <button key={c} type="button" aria-label={`Colour ${c}`} className={`fb-swatch ${color === c ? "is-on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
                  ))}
                  <span className="fb-sep" />
                  <button type="button" className="fb-icon" title="Undo" aria-label="Undo" onClick={() => setStrokes((s) => s.slice(0, -1))}>
                    <Undo2 size={17} />
                  </button>
                  <button type="button" className="fb-icon" title="Clear" aria-label="Clear" onClick={() => setStrokes([])}>
                    <Eraser size={17} />
                  </button>
                  <button type="button" className="fb-btn fb-btn-primary fb-btn-sm" onClick={finishDrawing}>
                    Done
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {items
            .filter((i) => i.kind === "pin" && i.x != null)
            .slice(-1)
            .map((i) => (
              <span key={i.ref} className="fb-pin fb-pin-fade" style={{ left: `${i.x}%`, top: `${i.y}%` }}>
                {items.filter((x) => x.kind === "pin").indexOf(i) + 1}
              </span>
            ))}
          {draft?.kind === "pin" && draft.x != null && !editingRef ? (
            <span className="fb-pin" style={{ left: `${draft.x}%`, top: `${draft.y}%` }}>
              {counts.pins + 1}
            </span>
          ) : null}

          {draft ? (
            <div
              className="fb-composer"
              style={
                draft.kind === "pin" && draft.x != null && !support.mobile
                  ? {
                      left: `clamp(16px, calc(${draft.x}% - 170px), calc(100% - 356px))`,
                      top: draft.y! > 40 ? undefined : `calc(${draft.y}% + 28px)`,
                      bottom: draft.y! > 40 ? `calc(${100 - draft.y!}% + 28px)` : undefined,
                    }
                  : undefined
              }
              role="dialog"
              aria-label="Add your comment"
            >
              <div className="fb-composer-h">
                <span>{editingRef ? `Edit ${editingRef}` : draft.kind === "pin" ? "What should change here?" : draft.kind === "drawing" ? "What does this mean?" : "Add a note"}</span>
                {draft.at != null ? <span className="fb-chip">at {fmt(draft.at)}</span> : null}
              </div>
              {draft.shotUrl ? <img src={draft.shotUrl} alt="Snapshot of what you marked" className="fb-shot" /> : null}
              <div className="fb-tags">
                {TAGS.map((t) => (
                  <button key={t} type="button" className={`fb-tag ${draftTag === t ? "is-on" : ""}`} onClick={() => setDraftTag(draftTag === t ? null : t)}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                id="fb-draft"
                ref={draftBox}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={3}
                className="fb-input"
                placeholder={draft.kind === "note" ? "Type your feedback" : "Optional, but it helps us get it right"}
              />
              <div className="fb-composer-f">
                <span className="fb-kbd-hint">
                  <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save
                </span>
                <div className="fb-row">
                  <button type="button" className="fb-btn fb-btn-ghost fb-btn-sm" onClick={cancelDraft}>
                    Cancel
                  </button>
                  <button type="button" className="fb-btn fb-btn-primary fb-btn-sm" onClick={saveDraft} disabled={draft.kind === "note" && !draftText.trim() && !draftTag}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {camOn ? (
            <div
              className="fb-cam"
              style={{ left: camPos.x, bottom: camPos.y }}
              onPointerDown={(e) => {
                const origin = { px: e.clientX, py: e.clientY, x: camPos.x, y: camPos.y };
                const onMove = (m: PointerEvent) =>
                  setCamPos({ x: Math.max(8, origin.x + (m.clientX - origin.px)), y: Math.max(8, origin.y - (m.clientY - origin.py)) });
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            >
              <video ref={camVideo} muted playsInline className="fb-cam-v" />
            </div>
          ) : null}

          {recState === "recording" && captionsOn && caption ? <div className="fb-caption">{caption}</div> : null}

          {recState === "countdown" ? (
            <div className="fb-countdown" aria-live="assertive">
              <span key={count}>{count}</span>
              <p>Recording starts. Just talk us through it.</p>
            </div>
          ) : null}

          {drawer ? (
            <aside className="fb-drawer" aria-label="Your feedback">
              <div className="fb-drawer-h">
                <span>Your feedback</span>
                <button type="button" className="fb-icon" aria-label="Close" onClick={() => setDrawer(false)}>
                  <X size={17} />
                </button>
              </div>
              {recBlob && recUrl ? (
                <div className="fb-card">
                  <div className="fb-card-h">
                    <span>
                      <Mic size={14} /> Recording · {fmt(elapsed)}
                    </span>
                    <button type="button" className="fb-icon" aria-label="Delete recording" onClick={discardRecording}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {recKind === "audio" ? <audio controls src={recUrl} className="fb-media" /> : <video controls src={recUrl} className="fb-media" />}
                </div>
              ) : null}
              {!items.length && !recBlob ? <p className="fb-muted">Nothing yet. Record, pin, draw or add a note, and it shows up here.</p> : null}
              {items.map((i) => (
                <div key={i.ref} className="fb-card">
                  <div className="fb-card-h">
                    <span>
                      {i.kind === "pin" ? <MapPin size={14} /> : i.kind === "drawing" ? <PenLine size={14} /> : <MessageSquareText size={14} />} {i.ref}
                      {i.at != null ? <em className="fb-chip">{fmt(i.at)}</em> : null}
                    </span>
                    <span className="fb-row">
                      <button type="button" className="fb-link" onClick={() => editItem(i)}>
                        Edit
                      </button>
                      <button type="button" className="fb-icon" aria-label={`Delete ${i.ref}`} onClick={() => setItems((xs) => xs.filter((x) => x.ref !== i.ref))}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                  {i.shotUrl ? <img src={i.shotUrl} alt="" className="fb-shot" /> : null}
                  <p className="fb-card-b">{i.body || <span className="fb-muted">No text</span>}</p>
                </div>
              ))}
            </aside>
          ) : null}

          <nav className="fb-dock" aria-label="Feedback tools">
            {recState === "recording" || recState === "paused" ? (
              <div className="fb-recgroup">
                <span className={`fb-recdot ${recState === "paused" ? "is-paused" : ""}`} />
                <span className="fb-timer">{fmt(elapsed)}</span>
                <Meter level={recState === "paused" ? 0 : level} small />
                <button type="button" className="fb-icon" aria-label={recState === "paused" ? "Resume" : "Pause"} title={recState === "paused" ? "Resume" : "Pause"} onClick={pauseResume}>
                  {recState === "paused" ? <Play size={17} /> : <Pause size={17} />}
                </button>
                <button type="button" className="fb-icon fb-stop" aria-label="Stop recording" title="Stop (R)" onClick={stopRecording}>
                  <Square size={15} />
                </button>
              </div>
            ) : recState === "stopped" ? (
              <button type="button" className="fb-tool" onClick={() => setDrawer(true)}>
                <span className="fb-ok">
                  <Check size={16} />
                </span>
                <span>{fmt(elapsed)} recorded</span>
              </button>
            ) : (
              <button
                ref={(el) => {
                  dockRefs.current.rec = el;
                }}
                type="button"
                className="fb-tool fb-tool-rec"
                onClick={startRecording}
                disabled={recState === "countdown"}
                title="Record (R)"
              >
                <span className="fb-recdot-idle" />
                <span>{support.screen ? "Record" : "Record voice"}</span>
              </button>
            )}
            <span className="fb-sep" />
            <button
              ref={(el) => {
                dockRefs.current.pin = el;
              }}
              type="button"
              className={`fb-tool ${mode === "pin" ? "is-on" : ""}`}
              onClick={() => setMode(mode === "pin" ? "browse" : "pin")}
              disabled={!embeddable}
              title="Pin (P)"
            >
              <MapPin size={17} />
              <span>Pin</span>
            </button>
            <button
              ref={(el) => {
                dockRefs.current.draw = el;
              }}
              type="button"
              className={`fb-tool ${mode === "draw" ? "is-on" : ""}`}
              onClick={() => {
                setStrokes([]);
                setMode(mode === "draw" ? "browse" : "draw");
              }}
              title="Draw (D)"
            >
              <PenLine size={17} />
              <span>Draw</span>
            </button>
            <button type="button" className="fb-tool" onClick={() => openDraft({ kind: "note", x: null, y: null, at: nowSec(), shot: null, shotUrl: null })} title="Note (N)">
              <MessageSquareText size={17} />
              <span>Note</span>
            </button>
            {recording && support.captions ? (
              <button type="button" className={`fb-icon ${captionsOn ? "is-on" : ""}`} aria-label="Live captions" title="Live captions" onClick={() => setCaptionsOn((v) => !v)}>
                <Captions size={17} />
              </button>
            ) : null}
            {support.screen ? (
              <button type="button" className={`fb-icon ${camOn ? "is-on" : ""}`} aria-label={camOn ? "Hide my camera" : "Show my face"} title={camOn ? "Hide my camera" : "Show my face in a bubble"} onClick={toggleCam}>
                {camOn ? <Video size={17} /> : <VideoOff size={17} />}
              </button>
            ) : null}
            <span className="fb-sep" />
            <button type="button" className={`fb-tool ${drawer ? "is-on" : ""}`} onClick={() => setDrawer((v) => !v)} title="Your feedback (L)">
              <ListChecks size={17} />
              <span className="fb-badge">{items.length + (recBlob ? 1 : 0)}</span>
            </button>
            <button
              ref={(el) => {
                dockRefs.current.send = el;
              }}
              type="button"
              className="fb-btn fb-btn-primary"
              onClick={goConfirm}
            >
              Send <Send size={15} />
            </button>
          </nav>

          {!support.mobile ? (
            <div className="fb-shortcuts" title="Keyboard shortcuts">
              <Keyboard size={13} /> <kbd>R</kbd> record <kbd>P</kbd> pin <kbd>D</kbd> draw <kbd>N</kbd> note
            </div>
          ) : null}

          {tour != null ? <Tour step={tourSteps[tour]} index={tour} total={tourSteps.length} anchor={dockRefs.current[tourSteps[tour].key]} onNext={() => (tour + 1 < tourSteps.length ? setTour(tour + 1) : endTour())} onSkip={endTour} /> : null}

          {stage === "confirm" || stage === "sending" ? (
            <div className="fb-modal-bg">
              <div className="fb-modal" role="dialog" aria-label="Review and send">
                {stage === "sending" ? (
                  <div className="fb-sending">
                    <LoaderCircle size={28} className="fb-spin fb-accent-text" />
                    <p>{progress.label}…</p>
                    <div className="fb-bar">
                      <i style={{ width: `${Math.max(4, progress.pct)}%` }} />
                    </div>
                    <p className="fb-muted">Please keep this page open.</p>
                  </div>
                ) : (
                  <>
                    <h2 className="fb-h2">Ready to send?</h2>
                    <p className="fb-muted">Here’s everything the team will receive.</p>
                    <div className="fb-summary">
                      {recBlob ? (
                        <span>
                          <Mic size={15} /> {fmt(elapsed)} recording
                        </span>
                      ) : null}
                      {counts.pins ? (
                        <span>
                          <MapPin size={15} /> {counts.pins} {counts.pins === 1 ? "pin" : "pins"}
                        </span>
                      ) : null}
                      {counts.drawings ? (
                        <span>
                          <PenLine size={15} /> {counts.drawings} {counts.drawings === 1 ? "drawing" : "drawings"}
                        </span>
                      ) : null}
                      {counts.notes ? (
                        <span>
                          <MessageSquareText size={15} /> {counts.notes} {counts.notes === 1 ? "note" : "notes"}
                        </span>
                      ) : null}
                    </div>
                    {recUrl ? recKind === "audio" ? <audio controls src={recUrl} className="fb-media" /> : <video controls src={recUrl} className="fb-media fb-media-lg" /> : null}
                    <label className="fb-label" htmlFor="fb-extra">
                      Anything else you’d like us to know?
                    </label>
                    <textarea id="fb-extra" className="fb-input" rows={3} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Optional" />
                    {error ? <p className="fb-error">{error}</p> : null}
                    <div className="fb-row fb-row-end">
                      <button type="button" className="fb-btn fb-btn-ghost" onClick={() => setStage("review")}>
                        Keep reviewing
                      </button>
                      <button type="button" className="fb-btn fb-btn-primary" onClick={submit}>
                        Send to the team <Send size={15} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {error && stage === "review" ? (
            <div className="fb-error-banner" role="alert">
              <span>{error}</span>
              <button type="button" className="fb-icon" aria-label="Dismiss" onClick={() => setError(null)}>
                <X size={16} />
              </button>
            </div>
          ) : null}
          {toast ? (
            <div className="fb-toast" role="status">
              <Check size={15} /> {toast}
            </div>
          ) : null}
        </main>
      ) : null}
    </div>
  );
}

function Meter({ level, small }: { level: number; small?: boolean }) {
  const bars = small ? 5 : 8;
  return (
    <span className={`fb-meter ${small ? "is-small" : ""}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} className={level * bars > i ? "is-on" : ""} />
      ))}
    </span>
  );
}

function Tour({ step, index, total, anchor, onNext, onSkip }: { step: { title: string; body: string }; index: number; total: number; anchor: HTMLElement | null | undefined; onNext: () => void; onSkip: () => void }) {
  const r = anchor?.getBoundingClientRect();
  const left = r ? Math.min(Math.max(16, r.left + r.width / 2 - 150), window.innerWidth - 316) : window.innerWidth / 2 - 150;
  const bottom = r ? window.innerHeight - r.top + 14 : 110;
  const arrow = r ? Math.min(284, Math.max(16, r.left + r.width / 2 - left)) : 150;
  return (
    <div className="fb-tour" style={{ left, bottom, ["--fb-arrow" as string]: `${arrow}px` }} role="dialog" aria-label="Quick tour">
      <p className="fb-eyebrow fb-accent-text">
        Quick tour · {index + 1} of {total}
      </p>
      <p className="fb-tour-h">{step.title}</p>
      <p className="fb-tour-b">{step.body}</p>
      <div className="fb-row fb-row-end">
        <button type="button" className="fb-link" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="fb-btn fb-btn-primary fb-btn-sm" onClick={onNext}>
          {index + 1 === total ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}

/** A small looping illustration of the three tools, drawn in the client's own colours. */
function DemoCard({ brand }: { brand: FeedbackBrand }) {
  return (
    <div className="fb-demo" aria-hidden>
      <div className="fb-demo-bar">
        <i />
        <i />
        <i />
      </div>
      <div className="fb-demo-page">
        <div className="fb-demo-line w70" />
        <div className="fb-demo-line w45" />
        <div className="fb-demo-box">
          <svg viewBox="0 0 200 60" preserveAspectRatio="none">
            <rect x="3" y="3" width="194" height="54" rx="4" fill="none" stroke={brand.highlight} strokeWidth="3" className="fb-demo-draw" />
          </svg>
        </div>
        <div className="fb-demo-cards">
          <span />
          <span className="fb-demo-target" />
          <span />
        </div>
        <span className="fb-demo-pin">1</span>
        <span className="fb-demo-bubble">Make this simpler</span>
      </div>
      <div className="fb-demo-dock">
        <span className="fb-demo-rec" /> 0:42 <Mic size={12} /> <MapPin size={12} /> <PenLine size={12} />
      </div>
    </div>
  );
}

function paint(g: CanvasRenderingContext2D, strokes: Stroke[]) {
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const s of strokes) {
    const [a, b] = s.pts;
    if (!a) continue;
    g.save();
    g.strokeStyle = s.color;
    g.lineWidth = s.tool === "highlight" ? 18 : 4;
    g.globalAlpha = s.tool === "highlight" ? 0.35 : 1;
    g.beginPath();
    if (s.tool === "pen" || s.tool === "highlight") {
      g.moveTo(a.x, a.y);
      for (const p of s.pts.slice(1)) g.lineTo(p.x, p.y);
    } else if (b && s.tool === "box") {
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (b && s.tool === "arrow") {
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (const d of [-0.5, 0.5]) {
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - 18 * Math.cos(ang + d), b.y - 18 * Math.sin(ang + d));
      }
    }
    g.stroke();
    g.restore();
  }
}

const CSS = `
.fb-root{position:fixed;inset:0;overflow:auto;background:var(--fb-bg);color:var(--fb-text);font-family:var(--fb-body);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.fb-root *{box-sizing:border-box}
.fb-root button{font:inherit;color:inherit;cursor:pointer}
.fb-root button:disabled{cursor:not-allowed;opacity:.45}
.fb-root :focus-visible{outline:2px solid var(--fb-hl);outline-offset:2px}
.fb-accent-text{color:var(--fb-hl)}
.fb-eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--fb-muted);margin:0}
.fb-muted{color:var(--fb-muted);font-size:13.5px;margin:0}
.fb-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fb-row-end{justify-content:flex-end}
.fb-link{background:none;border:0;padding:0;text-decoration:underline;text-underline-offset:3px;color:var(--fb-text);font-size:13.5px}
.fb-ok{display:inline-flex;align-items:center;gap:6px;color:#2f9e5b}
.fb-warn{color:#c0292b;font-size:13.5px}
.fb-chip{font-style:normal;font-size:11px;font-variant-numeric:tabular-nums;border:1px solid var(--fb-border);border-radius:999px;padding:1px 8px;color:var(--fb-muted);margin-left:6px}
kbd{font-family:ui-monospace,Menlo,monospace;font-size:11px;border:1px solid var(--fb-border);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:var(--fb-surface);color:var(--fb-text)}

.fb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--fb-radius);border:1px solid transparent;padding:10px 16px;font-weight:600;font-size:14px;transition:transform .15s ease,background .15s ease,box-shadow .15s ease;white-space:nowrap}
.fb-btn:active{transform:translateY(1px)}
.fb-btn-primary{background:var(--fb-accent);color:var(--fb-accent-text)}
.fb-btn-primary:hover:not(:disabled){box-shadow:0 6px 20px -8px var(--fb-accent)}
.fb-btn-ghost{background:transparent;border-color:var(--fb-border);color:var(--fb-text)}
.fb-btn-ghost:hover{background:color-mix(in srgb,var(--fb-text) 6%,transparent)}
.fb-btn-sm{padding:7px 12px;font-size:13px}
.fb-btn-lg{padding:14px 22px;font-size:16px}
.fb-icon{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:calc(var(--fb-radius) + 2px);background:transparent;border:0;color:var(--fb-text)}
.fb-icon:hover,.fb-icon.is-on{background:color-mix(in srgb,var(--fb-text) 9%,transparent)}
.fb-icon.is-on{color:var(--fb-hl)}
.fb-sep{width:1px;align-self:stretch;margin:6px 2px;background:var(--fb-border)}

/* intro */
.fb-intro{max-width:1080px;margin:0 auto;padding:28px 20px 40px;display:grid;gap:28px}
.fb-top{display:flex;justify-content:space-between;align-items:center;gap:12px}
.fb-brandline{display:flex;gap:12px;align-items:center}
.fb-brandname{font-family:var(--fb-display);font-weight:700;font-size:17px;letter-spacing:-.01em}
.fb-logo{object-fit:contain;border-radius:calc(var(--fb-radius) + 2px)}
.fb-logo-wide{width:auto;max-width:min(260px,60vw);object-fit:contain;display:block}
.fb-brandline:has(.fb-logo-wide){flex-direction:column;align-items:flex-start;gap:8px}
.fb-mono{display:inline-grid;place-items:center;border-radius:999px;background:var(--fb-hl);color:#fff;font-family:var(--fb-display);font-weight:700}
.fb-powered{display:inline-flex;gap:6px;align-items:center;font-size:12.5px;color:var(--fb-muted);border:1px solid var(--fb-border);border-radius:999px;padding:5px 11px}
.fb-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;padding-top:12px}
.fb-hero-copy{display:grid;gap:16px;min-width:0}
.fb-h1{font-family:var(--fb-display);font-weight:700;font-size:clamp(30px,4.6vw,54px);line-height:1.04;letter-spacing:-.025em;margin:0;text-wrap:balance}
.fb-h2{font-family:var(--fb-display);font-weight:700;font-size:24px;letter-spacing:-.015em;margin:0}
.fb-lead{font-size:17px;color:var(--fb-muted);margin:0;max-width:56ch}
.fb-meta{display:inline-flex;gap:8px;align-items:center;font-size:13.5px;color:var(--fb-muted);margin:0}
.fb-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--fb-border);border:1px solid var(--fb-border);border-radius:var(--fb-radius);overflow:hidden}
.fb-step{background:var(--fb-surface);padding:18px;display:grid;gap:6px;align-content:start;position:relative;animation:fbRise .5s ease both}
.fb-step-n{position:absolute;top:14px;right:16px;font-size:11px;color:var(--fb-muted);font-variant-numeric:tabular-nums}
.fb-step-h{font-family:var(--fb-display);font-weight:700;font-size:17px}
.fb-step-d{font-size:13.5px;color:var(--fb-muted)}
.fb-setup{border:1px solid var(--fb-border);border-radius:var(--fb-radius);background:var(--fb-surface);padding:14px 18px}
.fb-setup-row{display:flex;flex-wrap:wrap;gap:12px 32px}
.fb-setup-item{display:flex;gap:10px;align-items:center;font-size:14px;min-width:0}
.fb-meter-wrap{display:inline-flex;gap:10px;align-items:center;color:var(--fb-muted)}
.fb-consent{display:flex;gap:12px;align-items:flex-start;font-size:13.5px;color:var(--fb-muted);max-width:760px;cursor:pointer}
.fb-consent input{margin-top:3px;width:18px;height:18px;accent-color:var(--fb-accent);flex:none}
.fb-cta-row{display:grid;gap:10px;justify-items:start}
.fb-note{font-size:13px;color:var(--fb-muted);margin:0;max-width:60ch}
.fb-foot{font-size:12px;color:var(--fb-muted);padding-top:8px;border-top:1px solid var(--fb-border)}

/* demo illustration */
.fb-demo{position:relative;border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 6px);background:var(--fb-surface);box-shadow:0 30px 60px -30px rgba(0,0,0,.35);overflow:hidden;aspect-ratio:4/3.1}
.fb-demo-bar{display:flex;gap:5px;padding:9px 11px;border-bottom:1px solid var(--fb-border)}
.fb-demo-bar i{width:8px;height:8px;border-radius:50%;background:var(--fb-border)}
.fb-demo-page{position:relative;padding:18px;display:grid;gap:9px}
.fb-demo-line{height:10px;border-radius:3px;background:color-mix(in srgb,var(--fb-text) 14%,transparent)}
.fb-demo-line.w70{width:70%;height:16px;background:color-mix(in srgb,var(--fb-text) 22%,transparent)}.fb-demo-line.w45{width:45%}
.fb-demo-box{position:relative;height:44px;border-radius:4px;background:color-mix(in srgb,var(--fb-hl) 10%,transparent)}
.fb-demo-box svg{position:absolute;inset:-5px;width:calc(100% + 10px);height:calc(100% + 10px)}
.fb-demo-draw{stroke-dasharray:520;stroke-dashoffset:520;animation:fbDraw 6s ease-in-out infinite}
.fb-demo-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fb-demo-cards span{height:58px;border-radius:4px;border:1px solid var(--fb-border);background:var(--fb-bg)}
.fb-demo-pin{position:absolute;right:30%;bottom:22px;width:24px;height:24px;border-radius:50%;background:var(--fb-hl);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;border:2px solid #fff;animation:fbPin 6s ease-in-out infinite}
.fb-demo-bubble{position:absolute;right:6%;bottom:52px;font-size:11.5px;background:var(--fb-text);color:var(--fb-bg);padding:5px 9px;border-radius:6px;animation:fbBubble 6s ease-in-out infinite}
.fb-demo-dock{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;font-size:11px;font-variant-numeric:tabular-nums;background:var(--fb-bg);border:1px solid var(--fb-border);padding:4px 10px;border-radius:999px;color:var(--fb-muted)}
.fb-demo-rec{width:7px;height:7px;border-radius:50%;background:#e5484d;animation:fbBlink 1.2s infinite}
@keyframes fbDraw{0%,8%{stroke-dashoffset:520}30%,100%{stroke-dashoffset:0}}
@keyframes fbPin{0%,40%{transform:scale(0)}48%{transform:scale(1.2)}54%,100%{transform:scale(1)}}
@keyframes fbBubble{0%,55%{opacity:0;transform:translateY(6px)}63%,92%{opacity:1;transform:none}100%{opacity:0}}
@keyframes fbBlink{50%{opacity:.25}}
@keyframes fbRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* review */
.fb-stagewrap{position:fixed;inset:0;background:var(--fb-bg)}
.fb-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.fb-noembed{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:16px;text-align:center;padding:24px;max-width:520px;margin:0 auto;color:var(--fb-muted)}
.fb-pinlayer{position:absolute;inset:0;cursor:crosshair;background:color-mix(in srgb,var(--fb-hl) 6%,transparent)}
.fb-canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none}
.fb-hint{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;gap:7px;align-items:center;background:var(--fb-text);color:var(--fb-bg);padding:8px 14px;border-radius:999px;font-size:13px;margin:0;pointer-events:none;box-shadow:0 10px 30px -10px rgba(0,0,0,.5)}
.fb-drawbar{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;gap:2px;align-items:center;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 6px);padding:5px;box-shadow:0 16px 40px -16px rgba(0,0,0,.45)}
.fb-swatch{width:22px;height:22px;border-radius:50%;border:2px solid var(--fb-surface);box-shadow:0 0 0 1px var(--fb-border);margin:0 3px}
.fb-swatch.is-on{box-shadow:0 0 0 2px var(--fb-text)}
.fb-pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;background:var(--fb-hl);color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 6px 16px -4px rgba(0,0,0,.5);pointer-events:none;animation:fbPop .3s cubic-bezier(.3,1.6,.5,1)}
.fb-pin-fade{animation:fbPop .3s cubic-bezier(.3,1.6,.5,1),fbFade 4s 1s forwards}
@keyframes fbPop{from{transform:translate(-50%,-50%) scale(0)}to{transform:translate(-50%,-50%) scale(1)}}
@keyframes fbFade{to{opacity:0}}
.fb-composer{position:absolute;left:50%;bottom:96px;transform:none;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow:auto;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 6px);padding:14px;display:grid;gap:10px;box-shadow:0 24px 60px -20px rgba(0,0,0,.55);animation:fbRise .2s ease both}
.fb-composer:not([style]){left:50%;transform:translateX(-50%)}
.fb-composer-h{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px}
.fb-composer-f{display:flex;justify-content:space-between;align-items:center;gap:8px}
.fb-kbd-hint{font-size:11.5px;color:var(--fb-muted)}
.fb-shot{width:100%;max-height:150px;object-fit:cover;object-position:top;border-radius:var(--fb-radius);border:1px solid var(--fb-border)}
.fb-tags{display:flex;flex-wrap:wrap;gap:6px}
.fb-tag{font-size:12px;border:1px solid var(--fb-border);background:transparent;border-radius:999px;padding:3px 10px;color:var(--fb-muted)}
.fb-tag.is-on{background:var(--fb-accent);color:var(--fb-accent-text);border-color:transparent}
.fb-input{width:100%;resize:vertical;font:inherit;font-size:14px;color:var(--fb-text);background:var(--fb-bg);border:1px solid var(--fb-border);border-radius:var(--fb-radius);padding:10px 12px;outline:none}
.fb-input:focus{border-color:var(--fb-hl);box-shadow:0 0 0 3px color-mix(in srgb,var(--fb-hl) 18%,transparent)}
.fb-label{font-size:13.5px;font-weight:600}
.fb-dock{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:2px;align-items:center;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 10px);padding:6px;box-shadow:0 20px 50px -18px rgba(0,0,0,.55);max-width:calc(100vw - 16px)}
.fb-tool{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 12px;border-radius:calc(var(--fb-radius) + 4px);background:transparent;border:0;font-size:13.5px;font-weight:600;color:var(--fb-text);position:relative}
.fb-tool:hover:not(:disabled),.fb-tool.is-on{background:color-mix(in srgb,var(--fb-text) 9%,transparent)}
.fb-tool.is-on{color:var(--fb-hl)}
.fb-recdot-idle{width:11px;height:11px;border-radius:50%;background:#e5484d;box-shadow:0 0 0 3px color-mix(in srgb,#e5484d 22%,transparent)}
.fb-recgroup{display:flex;align-items:center;gap:6px;padding:0 4px 0 10px}
.fb-recdot{width:10px;height:10px;border-radius:50%;background:#e5484d;animation:fbBlink 1.1s infinite}
.fb-recdot.is-paused{animation:none;background:var(--fb-muted)}
.fb-timer{font-variant-numeric:tabular-nums;font-weight:600;font-size:14px;min-width:42px}
.fb-stop{color:#e5484d}
.fb-badge{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--fb-accent);color:var(--fb-accent-text);font-size:11.5px;display:inline-grid;place-items:center;font-variant-numeric:tabular-nums}
.fb-meter{display:inline-flex;gap:2px;align-items:flex-end;height:18px}
.fb-meter i{width:4px;border-radius:2px;background:var(--fb-border);height:30%;transition:background .08s}
.fb-meter i:nth-child(2){height:45%}.fb-meter i:nth-child(3){height:60%}.fb-meter i:nth-child(4){height:75%}.fb-meter i:nth-child(n+5){height:90%}
.fb-meter i.is-on{background:#2f9e5b}
.fb-meter.is-small{height:14px}.fb-meter.is-small i{width:3px}
.fb-shortcuts{position:absolute;right:14px;bottom:24px;display:flex;gap:5px;align-items:center;font-size:11.5px;color:var(--fb-muted);background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:999px;padding:4px 10px;opacity:.85}
.fb-caption{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);max-width:min(680px,calc(100vw - 32px));background:rgba(0,0,0,.72);color:#fff;font-size:15px;padding:7px 14px;border-radius:8px;text-align:center}
.fb-countdown{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;background:color-mix(in srgb,var(--fb-bg) 70%,transparent);backdrop-filter:blur(4px)}
.fb-countdown span{font-family:var(--fb-display);font-weight:800;font-size:120px;line-height:1;color:var(--fb-hl);animation:fbCount .8s ease both}
.fb-countdown p{margin:0;color:var(--fb-text);font-size:16px}
@keyframes fbCount{from{transform:scale(1.4);opacity:0}30%{opacity:1}to{transform:scale(1);opacity:.9}}
.fb-cam{position:absolute;width:150px;height:150px;border-radius:50%;overflow:hidden;border:3px solid var(--fb-hl);box-shadow:0 14px 40px -10px rgba(0,0,0,.6);cursor:grab;touch-action:none;z-index:5}
.fb-cam-v{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.fb-drawer{position:absolute;top:12px;right:12px;bottom:84px;width:min(360px,calc(100vw - 24px));overflow-y:auto;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 8px);padding:14px;display:grid;align-content:start;gap:10px;box-shadow:0 24px 60px -20px rgba(0,0,0,.5);animation:fbSlide .22s ease both}
@keyframes fbSlide{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
.fb-drawer-h{display:flex;justify-content:space-between;align-items:center;font-family:var(--fb-display);font-weight:700;font-size:17px}
.fb-card{border:1px solid var(--fb-border);border-radius:var(--fb-radius);padding:10px;display:grid;gap:8px;background:var(--fb-bg)}
.fb-card-h{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600}
.fb-card-h>span:first-child{display:inline-flex;gap:6px;align-items:center}
.fb-card-b{margin:0;font-size:13.5px}
.fb-media{width:100%;border-radius:var(--fb-radius);background:#000}
.fb-media-lg{max-height:240px}
.fb-tour{position:absolute;width:300px;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 6px);padding:14px 16px;display:grid;gap:6px;box-shadow:0 24px 60px -18px rgba(0,0,0,.55);z-index:6;animation:fbRise .25s ease both}
.fb-tour::after{content:"";position:absolute;bottom:-7px;left:var(--fb-arrow,50%);width:12px;height:12px;background:var(--fb-surface);border-right:1px solid var(--fb-border);border-bottom:1px solid var(--fb-border);transform:translateX(-50%) rotate(45deg)}
.fb-tour-h{margin:0;font-family:var(--fb-display);font-weight:700;font-size:16px}
.fb-tour-b{margin:0 0 4px;font-size:13.5px;color:var(--fb-muted)}
.fb-modal-bg{position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;z-index:8}
.fb-modal{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) + 8px);padding:22px;display:grid;gap:14px;animation:fbRise .22s ease both}
.fb-summary{display:flex;flex-wrap:wrap;gap:8px}
.fb-summary span{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--fb-border);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600}
.fb-sending{display:grid;justify-items:center;gap:12px;text-align:center;padding:12px 0}
.fb-sending p{margin:0}
.fb-bar{width:100%;height:6px;border-radius:999px;background:var(--fb-border);overflow:hidden}
.fb-bar i{display:block;height:100%;background:var(--fb-accent);transition:width .3s ease}
.fb-spin{animation:fbSpin 1s linear infinite}
@keyframes fbSpin{to{transform:rotate(360deg)}}
.fb-error{color:#c0292b;font-size:13.5px;margin:0}
.fb-error-banner{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:min(560px,calc(100vw - 24px));display:flex;gap:10px;align-items:flex-start;justify-content:space-between;background:var(--fb-surface);border:1px solid #c0292b;color:var(--fb-text);border-radius:var(--fb-radius);padding:10px 12px;font-size:13.5px;z-index:9;box-shadow:0 16px 40px -16px rgba(0,0,0,.5)}
.fb-toast{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);display:flex;gap:7px;align-items:center;background:var(--fb-text);color:var(--fb-bg);font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:999px;animation:fbRise .2s ease both;z-index:9}

/* done */
.fb-done{min-height:100%;display:grid;place-content:center;justify-items:center;gap:18px;text-align:center;padding:40px 20px;max-width:640px;margin:0 auto}
.fb-done-check{color:#2f9e5b;animation:fbPopIn .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes fbPopIn{from{transform:scale(0)}to{transform:scale(1)}}
.fb-timeline{list-style:none;margin:6px 0 4px;padding:0;display:grid;gap:10px;text-align:left;width:100%;max-width:440px}
.fb-timeline li{display:grid;grid-template-columns:64px 1fr;gap:10px;font-size:14.5px;color:var(--fb-muted);border-top:1px solid var(--fb-border);padding-top:10px}
.fb-timeline b{color:var(--fb-text);font-family:var(--fb-display)}

@media (max-width:820px){
  .fb-hero{grid-template-columns:1fr;gap:24px}
  .fb-steps{grid-template-columns:1fr 1fr}
  .fb-demo{max-width:440px}
}
@media (max-width:640px){
  .fb-steps{grid-template-columns:1fr}
  .fb-dock{left:8px;right:8px;transform:none;justify-content:space-between;overflow-x:auto}
  .fb-tool span:not(.fb-badge):not(.fb-ok):not(.fb-recdot-idle){display:none}
  .fb-tool-rec span:last-child{display:inline!important}
  .fb-drawer{left:8px;right:8px;width:auto;top:auto;max-height:60vh}
  .fb-composer{left:8px!important;right:8px;width:auto;transform:none!important}
}
@media (prefers-reduced-motion:reduce){.fb-root *{animation:none!important;transition:none!important}}
`;
