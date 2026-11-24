import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type Pt = { x: number; y: number };
export interface Hand {
  pts: Pt[]; // 21 landmarks in stage pixels
  palm: Pt; // centre of the palm, smoothed
  open: boolean; // four fingers extended
  indexUp: boolean; // index finger up, the other three folded
  pinch: boolean; // thumb and index fingertips together
  pinchD: number; // thumb tip to index tip, in hand sizes (wrist to middle knuckle)
  middleD: number; // thumb tip to middle tip, in hand sizes
  pinchAt: Pt; // between thumb tip and index tip
  spread: boolean; // all five fingers wide open (thumb well away from the index)
  t: number;
}

const SMOOTH = 0.55;
const FINGERS: [tip: number, pip: number][] = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

export class Hands {
  private lm?: HandLandmarker;
  private lastVideoTime = -1;
  private smooth = new Map<string, Pt>();
  last: Hand | null = null;
  all: Hand[] = []; // every hand in the frame, left to right on the stage

  async init() {
    const vision = await FilesetResolver.forVisionTasks("/_vendor/wasm");
    this.lm = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/_vendor/hand_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }

  /** Returns the latest hand, re-detecting only when the camera has a new frame. */
  detect(video: HTMLVideoElement, toStage: (x: number, y: number) => Pt, now: number): Hand | null {
    if (!this.lm || video.readyState < 2 || video.currentTime === this.lastVideoTime) return this.last;
    this.lastVideoTime = video.currentTime;
    const res = this.lm.detectForVideo(video, now);
    const seen = new Set<string>();
    this.all = res.landmarks
      .map((lms, i) => {
        const side = res.handedness[i]?.[0]?.categoryName ?? String(i);
        seen.add(side);
        return this.read(lms.map((p) => toStage(p.x, p.y)), side, now);
      })
      .sort((a, b) => a.palm.x - b.palm.x);
    for (const k of [...this.smooth.keys()]) if (!seen.has(k)) this.smooth.delete(k);
    this.last = this.all[0] ?? null;
    return this.last;
  }

  private read(pts: Pt[], side: string, now: number): Hand {
    const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
    // A finger is extended when its tip is farther from the wrist than its middle joint.
    const ext = FINGERS.map(([tip, pip]) => d(pts[tip], pts[0]) > d(pts[pip], pts[0]) * 1.1);
    const open = ext.every(Boolean);
    const indexUp = ext[0] && !ext[1] && !ext[2] && !ext[3] && pts[8].y < pts[5].y;
    const size = d(pts[0], pts[9]); // wrist to the middle knuckle: the hand's scale
    const pinch = d(pts[4], pts[8]) < size * 0.28;
    const spread = open && d(pts[4], pts[8]) > size * 0.75;
    const raw = { x: (pts[0].x + pts[5].x + pts[17].x) / 3, y: (pts[0].y + pts[5].y + pts[17].y) / 3 };
    const prev = this.smooth.get(side);
    const palm = prev ? { x: prev.x + (raw.x - prev.x) * SMOOTH, y: prev.y + (raw.y - prev.y) * SMOOTH } : raw;
    this.smooth.set(side, palm);
    const pinchD = d(pts[4], pts[8]) / size;
    const middleD = d(pts[4], pts[12]) / size;
    const pinchAt = { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
    return { pts, palm, open, indexUp, pinch, spread, pinchD, middleD, pinchAt, t: now };
  }
}

/** Palm positions over the last ~160ms, for fast-movement (drop) detection. */
export class Motion {
  private trail: { p: Pt; t: number }[] = [];

  push(p: Pt, t: number) {
    this.trail.push({ p, t });
    this.trail = this.trail.filter((s) => t - s.t < 160);
  }
  clear() {
    this.trail = [];
  }
  /** Velocity in stage px per ms and distance over the window. */
  get() {
    if (this.trail.length < 3) return null;
    const a = this.trail[0];
    const b = this.trail[this.trail.length - 1];
    const dt = b.t - a.t;
    if (dt < 60) return null;
    const dx = b.p.x - a.p.x;
    const dy = b.p.y - a.p.y;
    return { dx, dy, vx: dx / dt, vy: dy / dt };
  }
}
