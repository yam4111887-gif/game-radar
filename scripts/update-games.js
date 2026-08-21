/* 每日遊戲收錄：抓 Apple 官方 iTunes RSS（新 App・遊戲分類）→ data/games.json
   用法：node scripts/update-games.js（在 game-radar 目錄下執行）
   授權：RSS 為官方公開饋流，設計供再發布；連結與圖示均來自官方 feed。 */
const fs = require("fs");
const path = require("path");

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
      category: cat,
      artist: e["im:artist"] && e["im:artist"].label,
    });
  }
  const out = {
    updated: new Date().toISOString().slice(0, 16).replace("T", " "),
    source: "Apple iTunes 官方 RSS（新 App・遊戲）",
    count: games.length,
    games,
  };
  const file = path.join(__dirname, "..", "data", "games.json");
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`OK ${out.updated} — 收錄 ${games.length} 款新遊戲 — ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
