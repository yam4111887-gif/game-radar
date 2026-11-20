/* Steam 新品雷達：抓 Steam 官方商店搜尋（依上架日新→舊 + 支援繁體中文篩選）
   → ①data/steam.json（前端備援）②steam.html 靜態清單（SEO：遊戲名稱長尾字直接寫進 HTML）
   用法：node scripts/update-steam.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const SEARCH_URL =
  "https://store.steampowered.com/search/results/?query&start=0&count=50&infinite=1&sort_by=Released_DESC&term=&supportedlang=tchinese&cc=tw&ndl=1";

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

/* 價格：新版 Steam 標記 — 折價時 final 價在 discount_final_price，未折價退回 search_price */
function priceText(rowHtml) {
  let t = decode((rowHtml.match(/<div class="discount_final_price">([^<]*)<\/div>/) || [])[1] || "");
  if (!t) {
    const m = rowHtml.match(/<div class="col search_price[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (m) t = decode(m[1].replace(/<[^>]+>/g, " "));
  }
  if (/Free To Play|免費遊玩/i.test(t)) return "免費遊玩";
  if (/^Free$|^免費$/i.test(t)) return "免費";
  return t;
}

function cardHtml(g) {
  const plat = (g.platforms || []).join("/");
  return `      <a class="game-card" href="${esc(g.url)}" target="_blank" rel="noopener">
        ${g.capsule ? `<img src="${esc(g.capsule)}" alt="" loading="lazy" style="width:66px;height:37px;border-radius:6px;object-fit:cover">` : ""}
        <span class="t">
          <span class="name">${esc(g.name)}</span>
          <span class="meta">${esc(g.released)}${g.price ? " · " + esc(g.price) + (g.discount ? " -" + g.discount + "%" : "") : ""}${plat ? " · " + esc(plat) : ""}</span>
          <span class="go">在 Steam 查看 →</span>
        </span>
      </a>`;
}

async function main() {
  const res = await fetch(SEARCH_URL, {
    headers: {
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) game-radar-updater/1.0",
    },
  });
  if (!res.ok) throw new Error("Steam HTTP " + res.status);
  const j = await res.json();
  if (!j || j.success !== 1 || !j.results_html) throw new Error("Steam 回應格式異常");

  const rows = j.results_html.split('class="search_result_row').slice(1);
  const games = [];
  for (const r of rows) {
    const id = (r.match(/data-ds-appid="(\d+)"/) || [])[1];
    const name = decode((r.match(/<span class="title">([\s\S]*?)<\/span>/) || [])[1] || "");
    if (!id || !name) continue; /* bundle/無 appid 列跳過 */
    if (/\bDemo\b|試玩版|Playtest|Soundtrack|原聲帶|\bOST\b/i.test(name)) continue; /* 試玩版/原聲帶非遊戲本體 */
    const released = decode((r.match(/class="search_released[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "");
    const capsule = (r.match(/<div class="search_capsule">\s*<img src="([^"]+)"/) || [])[1] || "";
    const platforms = [];
    if (/platform_img win/.test(r)) platforms.push("Win");
    if (/platform_img mac/.test(r)) platforms.push("Mac");
    if (/platform_img linux/.test(r)) platforms.push("Linux");
    const discount = parseInt((r.match(/discount_block[^>]*data-discount="(\d+)"/) || [])[1] || "0", 10) || 0;
    games.push({
      name,
      id,
      url: `https://store.steampowered.com/app/${id}/`,
      capsule,
      released,
      price: priceText(r),
      discount,
      platforms,
    });
  }
  if (games.length < 5) throw new Error("解析結果異常（僅 " + games.length + " 筆）");

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* ① JSON */
  const jsonFile = path.join(__dirname, "..", "data", "steam.json");
  fs.writeFileSync(jsonFile, JSON.stringify({ updated, source: "Steam 官方商店搜尋（依上架日排序・繁中篩選）", count: games.length, games }, null, 1));

  /* ② steam.html 靜態清單（STEAM-START/END 標記之間，前 30 筆） */
  const pageFile = path.join(__dirname, "..", "steam.html");
  let html = fs.readFileSync(pageFile, "utf8");
  const OPEN = "<!--STEAM-START-->";
  const CLOSE = "<!--STEAM-END-->";
  const openIdx = html.indexOf(OPEN);
  const closeIdx = html.indexOf(CLOSE);
  if (openIdx < 0 || closeIdx < 0) throw new Error("steam.html 找不到 STEAM 標記");
  const staticBlock = `${OPEN}
      <div class="game-grid" id="steam-grid" data-updated="${updated}" data-count="${games.length}">
${games.slice(0, 30).map(cardHtml).join("\n")}
      </div>
      ${CLOSE}`;
  html = html.slice(0, openIdx) + staticBlock + html.slice(closeIdx + CLOSE.length);
  fs.writeFileSync(pageFile, html);

  console.log(`OK ${updated} — Steam 收錄 ${games.length} 款 — JSON ${(fs.statSync(jsonFile).size / 1024).toFixed(0)}KB — steam.html 靜態清單已更新（前 30 筆）`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
