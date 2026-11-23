/* 每日遊戲收錄：抓 Apple 官方 iTunes RSS（新 App・遊戲分類）
   → ①data/games.json（前端備援）②index.html 靜態清單（SEO：遊戲名稱長尾字直接寫進 HTML）
   用法：node scripts/update-games.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/* ⛓️ 串接其他分區更新（每日 cron 只叫這支：games → steam → specs → codes）
   各腳本獨立 fail-soft：單一來源掛掉不影響其他分區的收錄 */
function chain(name) {
  if (process.env.GAME_RADAR_NO_CHAIN) return;
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], { encoding: "utf8" });
  const last = (arr) => arr.filter(Boolean).pop() || "";
  if (r.status !== 0) console.error(`[chain] ${name} 失敗：${last((r.stderr || "").trim().split("\n"))}`);
  else console.log(`[chain] ${name} → ${last((r.stdout || "").trim().split("\n"))}`);
}

function cardHtml(g) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const free = /^(取得|免費|Free)/i.test(g.price || "");
  return `        <tr>
          <td class="art"><img class="ico" src="${esc(g.icon)}" alt="" loading="lazy"></td>
          <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc(g.artist) || "獨立開發"}</span></a></td>
          <td class="num"><b class="${free ? "free" : ""}">${esc(g.price || "免費")}</b></td>
        </tr>`;
}

async function main() {
  ["update-steam.js", "update-specs.js", "update-codes.js"].forEach(chain);

  const res = await fetch("https://itunes.apple.com/tw/rss/newapplications/limit=100/genre=6014/json");
  if (!res.ok) throw new Error("iTunes RSS HTTP " + res.status);
  const j = await res.json();
  const list = (j.feed && j.feed.entry) || [];
  const games = [];
  for (const e of list) {
    const cat = e.category && e.category.attributes && e.category.attributes.label;
    if (cat !== "遊戲") continue;
    const icons = (e["im:image"] || []).map((i) => i.label);
    games.push({
      name: e["im:name"].label,
      id: e.id && e.id.attributes && e.id.attributes["im:id"],
      url: (e.link && e.link[0] && e.link[0].attributes && e.link[0].attributes.href)
        || (e.id && e.id.attributes && e.id.attributes["im:id"] ? "https://apps.apple.com/tw/app/id" + e.id.attributes["im:id"] : ""),
      icon: (icons[icons.length - 1] || "").replace(/\/\d+x\d+bb(\.png|\.jpg)?$/, "/256x256bb.png"),
      price: e["im:price"] && e["im:price"].label,
      artist: e["im:artist"] && e["im:artist"].label,
    });
  }
  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* ① JSON（前端動態備援） */
  const jsonFile = path.join(__dirname, "..", "data", "games.json");
  fs.writeFileSync(jsonFile, JSON.stringify({ updated, source: "Apple iTunes 官方 RSS（新 App・遊戲）", count: games.length, games }));

  /* ② index.html 靜態清單（GAMES-START/END 標記之間） */
  const idxFile = path.join(__dirname, "..", "index.html");
  let html = fs.readFileSync(idxFile, "utf8");
  const OPEN = "<!--GAMES-START-->";
  const CLOSE = "<!--GAMES-END-->";
  const openIdx = html.indexOf(OPEN);
  const closeIdx = html.indexOf(CLOSE);
  if (openIdx < 0 || closeIdx < 0) throw new Error("index.html 找不到 GAMES 標記");
  const staticBlock = `${OPEN}
      <div class="rows" id="game-grid" data-updated="${updated}" data-count="${games.length}">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-num"></colgroup>
        <tbody>
${games.slice(0, 24).map(cardHtml).join("\n")}
        </tbody>
      </table>
      </div>
      ${CLOSE}`;
  html = html.slice(0, openIdx) + staticBlock + html.slice(closeIdx + CLOSE.length);
  fs.writeFileSync(idxFile, html);

  console.log(`OK ${updated} — 收錄 ${games.length} 款 — JSON ${(fs.statSync(jsonFile).size / 1024).toFixed(0)}KB — index.html 靜態清單已更新（前 24 款）`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
