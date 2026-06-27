# Isabel — the /blueprint video assets

Two clips power the guided experience. They're generated in **logged-in browser
tools** (so they're a manual step — Claude can't sign in), but everything around
them is automated.

| Asset | File | Tool | Has audio? | Role |
|---|---|---|---|---|
| **Talking intro** *(optional)* | `public/videos/isabel_intro_talk.mp4` | **Hedra** (lip-sync) | ✅ her voice | Plays once on the hero CTA — she greets + starts the music, then hands off |
| **Standing presence** | `public/images/isabel-hedra-source.jpg` | — (framed portrait) | — | The olive Isabel sits beside the form during the live session (framed card, glows while she speaks) |

> NOTE: The earlier full-body green-screen "hologram" (Veo) was retired — Veo
> text-to-video can't reproduce the canonical olive Isabel, so the desktop
> presence is now a framed portrait of her (consistent with the avatar/poster).
> The WebGL chroma-key overlay was removed with it.

The two voices match because the talking intro is voiced by the **same ElevenLabs
voice** ("Cay", `voice_id TTY70JqFvDxeExufZ1za`) the live agent uses — see
`scripts/make-isabel-intro-audio.ts`.

---

## 1. Talking intro (Hedra)

**Inputs** (staged at `C:\tmp\isabel-hedra\`, also in repo):
- `public/images/isabel-hedra-source.jpg` — clean upper-body Isabel (navy feminine suit), cropped from `isabel-avatar.jpg` with the UI overlay removed.
- `public/audio/isabel-intro.mp3` — the voiceover. Regenerate after any script change:
  ```
  node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-isabel-intro-audio.ts
  ```

**Generate:** upload both into Hedra, prompt:
> Animate this portrait of the woman speaking the attached audio with accurate, natural lip-sync. Warm, friendly, professional delivery. Subtle head movement and gentle hand gestures, friendly eye contact with the camera. Keep her navy suit and the office background steady. Upper-body framing, photorealistic, no distortion of the face or hands.

**Install:**
```
scripts/process-isabel-intro.sh <downloaded-hedra-clip>.mp4
# but write the OUTPUT to public/videos/isabel_intro_talk.mp4 (talking, with audio)
```

## 2. Standing hologram (Veo / Gemini)

**Generate** (the green screen is **required** — `IsabelOverlay.tsx` keys it out live):
> Full-body cinematic shot of a warm South African woman, early 30s — olive skin, dark hair in a low bun, brown eyes, warm smile — in an elegant tailored navy feminine business suit. She stands facing camera against a solid, evenly-lit bright chroma-green screen (#00b140), full body head-to-toe with even space around her. She smiles and points with an open hand to her right (viewer's left), as if presenting a screen beside her, then settles to a relaxed neutral stance. Subtle idle motion — gentle breathing, slight nod. Soft even studio lighting, no shadows on the green, no props, no text, hands clean and fully visible. Static eye-level camera, photorealistic, seamlessly loopable, ~8 seconds.

**Install:**
```
scripts/process-isabel-intro.sh <downloaded-veo-clip>.mp4   # → public/videos/isabel_intro.mp4 + poster
```

---

## How they wire in (no code changes needed once the files land)

- `components/blueprint/IsabelTalkingIntro.tsx` plays `isabel_intro_talk.mp4` on the
  hero CTA, then dispatches `blueprint:start-voice { afterIntro: true }`. If the file
  is missing it falls straight through to the live agent (full greeting) — invisibly.
- `components/blueprint/IsabelOverlay.tsx` chroma-keys `isabel_intro.mp4` as the
  standing hologram (appears once the live session begins).
- The live agent's first line is shortened after the intro
  (`ISABEL_BLUEPRINT_FIRST_MESSAGE_AFTER_INTRO`) so it doesn't re-greet.
