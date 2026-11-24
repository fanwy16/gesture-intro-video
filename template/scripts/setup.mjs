// Copies MediaPipe's wasm files and downloads the hand model into
// assets/_vendor/ (served at /_vendor/), so the page runs offline while recording.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vendor = path.join(root, "assets/_vendor");
const wasmFrom = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const model = path.join(vendor, "hand_landmarker.task");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

if (fs.existsSync(wasmFrom)) {
  fs.mkdirSync(path.join(vendor, "wasm"), { recursive: true });
  fs.cpSync(wasmFrom, path.join(vendor, "wasm"), { recursive: true });
  console.log("mediapipe wasm → assets/_vendor/wasm");
}
if (!fs.existsSync(model)) {
  fs.mkdirSync(vendor, { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  fs.writeFileSync(model, Buffer.from(await res.arrayBuffer()));
  console.log("hand model → assets/_vendor/hand_landmarker.task");
}
