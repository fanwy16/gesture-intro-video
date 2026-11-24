# Gesture intro video (project)

A local page for recording a self-introduction video, one spoken sentence per scene. Built from the `gesture-intro-video` skill; read its `SKILL.md` and `references/` for the method.

- `VIDEO_BRIEF.md` is the source of truth: goal, audience, script, visual rules, scene list. Ask the speaker before changing any spoken line, number or visual rule.
- Private context (application answers, personal notes) lives in `context.md`, which is git-ignored and never published.
- The Figma storyboard is the design: every scene's positions and sizes in `scenes.json` come from its frames. Change the storyboard first, then the JSON.
- Scenes are data in `scenes.json` (schema: the skill's `references/scenes-schema.md`); adding or reordering a scene should only need a JSON change. `speaker` sets the name and colour of the speaker's cursor.
- Assets live in `assets/` (served at the site root). A missing file shows a labelled placeholder. Never draw brand logos; record icon sources in `assets/icons/SOURCES.md`.
- Visual tokens (fonts, colours, easing) are at the top of `src/style.css`; teleprompter cue wording is `GESTURE` in `src/main.ts`.
- Run: `npm install` (also fetches the MediaPipe wasm and hand model), `npm run dev` → http://localhost:5173. `#scene-id` opens one scene.
- After each round: screenshot every scene at 1920×1080 and check them before reporting.
