/* LoL 版更偵測：比對 Riot 官方新聞清單頁的最新 Patch Notes 連結 vs data/lol-patch.json
   → 相同：OK_PATCH；新版：NEW_PATCH_DETECTED <版號> <版更URL>（給 cron agent 接手更新 lol-tier-list.html）
   備援：Riot Data Dragon versions.json（內部版號 16.23.1 ↔ 對外 26.23）
   用法：node scripts/update-lol-patch.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 game-radar-updater/1.0";
const NEWS_INDEX = "https://www.leagueoflegends.com/en-us/news/game-updates/";
const PATCH_LINK_RE = /league-of-legends-patch-(\d{1,2})-(\d{1,2})-notes/g;

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return await res.text();
}

/* 主偵測：官方 Game Updates 清單頁找最新 patch notes 連結 */
async function detectFromNews() {
  const html = await fetchText(NEWS_INDEX);
  let best = null;
  for (const m of html.matchAll(PATCH_LINK_RE)) {
    const patch = m[1] + "." + m[2];
    const num = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    if (!best || num > best.num) {
      best = {
        patch,
        num,
        notesUrl: "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-" + m[1] + "-" + m[2] + "-notes",
      };
    }
  }
  if (!best) throw new Error("清單頁找不到 patch notes 連結");
  return best;
}

/* 備援偵測：ddragon versions.json（拿得到版號、拿不到版更URL） */
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
  const stateFile = path.join(__dirname, "..", "data", "lol-patch.json");
  let tracked = null;
  try { tracked = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (_) {}

  let det = null;
  try { det = await detectFromNews(); } catch (e) {
    console.error("  ⚠ 官方清單頁抓取失敗（" + e.message + "），改用 ddragon 備援");
  }
  if (!det) det = await detectFromDdragon();

  const today = new Date().toISOString().slice(0, 10);
  if (tracked && tracked.patch === det.patch) {
    fs.writeFileSync(stateFile, JSON.stringify({ ...tracked, checkedAt: today, ...(det.notesUrl ? { notesUrl: det.notesUrl } : {}) }, null, 1));
    console.log("OK_PATCH " + det.patch + "（lol-tier-list.html 已是最新版）");
    return;
  }

  fs.writeFileSync(stateFile, JSON.stringify({
    patch: det.patch,
    notesUrl: det.notesUrl,
    detectedAt: today,
    prevPatch: tracked ? tracked.patch : "",
    checkedAt: today,
  }, null, 1));
  console.log("NEW_PATCH_DETECTED " + det.patch + " " + (det.notesUrl || "(無版更URL，請自行查官方清單)"));
}

main().catch((e) => {
  console.error("PATCH_CHECK_FAILED: " + e.message);
  process.exit(1);
});
