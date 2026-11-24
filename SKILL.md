---
name: gesture-intro-video
description: Turn a Figma storyboard and a script into a self-recorded talking-head video — the speaker appears on webcam, brings their work into frame with hand gestures, and explains it with Figma-style UI motion (selection boxes, auto layout, named cursors, kinetic type), one sentence per scene, recorded live in the browser with a teleprompter. Use for application, portfolio or self-introduction videos, or to animate Figma storyboard frames over a webcam.
---

# Gesture intro video

A 60–120 s self-introduction video. The speaker talks to camera; their work is lifted into frame, explained with Figma's visual language, and put away. One local web page; the speaker records it themselves, one sentence at a time.

Files:
- `template/` — the recording engine (Vite + TypeScript + MediaPipe). Start every build from it.
- `references/figma-storyboard.md` — building the storyboard in Figma and replicating it in code.
- `references/scenes-schema.md` — scene data, moves, keys.
- `references/recording.md` — how to record.
- `references/lessons.md` — known pitfalls. Read before building.

Work one step at a time and stop for the person to review. They direct; you build.

## 1. Brief
- Ask: purpose, deadline, audience, length limit, the 3–5 things the video must prove, which work can be shown.
- Script: one sentence per scene, 12–16 scenes for 90 s.
- Write a short style profile from their portfolio (type, colours, motion, things to avoid) and confirm it.
- Keep private material (application answers, personal notes) in a git-ignored `context.md`.
- Numbers on screen must be true and match their CV.

## 2. Rhythm
- Mark each scene **camera** or **canvas**. Group canvas scenes into 2–3 blocks.
- Hand gestures only enter and leave canvas blocks (3–6 per video). Inside a block, use Figma's own transitions (pan, prototype click, smart animate).
- Everything else advances on a page key. Never auto-advance.
- Use the shatter transition once, at the story's turn.

## 3. Storyboard
See `references/figma-storyboard.md`. One 1920×1080 frame per scene, with `SPOKEN / MOTION / MARKS` notes underneath. Place real assets early. Follow the person's annotations exactly.

## 4. Assets
- Export work at 2× (long edge ≥ 2400 px), cropped to what the sentence is about.
- Logos only from official sources; record them in `assets/icons/SOURCES.md`. Never draw a logo.
- Missing assets get a labelled placeholder, never an invented image.

## 5. Build
- Copy `template/`, `npm install`, set `speaker` in `scenes.json`, replace the example scenes and assets, set the tokens in `src/style.css`.
- Replicate each storyboard frame from its measured geometry, not by eye.
- Type: a serif for big words (typed), a mono for labels (printed), Inter only for UI elements.
- Figma colours: selection `#0D99FF`, guides `#F24822`, tags `#9747FF`. At most one selection per scene, on the key word.
- Text over camera: white with a soft shadow, clear of the face. Labels ≥ 30 px at 1080p.

## 6. Review
- Screenshot every scene at 1920×1080 (Playwright, fake camera) and check them before reporting.
- Sort forwarded critique into **fix now** (bugs, misalignment, illegible text) and **design changes**. Do the first; ask before the second.

## 7. Record
See `references/recording.md`: app window, teleprompter (P), window capture, hide overlays (G, H), 10 s test, one sentence per take.

## 8. Optional
`npm run render` writes 1080p 60 fps MP4s of camera-free scenes for the edit.

## Timing
- Animations run 1.5× faster than written (`SPEED` in `src/layers.ts`); pauses are not scaled.
- Typing ~20–30 ms per character; marks arrive 80–150 ms after their word.
- Lift ~0.5 s · pan ~0.6 s · put down ~0.8 s · shatter ~1 s.
- End on name and URL alone, held as long as the speaker wants.
