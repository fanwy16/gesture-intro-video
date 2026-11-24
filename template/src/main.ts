import "./style.css";
import data from "../scenes.json";
import { Hands, Motion, type Hand, type Pt } from "./hands";
import { Sheet } from "./sheet";
import {
  buildGuides, buildImage, buildLeader, buildPill, buildRect, buildSelect, buildChip, buildColumn, scrollColumn, buildTag, buildText,
  countIn, dimTo, fadeIn, leave, pause, printIn, sparkIn, upIn, riseIn, slideIn, typeIn, wait, type LayerSpec,
} from "./layers";
import { SPEAKER, protoFlight, acronymEnd, buildAcronym, buildCursor, buildDropin, buildStack, clickAt, cursorIn, playDropin, playStack, buildMarquee, buildPhone, Dock, growPhone, playAcronym, playMarquee } from "./specials";

/*
 * One scene per spoken sentence (scenes.json), laid out from the Figma
 * storyboard. A scene's beats run in order: after a pause, or on a trigger —
 *   L   lift: an open hand rising from the lower part of the frame
 *   D   drop: a fast move down or sideways
 *   P   index finger up
 * → (or a clicker's Page Down / Space) is the one key for a take: it moves to
 * the next scene and sets off that scene's opening move (lift, drop, rise) at
 * once; while a move is waiting it sets that off instead. N moves to the next
 * scene and leaves its opening move to the hand (lift, fast move).
 * ← goes back, T restarts the scene, H shows the scene notes (hidden by default), G hides the hand points and lift lines (shown by default), W switches the type over the
 * camera between white and ink, P opens the teleprompter window, F fullscreen.
 */

type Trigger = "S" | "L" | "D" | "P";
interface Beat {
  wait?: number;
  on?: Trigger;
  do?: "lift" | "drop" | "zoom" | "push" | "fly" | "proto" | "putdown" | "pan" | "rise" | "dock" | "open" | "next";
  target?: string; // zoom: the layer (or column item) the camera dives into; fly: the layer that flies
  to?: [number, number, number, number]; // fly, proto: where it lands (x, y, w, h)
  screen?: [number, number, number, number]; // proto: the screen on the poster (fractions)
  src?: string; // proto: that screen's image
  phone?: string; // proto: the phone layer it becomes (default "phone")
  app?: number;
  select?: boolean;
  hide?: string[];
  dim?: string[];
  show?: string[];
  together?: boolean;
  stagger?: number;
  auto?: boolean;
  hand?: boolean; // this move waits for the hand even when the scene was reached with → (→ again sets it off)
  dur?: number; // putdown: how long it takes // a zoom or push that runs by itself instead of waiting for D
  night?: boolean; // the camera goes dark and the text turns white
  click?: string; // the speaker's cursor glides to this layer (or selector) and clicks it, before anything is shown
  clickPoint?: [number, number]; // where on it, as fractions of its box (default 0.62, 0.55)
}
interface Scene {
  id: string;
  spoken: string;
  sheet?: "full" | "lift" | "rise" | "open";
  canvas?: boolean; // the sheet is Figma's dotted canvas
  liftMode?: "palm" | "pinch" | "pull"; // how the hand brings the sheet in: palm up from below, two hands pinching it up and apart, or one hand pulling it down from the top
  openFrom?: string; // sheet "open": grows out of this element of the previous scene (e.g. the Figma app in the Dock)
  startWith?: string;
  charMs?: number;
  layers: LayerSpec[];
  beats: Beat[];
}

const W = 1920;
const H = 1080;
const LIFT_ZONE = 0.62 * H;
const LIFT_START = 0.05 * H;
const SNAP_LINE = 0.38 * H;
const LOST_MS = 300;
const PINCH = 0.24; // thumb–index gap (in hand sizes) that counts as gripping the sheet…
const PINCH_HOLD = 0.4; // …and that still holds it once it is up
const GRIP_MS = 250; // how long both hands must grip before the sheet lifts
const PUT_START = 0.45 * H; // put down: an open hand starting above here…
const PUT_END = 0.8 * H; // …and lowered to here
const PAN_DIST = 0.2 * W; // pan: an open hand pushed this far, either way
const WAVE_V = 2.0; // scatter: a wave this fast (stage px per ms)…
const WAVE_DIST = 0.16; // …covering this much of the frame
const INDEX_HOLD_MS = 250;

const scenes = data.scenes as Scene[];
// The speaker's cursor name and colour (Figma multiplayer style).
Object.assign(SPEAKER, (data as { speaker?: Partial<typeof SPEAKER> }).speaker ?? {});
const byId = new Map(scenes.map((s) => [s.id, s]));

const stage = document.getElementById("stage")!;
const video = document.getElementById("camera") as HTMLVideoElement;
const sheetLayer = document.getElementById("sheet-layer")!;
const tilesLayer = document.getElementById("tiles")!;
const stageLayer = document.getElementById("stage-layer")!;
const guides = (document.getElementById("guides") as HTMLCanvasElement).getContext("2d")!;
const sceneNo = document.getElementById("scene-no")!;
const spoken = document.getElementById("spoken")!;
const waiting = document.getElementById("waiting")!;
const message = document.getElementById("message")!;

const hands = new Hands();
const motion = new Motion();
let handsReady = false;

/* ── Stage ── */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
}
addEventListener("resize", fit);
fit();

function toStage(nx: number, ny: number): Pt {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const s = Math.max(W / vw, H / vh);
  const x = nx * vw * s + (W - vw * s) / 2;
  return { x: W - x, y: ny * vh * s + (H - vh * s) / 2 };
}

/* ── Assets ── */
const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  if (!images.has(src)) {
    const img = new Image();
    img.src = `/${src}`;
    images.set(src, img.decode().then(() => img, () => null));
  }
  return images.get(src)!;
}
function loadVideo(src?: string): Promise<HTMLVideoElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const v = Object.assign(document.createElement("video"), { src: `/${src}`, muted: true, loop: true, playsInline: true });
    v.onloadeddata = () => resolve(v);
    v.onerror = () => resolve(null);
  });
}
const srcsOf = (s?: Scene) => (s ? s.layers.flatMap((l) => [l.src, l.screen, ...(l.apps ?? []).map((a) => a.icon), ...(l.items ?? []).map((it) => it.src)]).filter((x): x is string => !!x) : []);

/* ── Building a scene ── */
// When each column started scrolling, so the next scene's copy carries on from the same place.
const scrollEpoch = new Map<string, number>();

interface Built {
  els: Map<string, HTMLElement>;
  dock?: Dock;
}

async function buildLayers(scene: Scene, parent: HTMLElement, onSheet: boolean, visible: Set<string>): Promise<Built> {
  const els = new Map<string, HTMLElement>();
  let dock: Dock | undefined;
  for (const spec of scene.layers) {
    let el: HTMLElement;
    switch (spec.kind) {
      case "text": el = buildText(spec, onSheet); break;
      case "image": case "icon": el = buildImage(spec, await loadImage(spec.src)); break;
      case "rect": el = buildRect(spec); break;
      case "select": el = buildSelect(spec); break;
      case "guides": el = buildGuides(spec); break;
      case "tag": el = buildTag(spec); break;
      case "chip": el = buildChip(spec); break;
      case "acronym": el = buildAcronym(spec); break;
      case "cursor": el = buildCursor(spec); break;
      case "dropin": el = buildDropin(spec, await loadImage(spec.src)); break;
      case "stack": el = buildStack(spec, !onSheet); break;
      case "column": el = buildColumn(spec, await Promise.all((spec.items ?? []).map((it) => loadImage(it.src)))); break;
      case "leader": el = buildLeader(spec); break;
      case "pill": el = buildPill(spec); break;
      case "marquee": el = buildMarquee(spec); break;
      case "phone": el = buildPhone(spec, await loadImage(spec.screen), await loadVideo(spec.video)); break;
      case "dock": {
        dock = new Dock(spec, await Promise.all((spec.apps ?? []).map((a) => loadImage(a.icon))));
        el = dock.el;
        break;
      }
    }
    if (spec.kind === "icon") el.classList.add("icon");
    el.dataset.id = spec.id;
    const on = visible.has(spec.id);
    el.style.visibility = on ? "visible" : "hidden";
    if (on && el.dataset.opacity) el.style.opacity = el.dataset.opacity;
    if (on && spec.kind === "acronym") acronymEnd(el);
    if (on && spec.kind === "column") scrollColumn(el, spec, scrollEpoch.get(spec.id) ?? performance.now());
    if (on) el.querySelectorAll(".tc").forEach((c) => c.classList.add("on"));
    parent.append(el);
    els.set(spec.id, el);
  }
  return { els, dock };
}

/** Which layers are on screen once every beat has run (for a scene that starts where another ended). */
function endState(scene: Scene): Set<string> {
  const v = new Set(scene.layers.filter((l) => l.initial).map((l) => l.id));
  for (const b of scene.beats) {
    b.hide?.forEach((id) => v.delete(id));
    b.show?.forEach((id) => v.add(id));
    if (b.do === "proto") v.add(b.phone ?? "phone"); // shown by the flight itself
  }
  return v;
}

/* ── Scene state ── */
let index = 0;
let token = 0;
let current: Scene;
let built: Built = { els: new Map() };
let sheet: Sheet | null = null; // this scene's sheet
let prevSheet: Sheet | null = null; // the previous scene's sheet, waiting to be dropped
let pending: { trigger: Trigger; resolve: (v: number) => void } | null = null;
const early = new Set<Trigger>(); // keys pressed before their beat came up
let armY: number | null = null;
let lastSeen = 0;
let auto: { t0: number; from: Pt; to: Pt } | null = null;
let indexSince = 0;
let exitMove: string | null = null; // the move waiting on the hand: drop (scatter), putdown or pan
let exitSheet: Sheet | null = null;
let putArm: number | null = null; // where a put-down started (palm y)
let panArm: number | null = null; // where a pan started (palm x)
let pinchLift = false; // two hands are carrying the sheet up
let pinchSeen = 0;
let pinchSince = 0; // both hands have been pinching since… (a lift needs a steady grip first)
let liftScale = 0.12; // smoothed, so the sheet doesn't jump with every wobble of the hands
let pullArm = false; // one hand is pulling the sheet down

let dropReadyAt = 0;
let dropDir = 0; // the direction of a drop that came in early (gesture or key)
let sceneDone = false;
let openFrom: { x: number; y: number; w: number; h: number } | null = null;
let leftover: Element[] = [];
let speakerCursor: HTMLElement | undefined; // the speaker's cursor in this scene, once it has appeared

const alive = (t: number) => () => t === token;

function waitFor(trigger: Trigger): Promise<number> {
  waiting.textContent = `waiting: ${trigger === "L" ? GESTURE[current.liftMode ?? "lift"] : trigger === "D" && exitMove ? GESTURE[exitMove] : trigger} — or →`;
  const queued = early.delete(trigger);
  if (queued && trigger !== "L") {
    waiting.textContent = "";
    return Promise.resolve(trigger === "D" ? dropDir : 0);
  }
  if (queued) startAutoLift(); // L pressed early: run the scripted lift now
  return new Promise((resolve) => {
    pending = { trigger, resolve: (v) => { waiting.textContent = ""; resolve(v); } };
    sendPrompt();
  });
}
function fire(trigger: Trigger, value = 0, fromKey = false) {
  if (pending?.trigger === trigger) {
    const p = pending;
    pending = null;
    p.resolve(value);
    sendPrompt();
  } else if (trigger === "D" && dropOpensNext()) {
    // The scene has played out and the next one begins by breaking it up: one drop does both.
    runScene(index + 1);
    early.add("D");
    dropDir = value;
  } else if (fromKey) {
    early.add(trigger);
    dropDir = 0;
  } // gestures never queue: a stray movement shouldn't fire later
}

/** True once this scene has played out, when the next one starts by dropping (or zooming, pushing) it away. */
function dropOpensNext() {
  const next = scenes[index + 1];
  return sceneDone && !pending && next?.startWith === current.id && TRANSITIONS.has(next.beats[0]?.do ?? "");
}

/** The → key: set off the move that is waiting, or go on to the next scene and set off its opening move. */
function advance() {
  if (pending?.trigger === "L") return startAutoLift();
  if (pending) return fire(pending.trigger, 0, true);
  runScene(index + 1, true);
}

/** The trigger of a scene's first move that waits (lift, drop, index finger), if any. */
function openingTrigger(scene: Scene): Trigger | null {
  const b = scene.beats.find((x) => x.on || x.do === "lift" || (x.do && TRANSITIONS.has(x.do) && !x.auto));
  if (!b || b.hand) return null; // left to the hand
  return b.do === "lift" ? "L" : b.do && TRANSITIONS.has(b.do) ? "D" : b.on!;
}

async function runScene(i: number, go = false) {
  index = (i + scenes.length) % scenes.length;
  const t = ++token;
  pending = null;
  sceneDone = false;
  speakerCursor = undefined;
  early.clear();
  waiting.textContent = "";
  armY = null;
  auto = null;
  pinchLift = pullArm = false;
  motion.clear();
  // The old sheets stay up until the new ones are built, so a scene change never flashes the camera.
  const old = [sheet, prevSheet];
  const clearOld = () => old.forEach((s) => s?.destroy());
  sheet = prevSheet = null;
  const scene = (current = scenes[index]);
  const opening = go ? openingTrigger(scene) : null;
  if (opening) {
    early.add(opening);
    dropDir = 0;
  }
  // A scene that opens out of the previous one keeps it on screen until the sheet has grown over it.
  openFrom = scene.openFrom ? rectOf(stageLayer, scene.openFrom) : null;
  leftover = scene.openFrom ? [...stageLayer.children] : [];
  stageLayer.replaceChildren(...leftover);
  stageLayer.classList.remove("night");
  tilesLayer.replaceChildren();

  sceneNo.textContent = `${index + 1} / ${scenes.length}  ${scene.id}`;
  spoken.textContent = scene.spoken;
  sendPrompt();
  [...srcsOf(scene), ...srcsOf(scenes[index + 1])].forEach((s) => loadImage(s));

  // This scene's own layers: on its sheet, or straight on the camera.
  const initial = new Set(scene.layers.filter((l) => l.initial).map((l) => l.id));
  if (scene.sheet) {
    sheet = new Sheet(sheetLayer, scene.sheet === "full");
    if (scene.canvas) sheet.el.dataset.bg = "canvas";
    if (scene.sheet === "open") sheet.hideFor(openFrom);
    built = await buildLayers(scene, sheet.el, true, initial);
  } else {
    built = await buildLayers(scene, stageLayer, false, initial);
  }
  if (t !== token) return clearOld();
  // The previous scene's ending, full screen on top, to be dropped.
  if (scene.startWith) {
    const prev = byId.get(scene.startWith)!;
    prevSheet = new Sheet(sheetLayer, true);
    if (prev.canvas) prevSheet.el.dataset.bg = "canvas";
    await buildLayers(prev, prevSheet.el, true, endState(prev));
    if (t !== token) return (clearOld(), prevSheet?.destroy());
  }
  clearOld();

  for (const beat of scene.beats) {
    if (t !== token) return;
    await runBeat(beat, scene, t);
  }
  if (t !== token) return;
  sceneDone = true;
  dropReadyAt = performance.now() + 300;
}

// Ways from one full sheet to the next (all wait for D or a fast hand movement).
const TRANSITIONS = new Set(["drop", "zoom", "push", "fly", "proto", "putdown", "pan"]);

/** Where a layer (or a selector's element) sits on the stage now; for a scrolling column, the copy nearest the middle. */
function rectOf(root: HTMLElement, id: string) {
  const st = stage.getBoundingClientRect();
  const k = st.width / W;
  const sel = id.startsWith("[") ? id : `[data-id="${id}"], [data-item="${id}"]`; // a layer id, or any selector
  const els = [...root.querySelectorAll<HTMLElement>(sel)];
  // Text measures by its letters, not its box (a centred line's box is the whole frame wide).
  const box = (e: HTMLElement) => {
    const cs = [...e.querySelectorAll<HTMLElement>(".tc")].map((c) => c.getBoundingClientRect()).filter((q) => q.width);
    if (!cs.length) return e.getBoundingClientRect();
    const left = Math.min(...cs.map((q) => q.left)), top = Math.min(...cs.map((q) => q.top));
    return { left, top, width: Math.max(...cs.map((q) => q.right)) - left, height: Math.max(...cs.map((q) => q.bottom)) - top };
  };
  const rects = els.map(box).map((r) => ({ x: (r.left - st.left) / k, y: (r.top - st.top) / k, w: r.width / k, h: r.height / k }));
  const d = (r: { x: number; y: number; w: number; h: number }) => Math.hypot(r.x + r.w / 2 - W / 2, r.y + r.h / 2 - H / 2);
  return rects.sort((a, b) => d(a) - d(b))[0] ?? { x: 0, y: 0, w: W, h: H };
}

async function runBeat(b: Beat, scene: Scene, t: number) {
  const ok = alive(t);
  if (b.do === "next") {
    await pause(b.wait ?? 600);
    if (ok()) runScene(index + 1);
    return;
  }
  if (b.on && b.do !== "lift" && !TRANSITIONS.has(b.do!)) await waitFor(b.on);
  else if (!b.do || b.do === "dock" || b.do === "open" || b.auto) await pause(b.wait ?? 200);
  if (!ok()) return;

  if (b.do === "lift" && sheet) {
    await waitFor("L");
    if (!ok()) return;
    await sheet.snap();
  }
  if (b.do && TRANSITIONS.has(b.do)) {
    const target = prevSheet ?? sheet;
    if (target) {
      dropReadyAt = performance.now() + 300;
      exitMove = b.do;
      exitSheet = target;
      putArm = panArm = null;
      const dir = b.auto ? 0 : await waitFor("D");
      exitMove = null;
      if (!ok()) return;
      motion.clear();
      if (b.do === "fly") {
        // The flight and this beat's own arrivals run together.
        const keep = target.el.querySelector<HTMLElement>(`[data-id="${b.target}"]`)!;
        const [x, y, w, h] = b.to!;
        const flight = target.flyTo(keep, rectOf(target.el, b.target!), { x, y, w, h });
        await showAll(b, scene, ok);
        await flight;
        return;
      }
      if (b.do === "proto") {
        const [x, y, w, h] = b.to!;
        const landing = new Promise<void>((land) => {
          void protoFlight(target.el, b.target!, b.screen!, b.src!, { x, y, w, h }, ok, () => void showAll(b, scene, ok)).then((shot) => {
            // The real phone takes over under the flying screen, then the screen goes.
            const phone = built.els.get(b.phone ?? "phone");
            if (phone && ok()) {
              phone.style.visibility = "visible";
              phone.querySelector("video")?.play().catch(() => undefined);
            }
            shot?.remove();
            target.state = "hidden";
            target.el.style.display = "none";
            land();
          });
        });
        await landing;
        return;
      }
      if (b.do === "drop") await target.drop(tilesLayer, dir);
      else if (b.do === "putdown") await target.putDown(b.dur ?? 900);
      else if (b.do === "pan") await target.pan(target === prevSheet ? sheet : null, dir || -1);
      else if (b.do === "push") await target.push(target === prevSheet ? sheet : null);
      else await target.zoomInto(rectOf(target.el, b.target ?? ""));
    }
  }
  if (b.do === "open" && sheet && openFrom) {
    await sheet.openFrom(openFrom);
    leftover.forEach((e) => e.remove());
    leftover = [];
  }
  if (b.night) stageLayer.classList.add("night");
  if (b.click) {
    const target = built.els.get(b.click) ?? document.querySelector<HTMLElement>(b.click);
    const parent = target?.closest<HTMLElement>(".sheet") ?? stageLayer;
    const r = rectOf(parent, b.click);
    const [fx, fy] = b.clickPoint ?? [0.62, 0.55];
    speakerCursor = await clickAt(parent, r.x + r.w * fx, r.y + r.h * fy, ok, speakerCursor?.parentElement === parent ? speakerCursor : undefined);
    if (!ok()) return;
  }
  if (b.do === "rise" && sheet) sheet.rise(700);
  if (b.do === "dock" && built.dock) await built.dock.hover(b.app ?? 0, ok, !!b.select);
  if (!ok()) return;

  if (b.dim?.length) {
    await Promise.all(b.dim.map((id, k) => {
      const el = built.els.get(id);
      const spec = scene.layers.find((l) => l.id === id);
      return el && spec ? wait(k * 60).then(() => dimTo(el, spec.opacity ?? 0.35, spec.blur ?? 24)) : Promise.resolve();
    }));
  }
  if (b.hide?.length) await Promise.all(b.hide.map((id, k) => (built.els.get(id) ? leave(built.els.get(id)!, 450, k * 40) : Promise.resolve())));
  await showAll(b, scene, ok);
}

async function showAll(b: Beat, scene: Scene, ok: () => boolean) {
  const shows = (b.show ?? []).map((id) => [id, built.els.get(id), scene.layers.find((l) => l.id === id)] as const);
  if (b.together) {
    await Promise.all(shows.map(([, el, spec], k) => (el && spec ? enter(el, spec, scene, ok, k * (b.stagger ?? 0)) : Promise.resolve())));
  } else {
    for (const [, el, spec] of shows) {
      if (!ok()) return;
      if (el && spec) await enter(el, spec, scene, ok, 0);
    }
  }
}

async function enter(el: HTMLElement, spec: LayerSpec, scene: Scene, ok: () => boolean, delay: number) {
  if (delay) await wait(delay);
  if (!ok()) return;
  if (spec.delay) await wait(spec.delay);
  switch (spec.kind) {
    case "text":
      if (spec.enter === "print" || (spec.font === "mono" && spec.enter !== "type")) return printIn(el, 650);
      if (spec.enter === "spark") return sparkIn(el, spec.dur ?? 260, ok);
      if (spec.enter === "count") return countIn(el, spec.dur ?? 700);
      return typeIn(el, scene.charMs ?? 32, ok);
    case "marquee": return playMarquee(el, spec, ok);
    case "acronym": return playAcronym(el, ok);
    case "cursor": return cursorIn(el, spec);
    case "dropin": return playDropin(el, spec, ok);
    case "stack": return playStack(el, ok);
    case "column":
      scrollEpoch.set(spec.id, performance.now());
      scrollColumn(el, spec, performance.now());
      return riseIn(el, spec.dur ?? 1100);
    case "phone": return spec.enter === "fade" ? fadeIn(el, spec.dur ?? 150) : growPhone(el, spec, ok);
    case "dock": return built.dock?.enter();
    case "select": case "guides": case "tag": case "chip": case "leader": case "pill": return fadeIn(el, 320);
    default:
      if (spec.enter === "rise") return riseIn(el, spec.dur ?? 1100);
      if (spec.enter === "slide") return slideIn(el, spec.dur ?? 700);
      if (spec.enter === "up") return upIn(el, spec.dur ?? 700);
      if (spec.enter === "fade") return fadeIn(el, spec.dur ?? 400);
      return printIn(el, spec.dur ?? 900);
  }
}

/* ── Gestures, every frame ── */
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

function onFrame(hand: Hand | null, now: number) {
  if (hand) {
    lastSeen = now;
    motion.push(hand.palm, now);
  }
  const want = pending?.trigger;

  // The scene has played out and the next one opens with a hand lift: starting that gesture moves on by
  // itself (the next scene picks the same hands up straight away), no key needed.
  if (!want && sceneDone && !pending) {
    const next = scenes[index + 1];
    const nb = next?.beats[0];
    if (nb?.do === "lift" && nb.hand) {
      const low = hands.all.filter((h) => h.pinchD < PINCH && h.pinchAt.y > 0.6 * H);
      if (low.length >= 2) pinchSince ||= now;
      else pinchSince = 0;
      const starts =
        next.liftMode === "pinch" ? low.length >= 2 && now - pinchSince > GRIP_MS : next.liftMode === "pull" ? !!hand && hand.palm.y < 0.3 * H && (hand.open || hand.pinch) : !!hand?.open && hand.palm.y > LIFT_ZONE;
      if (starts) {
        runScene(index + 1);
        return;
      }
    }
  }
  // Two hands pinch the sheet low in the frame and carry it up, pulling it wider until it snaps to full screen.
  if (want === "L" && sheet && current.liftMode === "pinch") {
    // Held loosely once lifted (PINCH_HOLD), but it takes a firm grip (PINCH) low in the frame, held a moment, to pick it up.
    const pinching = hands.all.filter((h) => h.pinchD < (pinchLift ? PINCH_HOLD : PINCH));
    if (pinching.length >= 2) {
      pinchSeen = now;
      pinchSince ||= now;
      const a = pinching[0].pinchAt;
      const b = pinching[pinching.length - 1].pinchAt;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (!pinchLift && cy > 0.6 * H && now - pinchSince > GRIP_MS) {
        pinchLift = true; // picked up from the bottom
        liftScale = 0.12;
      }
      if (pinchLift) {
        const target = Math.min(1, Math.max(0.12, (Math.abs(b.x - a.x) / W) * 1.1));
        liftScale += (target - liftScale) * 0.18;
        sheet.holdAt(cx, cy, liftScale);
        if (liftScale >= 0.7) {
          pinchLift = false;
          fire("L");
        }
      }
    } else {
      pinchSince = 0;
      if (pinchLift && now - pinchSeen > 450) {
        sheet.retreat();
        pinchLift = false;
      }
    }
    return;
  }
  // One hand raised to the top pulls the sheet down like a blind.
  if (want === "L" && sheet && current.liftMode === "pull") {
    if (hand && !pullArm && hand.palm.y < 0.3 * H && (hand.open || hand.pinch)) pullArm = true;
    if (pullArm) {
      if (!hand) {
        if (now - lastSeen > LOST_MS) (sheet.pullBack(), (pullArm = false));
      } else {
        sheet.pullTo(hand.palm.y + 60);
        if (hand.palm.y > 0.62 * H) {
          pullArm = false;
          fire("L");
        }
      }
    }
    return;
  }
  // Lift: an open hand below the lift line that rises; or the L key's scripted path.
  if (want === "L" && sheet) {
    if (auto) {
      const p = Math.min(1, (now - auto.t0) / 900);
      const palm = { x: auto.from.x, y: auto.from.y + (auto.to.y - auto.from.y) * easeOut(p) };
      sheet.hold(palm, (auto.from.y - palm.y) / (auto.from.y - SNAP_LINE));
      if (palm.y <= SNAP_LINE) {
        auto = null;
        fire("L");
      }
      return;
    }
    if (sheet.state === "hidden") {
      if (hand?.open && hand.palm.y > LIFT_ZONE) armY = Math.max(armY ?? 0, hand.palm.y);
      if (hand && !hand.open) armY = null;
      if (hand?.open && armY !== null && armY - hand.palm.y > LIFT_START) sheet.state = "held";
    }
    if (sheet.state === "held") {
      if (!hand) {
        if (now - lastSeen > LOST_MS) {
          sheet.retreat();
          armY = null;
        }
        return;
      }
      if (armY !== null && hand.palm.y > armY + 0.06 * H) {
        sheet.retreat();
        armY = null;
        return;
      }
      sheet.hold(hand.palm, (armY! - hand.palm.y) / (armY! - SNAP_LINE));
      if (hand.palm.y < SNAP_LINE) {
        armY = null;
        fire("L");
      }
    }
    return;
  }

  // Leaving a sheet, each move with its own gesture (keys always work too).
  const scatterNext = !want && dropOpensNext() && scenes[index + 1]?.beats[0]?.do === "drop";
  if ((want === "D" || scatterNext) && now > dropReadyAt) {
    const move = want === "D" ? exitMove : "drop";
    // Scatter: a quick wave of the hand, down or sideways; the tiles fly the way it went.
    if (move === "drop" && hand) {
      const v = motion.get();
      if (v) {
        if (Math.abs(v.vx) > WAVE_V && Math.abs(v.dx) > WAVE_DIST * W) fire("D", Math.sign(v.dx));
        else if (v.vy > WAVE_V && v.dy > WAVE_DIST * H) fire("D", 0);
      }
    }
    // Put down: an open hand raised, then lowered; the sheet shrinks onto it.
    if (move === "putdown" && exitSheet) {
      if (hand?.open && putArm === null && hand.palm.y < PUT_START) putArm = hand.palm.y;
      if (putArm !== null) {
        if (!hand) {
          if (now - lastSeen > LOST_MS) (exitSheet.settle(), (putArm = null));
        } else if (hand.palm.y < putArm - 0.06 * H) {
          exitSheet.settle();
          putArm = null;
        } else {
          const p = Math.min(1, Math.max(0, (hand.palm.y - putArm) / (PUT_END - putArm)));
          exitSheet.followDown(hand.palm, p);
          if (p >= 1) fire("D", 0);
        }
      }
    }
    // Pan: an open hand pushed to the left; the frame slides with it.
    if (move === "pan" && exitSheet) {
      const next = exitSheet === prevSheet ? sheet : null;
      if (hand?.open && panArm === null) panArm = hand.palm.x;
      if (panArm !== null) {
        // Once it has started it follows the palm even if the fingers blur mid-push; only losing the hand cancels it.
        if (!hand) {
          if (now - lastSeen > LOST_MS) (exitSheet.settle(next), (panArm = null));
        } else {
          const dx = hand.palm.x - panArm;
          exitSheet.followPan(dx, next);
          if (Math.abs(dx) >= PAN_DIST) fire("D", Math.sign(dx));
        }
      }
    }
  }
  // Index finger up, held briefly.
  if (want === "P") {
    if (hand?.indexUp) {
      indexSince ||= now;
      if (now - indexSince > INDEX_HOLD_MS) fire("P");
    } else indexSince = 0;
  }
}

/* ── Guides (never recorded: H hides them) ── */
function drawGuides(hand: Hand | null) {
  guides.clearRect(0, 0, W, H);
  if (stage.classList.contains("no-guides")) return; // the hand overlay has its own switch (G), apart from H
  guides.font = "16px ui-monospace, Menlo, monospace";
  if (pending?.trigger === "L" && !current.liftMode) {
    guides.setLineDash([10, 10]);
    guides.strokeStyle = "rgba(255,255,255,0.35)";
    guides.lineWidth = 1.5;
    for (const [y, label] of [[LIFT_ZONE, "open hand below here, then lift"], [SNAP_LINE, "snap"]] as const) {
      guides.beginPath();
      guides.moveTo(0, y);
      guides.lineTo(W, y);
      guides.stroke();
      guides.fillStyle = "rgba(255,255,255,0.6)";
      guides.fillText(label, W - 24 - guides.measureText(label).width, y - 8);
    }
    guides.setLineDash([]);
  }
  if (!hand) return;
  guides.fillStyle = "rgba(255,255,255,0.75)";
  for (const p of hand.pts) guides.fillRect(p.x - 3, p.y - 3, 6, 6);
  guides.beginPath();
  guides.arc(hand.palm.x, hand.palm.y, 16, 0, Math.PI * 2);
  guides.strokeStyle = hand.indexUp ? "#9747FF" : "#fff";
  guides.lineWidth = 3;
  guides.stroke();
  if (hand.open) guides.fill();
}

let statusAt = 0;
function loop(now: number) {
  const hand = handsReady ? hands.detect(video, toStage, now) : null;
  if (now - statusAt > 250) {
    statusAt = now;
    const cam = !!video.srcObject && video.readyState >= 2;
    prompter.postMessage({ status: !cam ? "📷 camera is off" : !handsReady ? "✋ hand tracking loading…" : hands.all.length ? `✋ ${hands.all.length} hand${hands.all.length > 1 ? "s" : ""} seen` : "✋ hand tracking ready (no hands seen)" });
  }
  onFrame(hand, now);
  drawGuides(hand);
  requestAnimationFrame(loop);
}

/** Key L: the palm follows a scripted path up through the snap line. */
function startAutoLift() {
  if (!sheet || sheet.state === "full") return;
  // The other lifts, set off by key: start from their opening pose and let the snap carry it.
  if (current.liftMode === "pinch" || current.liftMode === "pull") {
    if (current.liftMode === "pinch") sheet.holdAt(W / 2, H * 0.78, 0.14);
    else sheet.pullTo(0);
    queueMicrotask(() => fire("L"));
    return;
  }
  auto = { t0: performance.now(), from: { x: 0.66 * W, y: H + 120 }, to: { x: 0.66 * W, y: SNAP_LINE - 30 } };
}

/* ── Teleprompter: P opens it in its own window (put it by the camera; OBS records only this one) ── */
const prompter = new BroadcastChannel("prompter");
// What the hand does for each move that waits on it (the → key always works instead).
// Teleprompter cues for each move that waits on the hand (edit to translate).
const GESTURE: Record<string, string> = {
  lift: "Lift · open hand, raise it slowly from the bottom of the frame",
  pinch: "Pick up · pinch the sheet with both hands low in the frame, then pull them apart",
  pull: "Pull down · raise one hand to the top of the frame and pull the sheet down",
  putdown: "Put down · open hand above chest height, lower it slowly",
  pan: "Pan · push an open hand left or right",
  drop: "Shatter · a quick wave, sideways or down",
}
/** The move in a scene that waits on the hand, if any. */
function handMove(s?: Scene) {
  const b = s?.beats.find((x) => x.hand);
  if (!b?.do) return null;
  return b.do === "lift" ? s!.liftMode ?? "lift" : b.do;
}
function sendPrompt() {
  const cur = scenes[index];
  const now = pending && pending.trigger !== "S" ? (pending.trigger === "L" ? cur.liftMode ?? "lift" : exitMove) : null;
  const next = handMove(scenes[index + 1]);
  prompter.postMessage({
    no: `${index + 1} / ${scenes.length}`,
    line: cur.spoken,
    next: scenes[index + 1]?.spoken ?? "",
    cue: now ? `Now → ${GESTURE[now]}` : "",
    nextCue: next ? `Next scene opens with → ${GESTURE[next]} (do it when this line is done, no key needed)` : "",
  });
}
prompter.onmessage = (e) => e.data === "hello" && sendPrompt();

/* ── Keys ── */
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case "arrowright": case "pagedown": case " ": e.preventDefault(); advance(); break;
    case "n": runScene(index + 1); break; // next scene, its opening move left to the hand
    case "arrowleft": case "pageup": runScene(index - 1); break;
    case "t": runScene(index); break;
    case "h": stage.classList.toggle("clean"); break;
    case "g": stage.classList.toggle("no-guides"); break; // hand points and lift lines
    case "w": stage.classList.toggle("type-ink"); break;
    case "p": // a strip at the top centre of the screen, right under the camera
      window.open("/prompter.html", "prompter", `width=1200,height=210,left=${Math.round((screen.availWidth - 1200) / 2)},top=0`);
      break;
    case "f": if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
  }
});

/* ── Start ── */
async function start() {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false });
    await video.play();
  } catch {
    message.textContent = "Camera blocked: allow camera access for localhost and reload. Keys still work.";
  }
  await Promise.all([document.fonts.load('300 220px "Source Serif 4 Variable"'), document.fonts.load('400 22px "IBM Plex Mono"')]);
  // #s12-numbers (or #12) opens on that scene, for rehearsing one part.
  const hash = decodeURIComponent(location.hash.slice(1));
  const at = scenes.findIndex((s) => s.id === hash || s.id.startsWith(`s${hash.padStart(2, "0")}-`));
  runScene(Math.max(0, at));
  requestAnimationFrame(loop);
  hands.init().then(() => (handsReady = true)).catch((e) => (message.textContent = `Hand tracking failed to start (${e}). Keys still work.`));
}
start();
