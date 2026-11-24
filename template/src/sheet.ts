import { ENTER, FALL, fast } from "./layers";
import type { Pt } from "./hands";

/*
 * The #E8E6EE sheet that holds a scene's design layers (moves B and C).
 *   B Lift: while held it rides on the palm, growing as the hand rises; past
 *     the snap line it snaps to full screen.
 *   Rise: it rises from the bottom (scene 5's columns come up with it).
 *   C Drop: the screen breaks into 14 × 8 tiles that fall away.
 * Inside, layers sit at their 1920×1080 storyboard positions; the whole
 * sheet is scaled while it is held.
 */
const W = 1920;
const H = 1080;
const MIN_SCALE = 0.18;
const MAX_SCALE = 0.5;
const COLS = 14;
const ROWS = 8;

export class Sheet {
  el = document.createElement("div");
  state: "hidden" | "held" | "full" | "dropping" = "hidden";
  private scale = MIN_SCALE;
  private x = W / 2;

  constructor(parent: HTMLElement, full: boolean) {
    this.el.className = "sheet";
    parent.append(this.el);
    if (full) this.showFull();
    else this.el.style.display = "none";
  }

  showFull() {
    this.state = "full";
    this.el.className = "sheet";
    this.el.style.transform = "none";
    this.el.style.display = "";
  }

  /** Ride on the palm. progress 0 = lift just started, 1 = at the snap line. */
  hold(palm: Pt, progress: number) {
    this.state = "held";
    this.scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * Math.min(1, Math.max(0, progress));
    this.x = palm.x;
    this.el.className = "sheet held";
    this.el.style.display = "";
    this.el.style.setProperty("--s", String(this.scale));
    this.el.style.transform = `translate(${palm.x - (this.scale * W) / 2}px, ${palm.y - (this.scale * H) / 2}px) scale(${this.scale})`;
  }

  /**
   * Held between two pinching hands, like a thin sheet of paper: centred between them,
   * as wide as they are apart, swaying gently in perspective and tipping with the
   * hands' movement.
   */
  private sway = { x: 0, y: 0, vx: 0, vy: 0 };
  holdAt(cx: number, cy: number, scale: number) {
    const t = performance.now() / 1000;
    const dx = cx - this.x;
    const dy = cy - (this.sway.y || cy);
    // Velocity-driven tilt, eased so it trails the hands like air resistance.
    this.sway.vx += (Math.max(-30, Math.min(30, dx * 0.6)) - this.sway.vx) * 0.12;
    this.sway.vy += (Math.max(-30, Math.min(30, dy * 0.6)) - this.sway.vy) * 0.12;
    this.sway.y = cy;
    const tiltX = 7 * Math.sin(t * 2.3) + this.sway.vy * 0.5 + 6; // top edge leans back a little, as paper held at the bottom does
    const tiltY = 5 * Math.sin(t * 1.7 + 1) - this.sway.vx * 0.5;
    const turn = 1.5 * Math.sin(t * 1.3);
    this.state = "held";
    this.scale = scale;
    this.x = cx;
    this.el.className = "sheet held";
    this.el.style.display = "";
    this.el.style.setProperty("--s", String(scale));
    this.el.style.transform = `perspective(1400px) translate(${cx - (scale * W) / 2}px, ${cy - (scale * H) / 2}px) scale(${scale}) translate(${W / 2}px, ${H / 2}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotateZ(${turn}deg) translate(${-W / 2}px, ${-H / 2}px)`;
  }

  /** Pulled down from above the frame like a blind: its bottom edge follows the hand. */
  pullTo(bottom: number) {
    this.state = "held";
    this.el.className = "sheet pulled";
    this.el.style.display = "";
    this.el.style.transform = `translateY(${Math.min(0, bottom - H)}px)`;
  }

  /** A pull let go too early: back up out of the frame. */
  pullBack() {
    this.state = "hidden";
    this.el.className = "sheet retreating";
    this.el.style.transitionDuration = `${fast(450)}ms`;
    this.el.style.transform = `translateY(${-H - 40}px)`;
  }

  snap(): Promise<void> {
    this.state = "full";
    this.el.className = "sheet held snapping";
    this.el.style.transitionDuration = `${fast(700)}ms`;
    void this.el.offsetWidth;
    this.el.classList.remove("held");
    this.el.style.transform = "translate(0px, 0px) scale(1)";
    return new Promise((r) =>
      setTimeout(() => {
        this.el.classList.remove("snapping");
        this.el.style.transitionDuration = "";
        r();
      }, fast(700)),
    );
  }

  /** The lift was abandoned: fall back out of the bottom of the frame. */
  retreat() {
    this.state = "hidden";
    this.el.className = "sheet held retreating";
    this.el.style.transitionDuration = `${fast(600)}ms`;
    this.el.style.transform = `translate(${this.x - (this.scale * W) / 2}px, ${H + 40}px) scale(${this.scale})`;
  }

  /** Comes up from below the frame. */
  rise(ms = 700): Promise<void> {
    this.state = "full";
    this.el.className = "sheet";
    this.el.style.display = "";
    this.el.style.transform = "none";
    return this.el
      .animate([{ transform: `translateY(${H}px)` }, { transform: "translateY(0)" }], { duration: ms, easing: ENTER, fill: "both" })
      .finished.then(() => undefined);
  }

  /** Move C: 14 × 8 tiles of the sheet fall away. dir: 0 = down, ±1 = swept sideways. */
  drop(tilesLayer: HTMLElement, dir: number): Promise<void> {
    this.state = "dropping";
    let longest = 0;
    const tiles: HTMLElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x0 = Math.round((c * W) / COLS);
        const x1 = Math.round(((c + 1) * W) / COLS);
        const y0 = Math.round((r * H) / ROWS);
        const y1 = Math.round(((r + 1) * H) / ROWS);
        const tile = document.createElement("div");
        tile.className = "tile";
        Object.assign(tile.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
        const copy = this.el.cloneNode(true) as HTMLElement;
        copy.className = "sheet";
        copy.style.display = "";
        copy.style.transform = `translate(${-x0}px, ${-y0}px)`;
        tile.append(copy);
        tilesLayer.append(tile);
        tiles.push(tile);
        // Lower rows go first; a sideways sweep also runs across from the side it came from.
        const sweep = dir === 0 ? 0 : (dir > 0 ? c : COLS - 1 - c) * 14;
        const delay = (ROWS - 1 - r) * 24 + sweep + Math.random() * 160;
        const dur = 900 + Math.random() * 250;
        longest = Math.max(longest, delay + dur);
        tile.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${dir * 240}px, ${H + 160}px)` }], { duration: dur, delay, easing: FALL, fill: "both" });
      }
    }
    this.el.style.display = "none";
    return new Promise((r) =>
      setTimeout(() => {
        tiles.forEach((t) => t.remove());
        this.state = "hidden";
        r();
      }, fast(longest) + 50),
    );
  }

  /** Waits, unseen, to open out of an element of the previous scene. */
  hideFor(r: { x: number; y: number; w: number; h: number } | null) {
    if (r) this.el.style.display = "none";
  }

  /** Grows out of an element (an app opening from the Dock) until it fills the frame. */
  openFrom(r: { x: number; y: number; w: number; h: number }, ms = 900): Promise<void> {
    this.state = "full";
    this.el.style.display = "";
    const s = Math.min(r.w / W, r.h / H);
    const from = `translate(${r.x + r.w / 2 - (s * W) / 2}px, ${r.y + r.h / 2 - (s * H) / 2}px) scale(${s})`;
    return this.el
      .animate(
        [
          { transform: from, borderRadius: `${24 / s}px`, opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: "translate(0px, 0px) scale(1)", borderRadius: "0px", opacity: 1 },
        ],
        { duration: ms, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" },
      )
      .finished.then(() => undefined);
  }

  /** Dives into one element until it fills the frame, fading to the sheet underneath. */
  zoomInto(r: { x: number; y: number; w: number; h: number }, ms = 1200): Promise<void> {
    this.state = "dropping";
    const s = Math.max(W / r.w, H / r.h);
    const end = `translate(${W / 2 - s * (r.x + r.w / 2)}px, ${H / 2 - s * (r.y + r.h / 2)}px) scale(${s})`;
    return this.el
      .animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { opacity: 1, offset: 0.55 },
          { transform: end, opacity: 0 },
        ],
        { duration: ms, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" },
      )
      .finished.then(() => {
        this.el.style.display = "none";
        this.state = "hidden";
      });
  }

  /**
   * Everything but one element fades away (sheet and all), and that element flies
   * to a new place — Smart Animate between two frames. A zoom label counts down
   * in the corner as if the canvas were zooming out.
   */
  flyTo(keep: HTMLElement, from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }, ms = 700): Promise<void> {
    this.state = "dropping";
    const fade = { duration: 300, easing: "ease-out", fill: "both" as const };
    [...this.el.children].forEach((c) => c !== keep && (c as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], fade));
    this.el.animate([{ backgroundColor: getComputedStyle(this.el).backgroundColor, backgroundImage: getComputedStyle(this.el).backgroundImage }, { backgroundColor: "rgba(245,245,245,0)", backgroundImage: "none" }], fade);
    const s = to.w / from.w;
    const zoom = document.createElement("div");
    zoom.className = "zoom-label";
    this.el.parentElement!.append(zoom);
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / fast(ms));
      zoom.textContent = `${Math.round(100 - (100 - s * 100) * (1 - Math.pow(1 - p, 3)))}%`;
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => zoom.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "both" }).finished.then(() => zoom.remove()), fast(500));
    };
    tick();
    keep.style.transformOrigin = "0 0";
    keep.style.zIndex = "10"; // above the pages that were stacked on it
    return keep
      .animate([{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${s})` }], { duration: ms, easing: ENTER, fill: "both" })
      .finished.then(() => {
        this.el.style.display = "none";
        this.state = "hidden";
      });
  }

  /* Put down, like a sheet of paper laid on a desk: it shrinks onto the palm and
     tips back about its bottom edge, in perspective. */
  private tilt = 0;
  private paper(x: number, y: number, s: number, tilt: number, turn = 0) {
    // x, y: where the sheet's bottom-centre goes; it pivots about that edge.
    return `perspective(1600px) translate(${x - (s * W) / 2}px, ${y - s * H}px) scale(${s}) translate(${W / 2}px, ${H}px) rotateX(${tilt}deg) rotateZ(${turn}deg) translate(${-W / 2}px, ${-H}px)`;
  }

  /** While being put down: p 0 = full screen, 1 = laid down at palm size. */
  followDown(palm: Pt, p: number) {
    const s = 1 - (1 - MIN_SCALE * 1.8) * p;
    const x = W / 2 + (palm.x - W / 2) * p;
    const y = H + (palm.y + (s * H) / 2 - H) * p;
    this.tilt = 38 * p;
    this.el.classList.toggle("held", p > 0.02);
    this.el.style.setProperty("--s", String(s));
    this.el.style.transform = this.paper(x, y, s, this.tilt);
  }

  /** While being panned: slides with the hand, the next frame following in from the other side. */
  followPan(dx: number, next: Sheet | null) {
    this.el.style.transform = `translateX(${dx}px)`;
    if (next) next.el.style.transform = `translateX(${dx < 0 ? W + dx : dx - W}px)`;
  }

  /** The hand let go early: back to full screen. */
  settle(next: Sheet | null = null) {
    const back = { duration: 300, easing: ENTER };
    this.el.animate([{ transform: getComputedStyle(this.el).transform }, { transform: "none" }], back);
    this.el.style.transform = "none";
    this.el.classList.remove("held");
    this.tilt = 0;
    if (next) {
      next.el.animate([{ transform: getComputedStyle(next.el).transform }, { transform: `translateX(${W}px)` }], back);
      next.el.style.transform = "none";
    }
  }

  /** Put down: laid back like paper and slid out of the bottom, from wherever the hand left it. */
  putDown(ms = 900): Promise<void> {
    this.state = "dropping";
    const now = getComputedStyle(this.el).transform;
    const handed = now !== "none" && this.tilt > 0;
    const m = new DOMMatrix(handed ? now : undefined);
    const s0 = handed ? Math.hypot(m.a, m.b) : 1;
    const s1 = MIN_SCALE * 1.8;
    const x0 = handed ? m.e + (s0 * W) / 2 : W / 2;
    this.el.classList.add("held");
    this.el.style.setProperty("--s", String(s1));
    const start = handed ? now : this.paper(W / 2, H, 1, 0);
    const frames: Keyframe[] = [
      { transform: start, boxShadow: "0 40px 90px rgba(28, 18, 60, 0.32)" },
      { transform: this.paper(x0, H * 0.86, s1, 42, -2), boxShadow: "0 30px 60px rgba(28, 18, 60, 0.28)", offset: 0.6 },
      { transform: this.paper(x0, H + s1 * H * 0.9, s1, 55, -3), boxShadow: "0 10px 30px rgba(28, 18, 60, 0.2)" },
    ];
    return this.el.animate(frames, { duration: ms, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" }).finished.then(() => {
      this.el.style.display = "none";
      this.state = "hidden";
      this.tilt = 0;
    });
  }

  /** Panned to the next frame on the canvas: this sheet slides off to the left as the next comes in from the right. */
  pan(next: Sheet | null, dir = -1, ms = 900): Promise<void> {
    this.state = "dropping";
    const opts = { duration: ms, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" as const };
    const dx = new DOMMatrix(getComputedStyle(this.el).transform === "none" ? undefined : getComputedStyle(this.el).transform).e;
    const from = dir < 0 ? W + dx : dx - W;
    next?.el.animate([{ transform: `translateX(${from}px)` }, { transform: "translateX(0)" }], opts);
    if (next) next.el.style.transform = "none";
    return this.el.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${dir * W}px)` }], opts).finished.then(() => {
      this.el.style.display = "none";
      this.state = "hidden";
    });
  }

  /** Pushed up out of the frame while the next sheet comes up from below. */
  push(next: Sheet | null, ms = 900): Promise<void> {
    this.state = "dropping";
    const opts = { duration: ms, easing: ENTER, fill: "both" as const };
    next?.el.animate([{ transform: `translateY(${H}px)` }, { transform: "translateY(0)" }], opts);
    return this.el.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-H}px)` }], opts).finished.then(() => {
      this.el.style.display = "none";
      this.state = "hidden";
    });
  }

  destroy() {
    this.el.remove();
  }
}
