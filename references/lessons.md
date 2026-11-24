# Lessons

Things that went wrong in the first build and how they were solved. Check these before building.

## Process

- **Don't redesign the person's frames on the strength of forwarded critique.** Twice a pasted critique led to relaying out scenes the person had designed; both were reverted. Fix bugs directly; ask about design changes.
- **The person sets the pace.** Auto-advancing scenes, auto-triggered transitions on the key that enters a scene, and hidden status all frustrated recording. Every scene change is the person's; show status in the teleprompter.
- **Gestures only where they mean something.** Early on, every transition was a gesture (lift, drop, index finger, wave); it became a gimmick and unreliable. Final: three hand moves — pick up, pull down, wave to shatter — all else on the page key.

## Gestures

- Need a **steady start**: both hands gripping for ~250 ms low in the frame before a lift; once lifted, a looser grip still holds; smooth the size; let go for ~450 ms before it drops back.
- A tracked move must **not cancel on one bad frame** (fingers blur mid-push); cancel only when the hand is lost.
- "Fingertips pinch then spread" fired while talking; a quick wave was clearer. Any gesture usable mid-sentence must be one people don't make while speaking.
- The camera is mirrored on screen: map landmarks with `x → W − x`.
- The hidden-zone page turn (camera zoomed so the bottom strip is tracked but not recorded) worked technically but was dropped: a clicker is simpler.

## Rendering

- Per-character spans: put `letter-spacing` on the spans, not the parent, or widths drift from Figma.
- Use the variable font with optical size so large type matches Figma's display cut.
- Right-aligned lines: align by ink (`measureText().actualBoundingBoxRight`), not advance width, or the column looks ragged.
- Hidden things: `display: none`, not `visibility` (a child with `visibility: visible` still shows).
- Build the next scene before removing the old one, or the camera flashes between scenes.
- `transitionend` with `{ once: true }` can fire for the wrong property; use a timer for multi-property transitions.
- A global speed factor (patching `Element.animate` durations) is the easiest way to answer "make everything faster"; keep pauses between beats unscaled.
- When transitions run inside a canvas block, give each its own idea (pan, dive into a poster, smart-animate a thumbnail) so they don't feel repeated.

## Content

- Text over a live camera: test against the real room. White text + soft shadow held up better than boxes; boxes looked like film title cards.
- Captions under screenshots must read on a phone: ≥ 30 px at 1080p.
- Repeated numbers must match across video, CV and written answers.
