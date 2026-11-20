/* LoL／Wild Rift 版更偵測：比對 Riot 官方新聞清單頁的最新 Patch Notes 連結 vs data/<game>-patch.json
   → 相同：OK_PATCH；新版：NEW_PATCH_DETECTED <lol|wr> <版號> <版更URL>（給 cron agent 接手更新 tier list 頁）
   備援：Riot Data Dragon versions.json（內部版號 16.23.1 ↔ 對外 26.23，僅 lol）
   用法：node scripts/update-lol-patch.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 game-radar-updater/1.0";

const WATCHERS = [
  {
    key: "lol",
    index: "https://www.leagueoflegends.com/en-us/news/game-updates/",
    linkRe: /league-of-legends-patch-(\d{1,2})-(\d{1,2})-notes/g,
    urlOf: (maj, min) => "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-" + maj + "-" + min + "-notes",
    stateFile: "data/lol-patch.json",
    ddragon: true,
  },
  {
    key: "wr",
    index: "https://wildrift.leagueoflegends.com/en-us/news/game-updates/",
    linkRe: /wild-rift-patch-notes-(\d{1,2})-(\d{1,2})/g,
    urlOf: (maj, min) => "https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-" + maj + "-" + min,
    stateFile: "data/wr-patch.json",
    ddragon: false,
  },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return await res.text();
}

/* 備援偵測：ddragon versions.json（僅 lol；拿得到版號、拿不到版更URL） */
async function detectFromDdragon() {
  const versions = JSON.parse(await fetchText("https://ddragon.leagueoflegends.com/api/versions.json"));
  const parts = String(versions[0] || "").split(".");
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  if (!(major > 10 && minor >= 0)) throw new Error("ddragon 版號異常：" + versions[0]);
  const patch = "2" + (major - 10) + "." + minor; /* 內部 16.23 ↔ 對外 26.23 */
  return { patch, num: major * 100 + minor, notesUrl: "" };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const outputs = [];
  for (const w of WATCHERS) {
    const stateFile = path.join(__dirname, "..", w.stateFile);
    let tracked = null;
    try { tracked = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (_) {}

    let det = null;
    try {
      const html = await fetchText(w.index);
      let best = null;
      for (const m of html.matchAll(w.linkRe)) {
        const patch = m[1] + "." + m[2];
        const num = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
        if (!best || num > best.num) best = { patch, num, notesUrl: w.urlOf(m[1], m[2]) };
      }
      if (!best) throw new Error("清單頁找不到 patch notes 連結");
      det = best;
    } catch (e) {
      console.error("  ⚠ " + w.key + " 官方清單頁抓取失敗（" + e.message + "）" + (w.ddragon ? "，改用 ddragon 備援" : ""));
      if (w.ddragon) { try { det = await detectFromDdragon(); } catch (e2) { console.error("  ⚠ ddragon 也失敗：" + e2.message); } }
    }

    if (!det) { outputs.push("PATCH_CHECK_FAILED " + w.key); continue; }

    if (tracked && tracked.patch === det.patch) {
      fs.writeFileSync(stateFile, JSON.stringify({ ...tracked, checkedAt: today, ...(det.notesUrl ? { notesUrl: det.notesUrl } : {}) }, null, 1));
      outputs.push("OK_PATCH " + w.key + " " + det.patch);
    } else {
      fs.writeFileSync(stateFile, JSON.stringify({
        patch: det.patch,
        notesUrl: det.notesUrl,
        detectedAt: today,
        prevPatch: tracked ? tracked.patch : "",
        checkedAt: today,
      }, null, 1));
      outputs.push("NEW_PATCH_DETECTED " + w.key + " " + det.patch + " " + (det.notesUrl || "(無版更URL，請自行查官方清單)"));
    }
  }
  console.log(outputs.join("\n"));
  if (outputs.some((o) => o.startsWith("PATCH_CHECK_FAILED"))) process.exit(1);
}

main().catch((e) => {
  console.error("PATCH_CHECK_FAILED: " + e.message);
  process.exit(1);
});
