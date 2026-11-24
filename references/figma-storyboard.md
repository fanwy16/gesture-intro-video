# Storyboarding in Figma, and replicating it

The person designs the storyboard in Figma; the agent builds it with them, then replicates it exactly in code — and, after changes in code, replicates the build back into Figma for review. This file is how. It assumes the Figma MCP server (`use_figma`, `get_screenshot`, `get_metadata`, `upload_assets`, `create_session`). Load the `figma-use` skill before any `use_figma` call.

## 1. Set up the file

- `create_session` with the file key first, then reuse the session id on every call.
- Pages: **Storyboard** (scene frames in reading order), **Kit** section (components), later **Current build** (screenshots of the real page).
- Kit components, sized for a 1920×1080 frame
  - *Camera feed*: a full-frame placeholder (grey gradient, label "camera") under on-camera scenes
  - *Selection*: 2 px `#0D99FF` stroke, four 12 px white handles
  - *Guides*: x-height + baseline lines (or baseline only)
  - *Spec tag* + *Leader*: white pill with mono text, a dashed leader with a ring
  - *Size pill*: blue pill, mono text, e.g. `1020 × 431`
  - *Design placeholder*: a card with the asset path written on it
- Scene frames: 1920×1080, named `NN · Short name`, laid out in rows with 200 px gaps; a notes text box 100 px below each:
  ```
  SPOKEN  the sentence
  MOTION  how it enters, what appears when, how it leaves
  MARKS   which word gets the selection / guide / tag
  ```

## 2. Build a first pass for the person to adjust

- Put real text in the real fonts (load fonts with `figma.loadFontAsync` before editing text; Inter's styles are "Semi Bold" with a space).
- Place real assets early: create a rectangle at the final size, then `upload_assets` with `nodeIds: [rect]` to fill it. Upload URLs are single-use and expire after 10 minutes; POST with `curl --max-time 90`, several in parallel; verify the fill type became `IMAGE`.
- To get an asset out of their own Figma file, `get_screenshot` the node (it returns the node's natural size if smaller than `maxDimension`; ask for ≥ 2400 px) and save it to `assets/`.
- Don't scale a cloned frame to fit (text reflows and wraps); export it as a PNG and place the image instead.
- Read-only files stay read-only: never edit a file the person said is only for assets.

## 3. Replicate the storyboard in code

Read, don't eyeball. For each scene frame, run `use_figma` and return every child's geometry and type:

```js
const f = await figma.getNodeByIdAsync(FRAME_ID);
return f.children.filter(n => n.visible).map(n => ({
  id: n.id, type: n.type, name: n.name,
  x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.width), h: Math.round(n.height),
  ...(n.type === "TEXT" ? { text: n.characters, size: n.fontSize, font: n.fontName,
       align: n.textAlignHorizontal, lineHeight: n.lineHeight, letterSpacing: n.letterSpacing } : {}),
  fill: n.fills?.[0]?.type, crop: n.fills?.find(p => p.type === "IMAGE")?.imageTransform,
}));
```

- Map each child to a layer in `scenes.json` with the same `x, y, w, h`. Text: Figma's `y` is the top of the text box; with line height ≈ 0.95 the DOM line box matches, but **measure**: render, read each line's ink box, compare with the Figma box, adjust once per font size.
- Letter-spacing in Figma is per character; in the page put it on each character span, not the parent, or widths drift. Check widths match within a few pixels.
- Image crops: a `CROP` fill's `imageTransform` `[[a,0,tx],[0,d,ty]]` means the visible part is `x ∈ [tx, tx+a]`, `y ∈ [ty, ty+d]` of the source (fractions). Crop the original at full resolution from those fractions instead of using a low-res export.
- Where something sits inside an image (a thumbnail in a screenshot, a screen on a poster), compute its rect from the image's fit (cover/contain) and the pixel bounds in the source, so a transition can land exactly on it.
- Hidden frames and layers the person switched off are not deleted — respect `visible: false`.

## 4. Check the replica

- Screenshot each scene at 1920×1080 (Playwright with a fake camera; a grey gradient stands in for the camera), and the matching Figma frame with `get_screenshot`. Compare side by side; fix differences > 4 px.
- Capture the in-between moments that matter (before/after a selection, mid-transition) as well as the end state.

## 5. Replicate the build back into Figma

So the person can review everything in one place after code changes:

- Make (or update) a **Current build** page: one 1920×1080 frame per screenshot, named after the scene and the moment (`06 · Project (screen grows from the poster)`); `upload_assets` with `nodeIds` fills them.
- Keep these as screenshots, clearly labelled, separate from the editable storyboard. When the person approves a change, also update the editable storyboard frame (move layers, swap images, edit the notes) so the storyboard stays the source of truth.
- When the person rearranges something in Figma (e.g. a collage of screenshots), read its geometry and crops back (section 3) and apply them exactly.
