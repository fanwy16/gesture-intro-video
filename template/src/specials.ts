import { CURSOR_SVG, ENTER, fast, place, sparkIn, wait, type LayerSpec } from "./layers";

/*
 * The scene-specific moves the storyboard asks for:
 *   Marquee (scene 2): a cursor drags a marquee around the Figma icon;
 *     on release it becomes Figma's selection box.
 *   Phone (scene 6): the key screen grows out of its tile into the phone.
 *   Dock (scene 10): a macOS Dock; the cursor glides from app to app, each
 *     one swelling under it with its name above; on Figma it clicks and the
 *     selection box snaps round it.
 */
const div = (cls: string) => {
  const d = document.createElement("div");
  d.className = cls;
  return d;
};
const cursorEl = () => {
  const c = div("L cursor");
  c.innerHTML = CURSOR_SVG;
  return c;
};
const selectionEl = (x: number, y: number, w: number, h: number) => {
  const s = div("L select");
  place(s, { x, y, w, h });
  for (const k of ["tl", "tr", "bl", "br"]) s.append(div(`handle ${k}`));
  return s;
};
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const tween = (ms: number, step: (e: number) => void, alive: () => boolean) =>
  new Promise<void>((resolve) => {
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!alive()) return resolve();
      const p = Math.min(1, (now - t0) / fast(ms));
      step(ease(p));
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

/* ── Marquee ── */
export function buildMarquee(spec: LayerSpec): HTMLElement {
  const el = div("L marquee-wrap");
  place(el, { x: 0, y: 0, w: 1920, h: 1080 });
  return el;
}

export async function playMarquee(el: HTMLElement, spec: LayerSpec, alive: () => boolean) {
  el.style.visibility = "visible";
  const { x = 0, y = 0, w = 100, h = 100 } = spec;
  const box = div("L marquee");
  const cur = cursorEl();
  el.append(box, cur);
  place(box, { x, y, w: 0, h: 0 });
  place(cur, { x: x - 2, y: y - 2 });
  await cur.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" }).finished;
  await wait(150);
  await tween(900, (e) => {
    place(box, { x, y, w: w * e, h: h * e });
    place(cur, { x: x + w * e - 2, y: y + h * e - 2 });
  }, alive);
  if (!alive()) return;
  await wait(120);
  const sel = selectionEl(x, y, w, h);
  el.append(sel);
  sel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" });
  box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "both" });
  cur.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(60px, 50px)", opacity: 0 }], { duration: 600, delay: 350, easing: ENTER, fill: "both" });
  await wait(600);
}

/* ── Phone ── */
export function buildPhone(spec: LayerSpec, screen: HTMLImageElement | null, video: HTMLVideoElement | null): HTMLElement {
  const el = div("L phone");
  place(el, spec);
  const inner = div("phone-screen");
  if (video) inner.append(video);
  else if (screen) inner.append(screen.cloneNode());
  el.append(inner);
  return el;
}

export async function growPhone(el: HTMLElement, spec: LayerSpec, alive: () => boolean) {
  const [fx, fy, fw, fh] = spec.from ?? [spec.x!, spec.y!, spec.w!, spec.h!];
  // the speaker's cursor clicks the screen first; the phone opens out of it.
  const cur = namedCursor();
  el.parentElement!.append(cur);
  const tx = fx + fw * 0.55;
  const ty = fy + fh * 0.5;
  await tween(550, (e) => place(cur, { x: 1500 + (tx - 1500) * e, y: 980 + (ty - 980) * e }), alive);
  await cur.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 220 }).finished;
  if (!alive()) return cur.remove();
  cur.animate([{ transform: "translate(0, 0)", opacity: 1 }, { transform: "translate(160px, 140px)", opacity: 0 }], { duration: 700, easing: ENTER, fill: "both" }).finished.then(() => cur.remove());
  el.style.visibility = "visible";
  const sx = fw / spec.w!;
  const sy = fh / spec.h!;
  const video = el.querySelector("video");
  await el.animate(
    [
      { transform: `translate(${fx - spec.x!}px, ${fy - spec.y!}px) scale(${sx}, ${sy})`, transformOrigin: "0 0", borderColor: "rgba(27,45,66,0)" },
      { transform: "translate(0, 0) scale(1, 1)", transformOrigin: "0 0", borderColor: "rgba(27,45,66,1)" },
    ],
    { duration: 560, easing: ENTER, fill: "both" },
  ).finished;
  video?.play().catch(() => undefined);
}

/* ── Dock ── */
export class Dock {
  el = div("L dock-wrap");
  private bar = div("dock");
  private tiles: HTMLElement[] = [];
  private tip = div("dock-tip");
  private cursor = cursorEl();
  private cx: number;
  private bottom: number;
  private base: number;
  private mouseX = -9999;
  private sel: HTMLElement | null = null;

  constructor(private spec: LayerSpec, icons: (HTMLImageElement | null)[]) {
    this.cx = spec.x ?? 960;
    this.bottom = spec.y ?? 1032;
    this.base = spec.w ?? 112;
    place(this.el, { x: 0, y: 0, w: 1920, h: 1080 });
    this.el.append(this.bar);
    (spec.apps ?? []).forEach((app, i) => {
      const t = div("dock-tile");
      t.dataset.app = app.label;
      const img = icons[i];
      if (img) t.append(img.cloneNode());
      else t.textContent = app.label;
      this.tiles.push(t);
      this.el.append(t);
    });
    this.el.append(this.tip, this.cursor);
    this.cursor.style.opacity = "0";
    this.tip.style.opacity = "0";
    this.layout();
  }

  /** Magnification, one icon at a time: the one under the cursor swells, bottom-aligned. */
  private layout() {
    const gap = 22;
    const pad = 28;
    // First pass with base sizes to find centres, then sizes from the cursor distance.
    const n = this.tiles.length;
    const baseW = n * this.base + (n - 1) * gap;
    const centres = this.tiles.map((_, i) => this.cx - baseW / 2 + this.base / 2 + i * (this.base + gap));
    const sizes = centres.map((c) => {
      const d = Math.abs(c - this.mouseX) / (this.base * 1.05); // only the icon under the cursor swells
      return this.base * (1 + 0.64 * (d < 1 ? Math.cos((d * Math.PI) / 2) : 0));
    });
    const total = sizes.reduce((a, b) => a + b, 0) + (n - 1) * gap;
    let x = this.cx - total / 2;
    sizes.forEach((s, i) => {
      place(this.tiles[i], { x, y: this.bottom - 20 - s, w: s, h: s });
      x += s + gap;
    });
    const barH = this.base + 40;
    place(this.bar, { x: this.cx - total / 2 - pad, y: this.bottom - barH, w: total + pad * 2, h: barH });
  }

  async enter() {
    this.el.style.visibility = "visible";
    await this.el.animate([{ transform: "translateY(300px)" }, { transform: "translateY(0)" }], { duration: 650, easing: ENTER, fill: "both" }).finished;
  }

  /** Glide the cursor onto app i (with its name above); on the last one, click and select. */
  async hover(i: number, alive: () => boolean, select = false) {
    const tile = this.tiles[i];
    if (!tile) return;
    this.cursor.style.opacity = "1";
    this.tip.style.opacity = "0"; // the name follows once the cursor arrives
    const startX = this.mouseX < 0 ? 1500 : this.mouseX;
    const startY = parseFloat(this.cursor.style.top) || 1000;
    const targetX = parseFloat(tile.style.left) + parseFloat(tile.style.width) / 2;
    await tween(700, (e) => {
      this.mouseX = startX + (targetX - startX) * e;
      this.layout();
      const t = this.tiles[i];
      const ty = parseFloat(t.style.top) + parseFloat(t.style.height) * 0.55;
      place(this.cursor, { x: this.mouseX + 6, y: startY + (ty - startY) * e });
    }, alive);
    const t = this.tiles[i];
    this.tip.textContent = this.spec.apps?.[i]?.label ?? "";
    this.tip.style.opacity = "1";
    place(this.tip, { x: parseFloat(t.style.left) + parseFloat(t.style.width) / 2, y: parseFloat(t.style.top) - 66 });
    if (select && alive()) {
      await wait(350);
      await this.cursor.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 220 }).finished;
      const x = parseFloat(t.style.left) - 8;
      const y = parseFloat(t.style.top) - 8;
      const s = parseFloat(t.style.width) + 16;
      this.sel = selectionEl(x, y, s, s);
      this.el.insertBefore(this.sel, this.tip);
      this.sel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" });
    }
  }
}

/* ── Acronym: a Figma frame on its canvas. The initials spark in; the speaker's
   cursor clicks it (selection and size label); then it unfolds as an auto
   layout into Human / Computer / Interaction, padding and gaps shown in
   Figma's orange. ── */
const NAMED_CURSOR = (color: string) =>
  `<svg width="40" height="50" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg"><path d="M3 3 L3 44 L13 34.5 L20.5 51 L27.5 48 L20 31.5 L34 31.5 Z" fill="${color}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
/** The speaker's own cursor (name and colour from scenes.json "speaker"). */
export const SPEAKER = { name: "You", color: "#A259FF" };

/** A Figma multiplayer cursor with its name; the speaker's by default. */
function namedCursor(name = SPEAKER.name, color = SPEAKER.color) {
  const cur = div("L named-cursor");
  cur.innerHTML = `${NAMED_CURSOR(color)}<span style="background:${color}">${name}</span>`;
  return cur;
}

/* ── Cursor layer (scene 14): someone else joins the file, gliding in to where they work ── */
export function buildCursor(spec: LayerSpec): HTMLElement {
  const cur = namedCursor(spec.label, spec.color);
  place(cur, spec);
  return cur;
}
export function cursorIn(el: HTMLElement, spec: LayerSpec) {
  el.style.visibility = "visible";
  const [dx, dy] = { left: [-220, 60], right: [220, 60], up: [40, -200], down: [60, 200] }[spec.dir ?? "right"];
  return el.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translate(0, 0)", opacity: 1 }], { duration: 800, easing: ENTER, fill: "both" }).finished.then(() => undefined);
}
const FROM = 560; // the initials' size
const TO = 128; // the spelled-out words' size
const PAD = 0.12; // auto layout padding and gap, in em
const GAP = 0.22;

export function buildAcronym(spec: LayerSpec): HTMLElement {
  const el = div("L acronym");
  place(el, { x: 0, y: spec.y ?? 0, w: 1920, h: spec.h ?? 600 });
  const box = div("al");
  box.style.fontSize = `${FROM}px`;
  const words = (spec.text ?? "").split(" ");
  box.append(div("al-pad"));
  words.forEach((w, i) => {
    if (i) box.append(div("al-gap"));
    const word = div("al-word");
    const ini = document.createElement("span");
    ini.className = "tc ini";
    ini.textContent = w[0];
    ini.dataset.item = `${spec.id}-${w[0]}`;
    const rest = document.createElement("span");
    rest.className = "rest";
    rest.textContent = w.slice(1);
    word.append(ini, rest);
    box.append(word);
  });
  box.append(div("al-pad"));
  const label = div("al-label");
  label.textContent = "Auto layout";
  box.append(label);
  el.append(box);
  return el;
}

/** The finished state, for a scene that starts where this one ended. */
export function acronymEnd(el: HTMLElement) {
  const box = el.querySelector<HTMLElement>(".al")!;
  box.style.fontSize = `${TO}px`;
  box.classList.add("open");
  box.querySelectorAll<HTMLElement>(".rest").forEach((r) => (r.style.maxWidth = "none"));
  box.querySelectorAll<HTMLElement>(".al-pad").forEach((p) => (p.style.width = `${PAD}em`));
  box.querySelectorAll<HTMLElement>(".al-gap").forEach((g) => (g.style.width = `${GAP}em`));
  const pill = div("L pill hug");
  pill.textContent = "Hug × Hug";
  el.append(pill);
  requestAnimationFrame(() => placeUnder(pill, box, el));
}

const placeUnder = (pill: HTMLElement, box: HTMLElement, el: HTMLElement) => {
  pill.style.left = `${box.offsetLeft + box.offsetWidth / 2}px`;
  pill.style.top = `${box.offsetTop + box.offsetHeight + 22}px`;
};

export async function playAcronym(el: HTMLElement, alive: () => boolean) {
  el.style.visibility = "visible";
  const box = el.querySelector<HTMLElement>(".al")!;
  await sparkIn(box, 260, alive);
  if (!alive()) return;
  await wait(250);

  // the speaker's cursor comes in and clicks the word.
  const cur = namedCursor();
  el.append(cur);
  const tx = box.offsetLeft + box.offsetWidth * 0.86;
  const ty = box.offsetTop + box.offsetHeight * 0.78;
  await tween(650, (e) => place(cur, { x: 1700 + (tx - 1700) * e, y: 640 + (ty - 640) * e }), alive);
  await cur.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 220 }).finished;
  if (!alive()) return;
  const ink = [...box.querySelectorAll<HTMLElement>(".ini")].map((c) => c.getBoundingClientRect());
  const st = el.getBoundingClientRect();
  const k = st.width / 1920;
  const x0 = (Math.min(...ink.map((r) => r.left)) - st.left) / k - 16;
  const x1 = (Math.max(...ink.map((r) => r.right)) - st.left) / k + 16;
  const y0 = box.offsetTop + FROM * 0.2;
  const y1 = box.offsetTop + FROM * 0.97;
  const sel = selectionEl(x0, y0, x1 - x0, y1 - y0);
  const size = div("L pill");
  size.textContent = `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`;
  place(size, { x: (x0 + x1) / 2, y: y1 + 18 });
  size.style.transform = "translateX(-50%)";
  el.append(sel, size);
  sel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "both" });
  size.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "both" });
  await wait(700);
  if (!alive()) return;

  // Unfold: the type shrinks while each word spells itself out; then the frame shows its auto layout.
  sel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "both" });
  size.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "both" });
  cur.animate([{ transform: "translate(0,0)" }, { transform: "translate(120px, 150px)" }], { duration: 900, easing: ENTER, fill: "both" });
  const rests = [...box.querySelectorAll<HTMLElement>(".rest")];
  const ems = rests.map((r) => r.scrollWidth / FROM);
  const opts = { duration: 900, easing: ENTER, fill: "both" as const };
  box.animate([{ fontSize: `${FROM}px` }, { fontSize: `${TO}px` }], opts);
  box.querySelectorAll<HTMLElement>(".al-pad").forEach((p) => p.animate([{ width: "0em" }, { width: `${PAD}em` }], opts));
  box.querySelectorAll<HTMLElement>(".al-gap").forEach((g) => g.animate([{ width: "0em" }, { width: `${GAP}em` }], opts));
  await Promise.all(rests.map((r, i) => r.animate([{ maxWidth: "0em" }, { maxWidth: `${ems[i] + 0.02}em` }], { duration: 900, easing: ENTER, fill: "both" }).finished));
  if (!alive()) return;
  box.classList.add("open");
  const pill = div("L pill hug");
  pill.textContent = "Hug × Hug";
  el.append(pill);
  placeUnder(pill, box, el);
  pill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" });
  await wait(400);
}

/* ── The speaker's cursor, used across the film: glides to a point and clicks ── */
export async function clickAt(parent: HTMLElement, x: number, y: number, alive: () => boolean, cur?: HTMLElement) {
  const c = cur ?? namedCursor();
  if (!c.isConnected) parent.append(c);
  const sx = cur ? parseFloat(c.style.left) : x + 300;
  const sy = cur ? parseFloat(c.style.top) : y + 240;
  if (!cur) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "both" });
  await tween(600, (e) => place(c, { x: sx + (x - sx) * e, y: sy + (y - sy) * e }), alive);
  if (alive()) await c.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 220 }).finished;
  return c;
}

/* ── Drop-in: an empty dashed slot at the end of the sentence; the speaker's
   cursor carries the Figma icon in and lets go — "I didn't even know [Figma]" ── */
export function buildDropin(spec: LayerSpec, img: HTMLImageElement | null): HTMLElement {
  const el = div("L dropin");
  place(el, { x: 0, y: 0, w: 1920, h: 1080 });
  const slot = div("slot");
  place(slot, spec);
  const icon = div("dropin-icon");
  place(icon, spec);
  if (img) icon.append(img.cloneNode());
  el.append(slot, icon);
  return el;
}

export async function playDropin(el: HTMLElement, spec: LayerSpec, alive: () => boolean) {
  el.style.visibility = "visible";
  const slot = el.querySelector<HTMLElement>(".slot")!;
  const icon = el.querySelector<HTMLElement>(".dropin-icon")!;
  const { x = 0, y = 0, w = 80, h = 120 } = spec;
  await slot.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300, easing: ENTER, fill: "both" }).finished;
  await wait(250);
  const cur = namedCursor();
  el.append(cur);
  const fx = x + 520;
  const fy = y - 260;
  const grab = { dx: w * 0.55, dy: h * 0.6 }; // where the cursor holds the icon
  icon.style.opacity = "1";
  await tween(800, (e) => {
    const cx = fx + (x + grab.dx - fx) * e;
    const cy = fy + (y + grab.dy - fy) * e;
    place(cur, { x: cx, y: cy });
    place(icon, { x: cx - grab.dx, y: cy - grab.dy });
    icon.style.transform = `scale(${1.15 - 0.15 * e}) rotate(${6 * (1 - e)}deg)`;
  }, alive);
  if (!alive()) return;
  icon.style.transform = "";
  icon.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 300, easing: ENTER });
  slot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "both" });
  // Let go, the cursor rests beside the icon, level with the line rather than below it.
  cur.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${w * 0.7}px, ${-h * 0.55}px)` }], { duration: 600, easing: ENTER, fill: "both" });
  await wait(400);
}

/* ── Stack: a list as an auto layout frame; the speaker's cursor
   selects the first, the others wait in grey ── */
export function buildStack(spec: LayerSpec, onCamera: boolean): HTMLElement {
  const el = div("L stack-wrap");
  place(el, { x: 0, y: 0, w: 1920, h: 1080 });
  const box = div("stack");
  place(box, { x: spec.x, y: spec.y });
  box.style.fontSize = `${spec.size ?? 64}px`;
  box.append(div("st-pad"));
  (spec.rows ?? []).forEach((r, i) => {
    if (i) box.append(div("st-gap"));
    const row = div(`st-row text serif ${onCamera ? "on-camera" : "ink"}${r.dim ? " dim" : ""}`);
    row.textContent = r.text;
    row.dataset.row = String(i);
    box.append(row);
  });
  box.append(div("st-pad"));
  const label = div("al-label");
  label.textContent = "Auto layout";
  box.append(label);
  el.append(box);
  return el;
}

export async function playStack(el: HTMLElement, alive: () => boolean) {
  el.style.visibility = "visible";
  const box = el.querySelector<HTMLElement>(".stack")!;
  const rows = [...box.querySelectorAll<HTMLElement>(".st-row")];
  const gaps = [...box.querySelectorAll<HTMLElement>(".st-gap")];
  // The frame hugs its rows: it starts with the first and grows down as each one is added.
  const full = rows.map((r) => r.offsetHeight);
  const gapH = gaps.map((g) => g.offsetHeight);
  const ops = rows.map((r) => getComputedStyle(r).opacity);
  rows.forEach((r, i) => i && (r.style.height = "0px", r.style.opacity = "0"));
  gaps.forEach((g) => (g.style.height = "0px"));
  box.classList.add("open");
  box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" });
  rows[0].animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: ops[0], transform: "translateY(0)" }], { duration: 450, easing: ENTER, fill: "both" });
  await wait(500);
  for (let i = 1; i < rows.length; i++) {
    if (!alive()) return;
    const grow = { duration: 450, easing: ENTER, fill: "both" as const };
    gaps[i - 1].animate([{ height: "0px" }, { height: `${gapH[i - 1]}px` }], grow);
    rows[i].animate([{ height: "0px", opacity: 0 }, { height: `${full[i]}px`, opacity: ops[i] }], grow);
    await wait(500);
  }
  if (!alive()) return;
  const pill = div("L pill");
  pill.textContent = "Hug × Hug";
  place(pill, { x: box.offsetLeft + box.offsetWidth / 2, y: box.offsetTop + box.offsetHeight + 18 });
  pill.style.transform = "translateX(-50%)";
  el.append(pill);
  pill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "both" });
  await wait(300);
  const first = rows[0];
  const fx = box.offsetLeft + first.offsetLeft;
  const fy = box.offsetTop + first.offsetTop;
  await clickAt(el, fx + first.offsetWidth * 0.8, fy + first.offsetHeight * 0.7, alive);
  if (!alive()) return;
  const sel = selectionEl(fx - 6, fy - 2, first.offsetWidth + 12, first.offsetHeight + 4);
  el.append(sel);
  sel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "both" });
}

/* ── Poster → prototype: the poster gathers to the centre while
   the speaker's cursor comes in; she clicks a screen printed on it and
   the camera dives in — the poster swells past and fades as that screen grows
   into scene 6's phone, its frame closing round it as it lands. Like clicking a
   prototype hotspot in Figma. Returns the flying screen for the caller to remove
   once the real phone is showing. ── */
export async function protoFlight(
  prev: HTMLElement,
  posterId: string,
  screen: [number, number, number, number], // the screen on the poster, as fractions of the poster
  src: string,
  to: { x: number; y: number; w: number; h: number }, // the phone's outer box
  alive: () => boolean,
  onLanding: () => void, // a little before it lands: bring the rest of scene 6 in
) {
  const poster = prev.querySelector<HTMLElement>(`[data-id="${posterId}"]`)!;
  [...prev.children].forEach((c) => c !== poster && (c as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out", fill: "both" }));
  const px = parseFloat(poster.style.left), py = parseFloat(poster.style.top);
  const pw = parseFloat(poster.style.width), ph = parseFloat(poster.style.height);
  const k = Math.min(1.25, 1000 / ph);
  const cx = (1920 - pw * k) / 2, cy = (1080 - ph * k) / 2;
  const [fx, fy, fw, fh] = screen;
  const s = { x: cx + pw * k * fx, y: cy + ph * k * fy, w: pw * k * fw, h: ph * k * fh };
  poster.style.transformOrigin = "0 0";
  poster.style.zIndex = "5";
  const centred = `translate(${cx - px}px, ${cy - py}px) scale(${k})`;
  // Gather and cursor-in overlap, so it reads as one motion.
  const gather = poster.animate([{ transform: "translate(0, 0) scale(1)" }, { transform: centred }], { duration: 550, easing: ENTER, fill: "both" }).finished;
  await wait(180);
  const cur = await clickAt(prev, s.x + s.w * 0.6, s.y + s.h * 0.55, alive);
  await gather;
  if (!alive()) return null;
  const shot = div("L proto-shot");
  place(shot, s);
  const img = document.createElement("img");
  img.src = `/${src}`;
  shot.append(img);
  prev.parentElement!.append(shot);
  cur.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "both" });
  // Dive: the poster swells about the clicked screen and fades, as if the camera went into it.
  const ox = s.x + s.w / 2, oy = s.y + s.h / 2;
  const dive = 2.4;
  poster.animate(
    [
      { transform: centred, opacity: 1 },
      { transform: `translate(${ox - (ox - cx) * dive - px}px, ${oy - (oy - cy) * dive - py}px) scale(${k * dive})`, opacity: 0 },
    ],
    { duration: 700, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "both" },
  );
  prev.animate([{ backgroundColor: getComputedStyle(prev).backgroundColor }, { backgroundColor: "rgba(245,245,245,0)" }], { duration: 700, fill: "both" });
  setTimeout(onLanding, fast(420));
  await shot.animate(
    [
      { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px`, borderWidth: "0px", borderRadius: "4px" },
      { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px`, borderWidth: "14px", borderRadius: "56px" },
    ],
    { duration: 750, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" },
  ).finished;
  return shot;
}
