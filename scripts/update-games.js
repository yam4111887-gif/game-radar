/* 每日遊戲收錄：抓 Apple 官方 iTunes RSS（新 App・遊戲分類）
   → ①data/games.json（前端備援）②index.html 靜態清單（SEO：遊戲名稱長尾字直接寫進 HTML）
   用法：node scripts/update-games.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

function cardHtml(g) {
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `      <a class="game-card" href="${esc(g.url)}" target="_blank" rel="noopener">
        ${g.icon ? `<img src="${esc(g.icon)}" alt="" loading="lazy">` : ""}
        <span class="t">
          <span class="name">${esc(g.name)}</span>
          <span class="meta">${esc(g.artist) || "獨立開發"} · ${esc(g.price) || "免費"}</span>
          <span class="go">在 App Store 查看 →</span>
        </span>
      </a>`;
}

async function main() {
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
      url: (e.link && e.link[0] && e.link[0].attributes && e.link[0].attributes.href) || "",
      icon: icons[icons.length - 1] || "",
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
      <div class="game-grid" id="game-grid" data-updated="${updated}" data-count="${games.length}">
${games.slice(0, 24).map(cardHtml).join("\n")}
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
