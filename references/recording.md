# Recording checklist

## Set up

1. Start the page: `npm run dev` → http://localhost:5173. Allow the camera.
2. Open it as a chromeless app window that fills the screen without going full screen (full screen hides every other window, including the teleprompter):
   ```
   open -na "Google Chrome" --args --app=http://localhost:5173 --start-maximized
   ```
3. Press **P**: the teleprompter opens as a strip at the top centre, right under the camera. Keep it focused; the page keys typed there are passed to the video window. It shows the line, the next line, the gesture needed now and next, and whether the camera and hands are seen.
4. Press **G** to hide the hand points, **H** if the notes are on. Nothing else is drawn on the frame.

## Capture

**OBS (recommended)** — Sources → + → *macOS Screen Capture* → Method: *Window* → choose the video window (not the teleprompter); untick *Show cursor*. Right-click → Transform → *Fit to screen*; Option-drag to crop letterboxing. Settings → Video 1920×1080; Output mp4. Add *Audio Input Capture* for the microphone; add *Noise Suppression (RNNoise)* and *Compressor* filters.

Window capture records only that window, so the teleprompter can sit on top of it.

**No OBS** — Cmd+Shift+5 → *Record Selected Portion* → frame only the video area, keep the teleprompter outside it; Options → Microphone; untick *Show Mouse Clicks*.

## Takes

- One sentence per take. Pause a second before and after; it makes the cut easy.
- Gesture fails? Press the page key — it completes the move. Or re-record that sentence.
- Test 10 seconds first: voice audible, no teleprompter, no browser chrome, no cursor.
- Mic a hand's width from the mouth; headphones, not speakers; soft furnishings reduce echo.
