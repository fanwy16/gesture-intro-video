# Scene data, moves and keys

The recording page reads `scenes.json`: a list of scenes, one per spoken sentence. Each scene has **layers** (what can be on screen, at storyboard coordinates on a 1920×1080 stage) and **beats** (what happens, in order).

## Scene

| field | meaning |
|---|---|
| `id` | `s03-project` style; also the `#hash` that opens it |
| `spoken` | the sentence; the teleprompter shows it |
| `sheet` | none = text straight on the camera; `full` = a sheet already covering the frame; `lift` = a sheet the hand brings in; `rise` = comes up from below; `open` = grows out of an element of the previous scene |
| `canvas` | the sheet is the tool's dotted canvas |
| `liftMode` | `palm` (open hand rises), `pinch` (two hands grip low and pull apart), `pull` (one hand pulls it down from the top) |
| `startWith` | id of the previous scene: its end state is rebuilt on top, so this scene can open by transforming it |
| `charMs` | typing speed for this scene |

## Layers

Common: `id, kind, x, y, w, h, initial` (already visible when the scene starts).

| kind | use |
|---|---|
| `text` | `text` or `runs: [[text, size], …]` for mixed sizes; `font`: serif (typed) / mono (printed) / ui; `align`: left/right/center (right/center align by ink, not advance width); `enter`: type, print, spark, count, up, fade; `palette` colours letters in turn |
| `image` / `icon` | `src`, `card` (white mat), `shadow`, `radius`, `fit`, `pos`, `opacity` + `blur` (+ `dimLater`: sharp first, blurred by a `dim` beat) |
| `rect` | plain block; `color: "canvas"` gives the dotted canvas |
| `select`, `guides`, `tag`, `leader`, `pill` | the tool's inspector marks; `guides.baselineOnly` draws one baseline under the type |
| `chip` | product icon + name |
| `column` | endless scrolling column of images |
| `acronym` | initials that spark in, get selected, and unfold as an auto layout into the full words |
| `stack` | an auto layout list, items added one at a time as the frame hugs them; the first gets selected |
| `dropin` | the named cursor carries an icon into a slot at the end of a sentence |
| `cursor` | a multiplayer cursor (`label`, `color`) gliding in |
| `phone` | a phone frame showing `screen` (or `video`) |
| `dock` | a macOS-style Dock, magnifying one icon at a time / Dock |

## Beats

Each beat: optional `wait` (ms pause first), then optionally a move (`do`), then `hide` / `dim` / `show` (one by one, or `together` with `stagger`).

| `do` | move | waits for |
|---|---|---|
| `lift` | the sheet comes in by `liftMode` | the hand (or page key) |
| `drop` | the frame shatters into falling tiles — use once | a wave |
| `putdown` | laid back like paper and slid out of the bottom (`dur`) | page key |
| `pan` | slides to the next frame on the canvas | page key |
| `zoom` | dives into a layer (`target`) until it fills the frame | `auto` or page key |
| `fly` | everything fades but one layer, which flies to `to` (Smart Animate) with a zoom % label | `auto` |
| `proto` | clicks a screen on a poster (`screen` fractions) and it grows into the phone (`to`) | `auto` |
| `open`, `dock`, `rise` | scene-specific | — |

Other beat fields: `hand: true` (the move waits for the hand even when the scene was entered with the page key), `auto: true` (runs on entry), `click: "layerId"` + `clickPoint` (the named cursor glides there and clicks), `night: true` (the camera goes black, text turns white).

## Keys

| key | action |
|---|---|
| → / Page Down / Space | next: sets off a waiting move, or goes to the next scene and sets off its opening move (moves marked `hand` still wait) |
| N | next scene, opening move left to the hand |
| ← / Page Up | previous scene |
| T | restart this scene |
| P | open the teleprompter window |
| H | scene notes on/off (off by default) |
| G | hand points and lift lines on/off (on by default; turn off before recording) |
| W | text over the camera: white ↔ ink |

When a scene has played out and the next opens with a hand move, starting that gesture moves on by itself — no key needed.
