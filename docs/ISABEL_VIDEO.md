# Isabel — the /blueprint transparent presence

The desktop `/blueprint` shows the **real olive Isabel**, AI-lip-synced to her own
ElevenLabs voice and keyed **transparent**, so she blends straight into the dark
page with no card or background. It's **fully automated** — no Hedra, no manual
upload, no token (uses a free HuggingFace Space).

| Asset | File | Source |
|---|---|---|
| Transparent talking clip | `public/videos/isabel-talk.webm` | OmniAvatar (HF) → ffmpeg key |
| Green-screen source | `public/images/isabel-hedra-green.jpg` | `isabel-avatar.jpg` cut onto #00b140 (rembg) |
| Welcome voiceover | `public/audio/isabel-welcome.mp3` | `scripts/make-isabel-welcome-audio.ts` (voice "Cay", same as live agent) |

## Pipeline (reproduce with one command)

```
python scripts/make-isabel-talk-video.py
```

1. **OmniAvatar** (`alexnasa/OmniAvatar` on HF, via `gradio_client`) lip-syncs the
   green-screen olive Isabel to her voiceover → talking Isabel on green (~5s; the
   model caps clip length, and free ZeroGPU caps duration — keep the audio ≤5s).
2. **ffmpeg** keys the green to a **VP9/alpha webm** using the chroma-key shader
   math (de-spill + soft alpha) — keeps her navy suit, removes only the green.
   (`scripts/key-isabel-transparent.sh` is the standalone keyer.)

To regenerate the voiceover (kept ≤5s so it fits one clip):
`node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-isabel-welcome-audio.ts`

## How it renders

`components/blueprint/IsabelIntro.tsx` plays the muted transparent webm in the
corner. It's **live-driven**: her mouth animates only while the live agent is
actually speaking (the `isabel:speaking` event) and rests when she's listening,
so the transparent video tracks the real voice's rhythm. The hero CTA reveals her
and starts the live session (full greeting). Mobile / reduced-motion → straight to
the live agent (poster band only), no video.

> History: an earlier full-body green-screen "hologram" (Veo) was retired — Veo
> text-to-video couldn't reproduce the canonical olive Isabel. OmniAvatar can,
> because it animates her actual photo.
