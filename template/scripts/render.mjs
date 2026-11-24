/*
 * Renders scenes to 1920×1080 60 fps MP4s in renders/, for cutting into the edit
 * (useful when live screen recording drops frames on heavy canvas scenes).
 *
 *   npm run dev                      (in another terminal)
 *   npm run render                   every scene that has a sheet (no camera in it)
 *   npm run render -- s03-idea 6     one scene, recorded for 6 s
 *
 * Each clip opens the scene by its #id, presses → once if its opening move
 * waits (lift, pan, drop…), and keeps every frame Chrome paints (DevTools
 * screencast); ffmpeg lays them on a steady 60 fps timeline. The camera is
 * hidden, so canvas scenes come out clean.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.URL ?? "http://localhost:5173/";
const OUT = path.resolve("renders");
const FPS = 60;
const scenes = JSON.parse(fs.readFileSync("scenes.json", "utf8")).scenes;
const [onlyId, secsArg] = process.argv.slice(2);
const chosen = onlyId ? scenes.filter((s) => s.id === onlyId) : scenes.filter((s) => s.sheet);
const waits = (s) => s.beats.some((b) => b.on || (b.do && !b.auto && !["rise", "dock", "open"].includes(b.do)));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

for (const scene of chosen) {
  const secs = Number(secsArg ?? 7);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, permissions: ["camera"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`${URL}#${scene.id}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "#camera { visibility: hidden; }" });
  await page.keyboard.press("g"); // no hand overlay
  await page.waitForTimeout(1500);

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await page.waitForTimeout(300);
  const start = Date.now() / 1000;
  if (waits(scene)) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(secs * 1000);
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await ctx.close();

  // Frames come only when something changes: each holds until the next.
  const firstIdx = Math.max(0, frames.findIndex((f) => f.t > start) - 1);
  const kept = frames.slice(firstIdx).filter((f) => f.t <= end);
  const dir = fs.mkdtempSync(path.join(OUT, `.${scene.id}-`));
  let list = "";
  kept.forEach((f, i) => {
    const file = `${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, "base64"));
    const from = Math.max(f.t, start);
    const to = i + 1 < kept.length ? kept[i + 1].t : end;
    list += `file '${file}'\nduration ${Math.max(0, to - from).toFixed(4)}\n`;
  });
  list += `file '${String(kept.length - 1).padStart(5, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(dir, "list.txt"), list);
  const mp4 = path.join(OUT, `${scene.id}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-movflags", "+faststart", mp4]);
  fs.rmSync(dir, { recursive: true });
  console.log(`${scene.id}.mp4  ${(end - start).toFixed(1)}s`);
}
await browser.close();
