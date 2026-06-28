# Isabel — the /blueprint transparent presence

The desktop `/blueprint` shows the **real olive Isabel**, **full-body**, keyed
**transparent** (VP9/alpha webm) with a gentle living motion, so she stands beside
the form and blends straight into the dark page — no card, no background. The live
agent does the talking; she's the visual presence.

**Fully automated — no Hedra, no manual upload, no token.**

| Asset | File |
|---|---|
| Transparent full-body clip | `public/videos/isabel-fullbody.webm` |
| Gemini full-body (generic face) | `public/images/isabel-fullbody-gemini.png` |
| Face-swapped (her face) | `public/images/isabel-fullbody-source.png` |
| Her face reference | `public/images/isabel-hedra-source.jpg` |

## Pipeline

1. **Gemini** generates a full-body businesswoman on a green screen (great body /
   suit / pose, but a generic face — image-gen won't take a face from a URL).
2. **Face-swap** her real olive face onto it (insightface `inswapper_128`):
   `python scripts/faceswap.py <her-face>.jpg <gemini-fullbody>.png <out>.png`
   → full-body figure with HER exact face.
3. **ffmpeg** keys the green to a **VP9/alpha webm** with the chroma-key shader
   math (de-spill + soft alpha — keeps the navy suit, removes only the green) and
   adds a subtle looping motion (gentle bob + micro-sway):
   ```
   KEY="format=rgba,geq=r='r(X,Y)':b='b(X,Y)':g='min(g(X,Y),max(r(X,Y),b(X,Y)))':a='st(0,g(X,Y)-max(r(X,Y),b(X,Y)));st(1,clip((ld(0)-4)/22,0,1));255*(1-ld(1)*ld(1)*(3-2*ld(1)))'"
   ffmpeg -i swapped.png -vf "crop=...,$KEY" keyed.png
   ffmpeg -loop 1 -t 6 -i keyed.png -vf "scale=...,crop=...:x='..sin(t)..':y='..sin(t)..',scale=460:-2,fps=30" \
     -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -an public/videos/isabel-fullbody.webm
   ```

## How it renders

`components/blueprint/IsabelIntro.tsx` loops the muted transparent webm in the
corner; the hero CTA reveals her + starts the live session (full greeting). Mobile
/ reduced-motion → live agent + poster band, no video. VP9 alpha = Chrome/Firefox
(Safari falls back to live agent + poster).

> History: Veo/text couldn't reproduce her olive face; OmniAvatar kept her face
> but only as a 5s close-up. The Gemini-body + insightface-face-swap route gives
> her exact face AND full-body, fully automated.
