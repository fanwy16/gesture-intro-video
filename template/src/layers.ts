/*
 * Layers: everything placed on a scene, at the storyboard's coordinates
 * (1920×1080). Each layer is built hidden and has its own way in:
 *   text    typed with a caret (serif) or printed in (mono labels)
 *   image   printed in, or risen / slid in when a beat says so
 *   marks   Figma's inspector marks: blue selection, teal guides, tags,
 *           leaders, the blue size pill — drawn in quickly
 */
export type Run = [text: string, size: number];

export interface LayerSpec {
  id: string;
  kind: "text" | "image" | "icon" | "rect" | "select" | "guides" | "tag" | "chip" | "column" | "acronym" | "cursor" | "dropin" | "stack" | "leader" | "pill" | "marquee" | "phone" | "dock";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  initial?: boolean; // already there when the scene starts
  // text
  text?: string;
  size?: number;
  runs?: Run[];
  font?: "serif" | "mono" | "ui"; // ui: Figma's own interface type (Inter), for frame names and labels
  color?: string;
  palette?: string[]; // text: letters coloured in turn (e.g. a key word in Figma's logo colours)
  align?: "left" | "right" | "center";
  enter?: "type" | "print" | "rise" | "slide" | "fade" | "grow" | "spark" | "up" | "count";
  dur?: number;
  delay?: number;
  // image / rect
  src?: string;
  card?: boolean;
  shadow?: boolean;
  radius?: number;
  opacity?: number;
  blur?: number;
  dimLater?: boolean; // shown sharp first; a "dim" beat blurs it to opacity/blur
  fit?: "cover" | "contain";
  pos?: string; // object-position for a cropped image ("top")
  // marks
  label?: string;
  tone?: "neutral" | "purple";
  swatch?: string;
  dir?: "down" | "up" | "left" | "right";
  len?: number;
  baselineOnly?: boolean; // guides: just a blue baseline under the type (no line through the letters)
  // phone
  screen?: string;
  video?: string;
  from?: [number, number, number, number];
  // column: a stack of images scrolling forever (scene 5)
  items?: { src: string; h: number; id?: string; card?: boolean; shadow?: boolean; radius?: number }[];
  gap?: number;
  speed?: number; // px per second
  // stack: an auto layout list (scene 15); dim items show as "next"
  rows?: { text: string; dim?: boolean }[];
  // dock
  apps?: { icon: string; label: string }[];
}

/*
 * Everything moves SPEED× faster than the durations written here and in scenes.json:
 * every Web Animation (endless loops such as the scrolling columns keep their pace)
 * and every wait between characters or steps. Pauses between beats stay as written.
 */
export const SPEED = 1.5;
export const fast = (ms: number) => ms / SPEED;
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
  if (typeof options === "number") options = fast(options);
  else if (options && options.iterations !== Infinity) options = { ...options, duration: fast(Number(options.duration ?? 0)), delay: fast(options.delay ?? 0) };
  return nativeAnimate.call(this, frames, options);
};

export const ENTER = "cubic-bezier(0.22, 1, 0.36, 1)";
export const FALL = "cubic-bezier(0.5, 0, 0.9, 0.45)";
const LINE_HEIGHT: Record<number, number> = { 220: 209, 200: 200, 150: 143, 112: 107 };
const lh = (size: number) => LINE_HEIGHT[size] ?? Math.round(size * 0.95);

export function place(el: HTMLElement, s: { x?: number; y?: number; w?: number; h?: number }) {
  el.style.left = `${s.x ?? 0}px`;
  el.style.top = `${s.y ?? 0}px`;
  if (s.w !== undefined) el.style.width = `${s.w}px`;
  if (s.h !== undefined) el.style.height = `${s.h}px`;
}

const div = (cls: string) => {
  const d = document.createElement("div");
  d.className = cls;
  return d;
};

/* ── Text: lines → per-character spans, so it can be typed ── */
export function buildText(spec: LayerSpec, onSheet: boolean): HTMLElement {
  const el = div(`L text ${spec.font ?? "serif"} ${onSheet ? "ink" : "on-camera"}`);
  place(el, spec);
  if (spec.align) el.style.textAlign = spec.align;
  if (spec.color) el.style.color = spec.color;
  const runs: Run[] = spec.runs ?? [[spec.text ?? "", spec.size ?? 112]];
  let line = div("tline");
  el.append(line);
  for (const [text, size] of runs) {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) {
        line = div("tline");
        el.append(line);
      }
      for (const ch of Array.from(part)) {
        const s = document.createElement("span");
        s.className = "tc";
        s.textContent = ch;
        s.style.fontSize = `${size}px`;
        s.style.lineHeight = spec.font === "mono" || spec.font === "ui" ? "1.3" : `${lh(size)}px`;
        line.append(s);
      }
    });
  }
  if (spec.palette) {
    const letters = [...el.querySelectorAll<HTMLElement>(".tc")].filter((c) => /\w/.test(c.textContent ?? ""));
    letters.forEach((c, i) => (c.style.color = spec.palette![i % spec.palette!.length]));
  }
  // Empty lines (from "\n\n") keep their height.
  el.querySelectorAll<HTMLElement>(".tline").forEach((l) => {
    if (!l.childElementCount) l.innerHTML = "&nbsp;";
  });
  if (spec.align === "right") void document.fonts.ready.then(() => alignInk(el));
  return el;
}

/* Right-aligned lines end where their ink ends, not their advance width: a "k"
   and a "d" leave different gaps after them, which shows in a ragged column. */
const inkCanvas = document.createElement("canvas").getContext("2d")!;
function alignInk(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>(".tline").forEach((line) => {
    const last = line.lastElementChild as HTMLElement | null;
    if (!last?.textContent?.trim()) return;
    const cs = getComputedStyle(last);
    inkCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = inkCanvas.measureText(last.textContent);
    line.style.marginRight = `${-(m.width - m.actualBoundingBoxRight)}px`;
  });
}

/* ── Marks ── */
const HANDLES = ["tl", "tr", "bl", "br"];
export function buildSelect(spec: LayerSpec): HTMLElement {
  const el = div("L select");
  place(el, spec);
  for (const h of HANDLES) el.append(div(`handle ${h}`));
  return el;
}

export function buildGuides(spec: LayerSpec): HTMLElement {
  const el = div(`L guides${spec.baselineOnly ? " baseline-only" : ""}`);
  place(el, spec);
  if (spec.baselineOnly) el.append(div("gline bottom"));
  else el.append(div("gline top"), div("gline bottom"));
  return el;
}

export function buildTag(spec: LayerSpec): HTMLElement {
  const el = div(`L tag ${spec.tone === "purple" ? "purple" : ""}`);
  place(el, { x: spec.x, y: spec.y });
  if (spec.swatch) {
    const sw = div("swatch");
    sw.style.background = spec.swatch;
    el.append(sw);
  }
  el.append(spec.label ?? "");
  return el;
}

export function buildChip(spec: LayerSpec): HTMLElement {
  const el = div("L chip");
  place(el, { x: spec.x, y: spec.y });
  const icon = document.createElement("img");
  icon.src = `/${spec.src}`;
  icon.alt = "";
  el.append(icon, spec.label ?? "");
  return el;
}

export function buildLeader(spec: LayerSpec): HTMLElement {
  const el = div(`L leader ${spec.dir ?? "down"} ${spec.tone === "purple" ? "purple" : ""}`);
  place(el, { x: spec.x, y: spec.y });
  el.style.setProperty("--len", `${spec.len ?? 34}px`);
  el.append(div("dash"), div("ring"));
  return el;
}

export function buildPill(spec: LayerSpec): HTMLElement {
  const el = div("L pill");
  place(el, { x: spec.x, y: spec.y });
  el.textContent = spec.label ?? "";
  return el;
}

/* ── Images, icons, plain rectangles ── */
export function buildImage(spec: LayerSpec, img: HTMLImageElement | null): HTMLElement {
  const el = div(`L image${spec.card ? " card" : ""}${spec.shadow ? " shadow" : ""}`);
  place(el, spec);
  if (spec.radius !== undefined) el.style.borderRadius = `${spec.radius}px`;
  if (spec.opacity !== undefined && !spec.dimLater) el.dataset.opacity = String(spec.opacity);
  if (spec.blur && !spec.dimLater) el.style.filter = `blur(${spec.blur}px)`;
  if (img) {
    const i = img.cloneNode() as HTMLImageElement;
    i.style.objectFit = spec.fit ?? (spec.card ? "contain" : "cover");
    if (spec.pos) i.style.objectPosition = spec.pos;
    el.append(i);
  } else {
    const ph = div("placeholder");
    ph.textContent = `assets/${spec.src}`;
    el.append(ph);
  }
  return el;
}

/* ── Column: the items twice over, so the track can loop seamlessly ── */
const COL_PAD = 140; // room either side for the cards' shadows
const COL_TOP = 118; // all columns are cut off just below the row of tags…
const COL_FADE = 40; // …fading out as they scroll up into it
export function buildColumn(spec: LayerSpec, imgs: (HTMLImageElement | null)[]): HTMLElement {
  const el = div("L column");
  place(el, { x: (spec.x ?? 0) - COL_PAD, y: COL_TOP, w: (spec.w ?? 0) + COL_PAD * 2, h: 1080 + 200 - COL_TOP });
  el.style.maskImage = `linear-gradient(to bottom, transparent 0, #000 ${COL_FADE}px)`;
  const track = div("track");
  place(track, { x: COL_PAD, y: (spec.y ?? COL_TOP) - COL_TOP, w: spec.w });
  const gap = spec.gap ?? 32;
  let y = 0;
  for (let copy = 0; copy < 2; copy++) {
    (spec.items ?? []).forEach((it, i) => {
      const e = buildImage({ ...it, id: it.id ?? "", kind: "image", x: 0, y, w: spec.w, h: it.h }, imgs[i]);
      e.style.visibility = "inherit";
      if (it.id) e.dataset.item = it.id;
      track.append(e);
      y += it.h + gap;
    });
    if (copy === 0) el.dataset.loop = String(y);
  }
  el.append(track);
  return el;
}

/** Scrolls a column for good; `epoch` keeps its place when a later scene rebuilds it. */
export function scrollColumn(el: HTMLElement, spec: LayerSpec, epoch: number) {
  const loop = Number(el.dataset.loop);
  const dur = (loop / (spec.speed ?? 40)) * 1000;
  const frames = [{ transform: "translateY(0)" }, { transform: `translateY(${-loop}px)` }];
  const a = el.querySelector<HTMLElement>(".track")!.animate(spec.dir === "down" ? frames.reverse() : frames, { duration: dur, iterations: Infinity, easing: "linear" });
  a.currentTime = (performance.now() - epoch) % dur;
}

export function buildRect(spec: LayerSpec): HTMLElement {
  const el = div(`L rect${spec.color === "canvas" ? " canvas" : ""}`); // "canvas": Figma's dotted canvas
  place(el, spec);
  if (spec.color !== "canvas") el.style.background = spec.color ?? "#fff";
  el.style.borderRadius = `${spec.radius ?? 18}px`;
  return el;
}

export const CURSOR_SVG =
  '<svg width="44" height="56" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg"><path d="M3 3 L3 44 L13 34.5 L20.5 51 L27.5 48 L20 31.5 L34 31.5 Z" fill="#111111" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/></svg>';

/* ── Ways in and out (Web Animations; each returns when it has finished) ── */
const anim = (el: HTMLElement, frames: Keyframe[], ms: number, easing = ENTER, delay = 0) =>
  el.animate(frames, { duration: ms, easing, delay, fill: "both" }).finished.then(() => undefined);

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, fast(ms)));
/** A pause between beats: not sped up, so the pacing in scenes.json is what you get. */
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Typed: a character at a time, a thin caret following. */
export async function typeIn(el: HTMLElement, charMs: number, alive: () => boolean) {
  el.style.visibility = "visible";
  const chars = Array.from(el.querySelectorAll<HTMLElement>(".tc"));
  let prev: HTMLElement | null = null;
  for (const c of chars) {
    if (!alive()) return;
    c.classList.add("on");
    prev?.classList.remove("caret");
    c.classList.add("caret");
    prev = c;
    await wait(c.textContent === " " ? charMs * 0.6 : charMs);
  }
  prev?.classList.add("blink");
  setTimeout(() => prev?.classList.remove("caret", "blink"), 1000);
}

/* Spark: each letter strikes like a match, a burst of rays in
   Figma's logo colours flying off it, then settles to ink. */
const SPARK = ["#F24E1E", "#FF7262", "#A259FF", "#1ABCFE", "#0ACF83"];
export async function sparkIn(el: HTMLElement, charMs: number, alive: () => boolean) {
  el.style.visibility = "visible";
  el.classList.add("spark");
  for (const c of el.querySelectorAll<HTMLElement>(".tc")) {
    if (!alive()) return;
    c.classList.add("on");
    if (!c.textContent?.trim()) continue;
    c.animate(
      [
        { transform: "scale(1.18)", filter: "drop-shadow(0 0 40px #FFC700) brightness(1.6)", color: "#FF7262" },
        { transform: "scale(1)", filter: "drop-shadow(0 0 0 transparent) brightness(1)", color: c.style.color || getComputedStyle(el).color },
      ],
      { duration: 700, easing: ENTER },
    );
    burst(c);
    await wait(charMs);
  }
}

function burst(c: HTMLElement) {
  const b = div("burst");
  c.append(b);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const r = div("ray");
    r.style.background = SPARK[i % SPARK.length];
    b.append(r);
    const a = (360 / n) * i + Math.random() * 14;
    const far = 0.55 + Math.random() * 0.25;
    r.animate(
      [
        { transform: `rotate(${a}deg) translateX(0.3em) scaleX(0)`, opacity: 1 },
        { transform: `rotate(${a}deg) translateX(0.42em) scaleX(1)`, opacity: 1, offset: 0.35 },
        { transform: `rotate(${a}deg) translateX(${far}em) scaleX(0.1)`, opacity: 0 },
      ],
      { duration: 650, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "both" },
    );
  }
  setTimeout(() => b.remove(), fast(700));
}

/** Printed: revealed top to bottom as the ink darkens . */
export function printIn(el: HTMLElement, ms = 1000, delay = 0) {
  el.style.visibility = "visible";
  el.querySelectorAll(".tc").forEach((c) => c.classList.add("on"));
  const to = Number(el.dataset.opacity ?? 1);
  return anim(el, [{ clipPath: "inset(0 0 100% 0)", opacity: 0.25 * to }, { clipPath: "inset(-20% -5% -20% -5%)", opacity: to }], ms, ENTER, delay);
}

export function fadeIn(el: HTMLElement, ms = 320, delay = 0) {
  el.style.visibility = "visible";
  el.querySelectorAll(".tc").forEach((c) => c.classList.add("on"));
  const to = Number(el.dataset.opacity ?? 1);
  if (el.classList.contains("guides")) {
    el.querySelectorAll<HTMLElement>(".gline").forEach((g, i) => anim(g, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], 500, ENTER, delay + i * 80));
  }
  return anim(el, [{ opacity: 0 }, { opacity: to }], ms, "ease-out", delay);
}

/** Rises from below the frame (columns in scene 5). */
export function riseIn(el: HTMLElement, ms: number, delay = 0) {
  el.style.visibility = "visible";
  const to = Number(el.dataset.opacity ?? 1);
  return anim(el, [{ transform: "translateY(1150px)", opacity: to }, { transform: "translateY(0)", opacity: to }], ms, ENTER, delay);
}

/** Comes up a little way from below as it fades in (scene 12's screenshots arriving). */
export function upIn(el: HTMLElement, ms = 700, delay = 0) {
  el.style.visibility = "visible";
  const to = Number(el.dataset.opacity ?? 1);
  return anim(el, [{ transform: "translateY(240px)", opacity: 0 }, { transform: "translateY(0)", opacity: to }], ms, ENTER, delay);
}

/** A number that counts up from 0 to its value ("60K+": 0K+ … 60K+). */
export async function countIn(el: HTMLElement, ms = 700) {
  el.style.visibility = "visible";
  const chars = [...el.querySelectorAll<HTMLElement>(".tc")];
  chars.forEach((c) => c.classList.add("on"));
  const text = chars.map((c) => c.textContent).join("");
  const m = text.match(/^(\d+)(.*)$/);
  if (!m) return;
  const [, num, rest] = m;
  const line = chars[0].parentElement!;
  const proto = chars[0];
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const frame = () => {
      const p = Math.min(1, (performance.now() - t0) / fast(ms));
      const v = String(Math.round(Number(num) * (1 - Math.pow(1 - p, 3))));
      line.replaceChildren(...Array.from(v + rest).map((ch) => {
        const s = proto.cloneNode() as HTMLElement;
        s.textContent = ch;
        return s;
      }));
      if (p < 1) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
}

/** Slides in from beyond the right edge (stacked cards, swatches). */
export function slideIn(el: HTMLElement, ms = 700, delay = 0) {
  el.style.visibility = "visible";
  const to = Number(el.dataset.opacity ?? 1);
  return anim(el, [{ transform: "translateX(1100px)", opacity: to }, { transform: "translateX(0)", opacity: to }], ms, ENTER, delay);
}

/** Sharp → dimmed and blurred, to become a backdrop (scene 12's screenshots behind the numbers). */
export function dimTo(el: HTMLElement, opacity: number, blur: number, ms = 1100) {
  el.dataset.opacity = String(opacity);
  return anim(el, [{ opacity: 1, filter: "blur(0px)" }, { opacity, filter: `blur(${blur}px)` }], ms, "ease-in-out");
}

/** Leaves upwards through its own mask. */
export function leave(el: HTMLElement, ms = 450, delay = 0) {
  const from = Number(getComputedStyle(el).opacity);
  return anim(el, [{ clipPath: "inset(-20% -5% -20% -5%)", opacity: from }, { clipPath: "inset(0 0 100% 0)", opacity: 0 }], ms, FALL, delay).then(() => {
    el.style.visibility = "hidden";
  });
}
