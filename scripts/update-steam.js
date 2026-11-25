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
  const img = g.header || g.capsule;
  const tags = [...(g.platforms || []), ...(g.genres || [])].slice(0, 3);
  const free = /^(免費|Free)/i.test(g.price || "");
  return `        <tr>
          <td class="art"><img src="${esc(img)}" alt="" loading="lazy"></td>
          <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc(tags.join("・") || "—")}</span></a></td>
          <td class="plat">${(g.platforms || []).map((p) => `<i>${esc(p)}</i>`).join("")}</td>
          <td class="num">${g.discount ? `<em>-${g.discount}%</em>` : ""}<b class="${free ? "free" : ""}">${esc(g.price || "—")}</b></td>
        </tr>`;
}

/* appdetails：抓 header 大圖（460×215，搜尋結果只给 231×87 小圖且 hash 常錯位）+ 分類標籤。fail-soft */
async function enrich(g) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${g.id}&l=tchinese`, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) game-radar-updater/1.0", "Accept-Language": "zh-TW,zh;q=0.9" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return;
    const j = await res.json();
    const d = j && j[g.id] && j[g.id].data;
    if (!d) return;
    if (d.header_image) g.header = d.header_image;
    if (Array.isArray(d.genres)) g.genres = d.genres.map((x) => x && x.description).filter(Boolean).slice(0, 3);
  } catch (e) { /* 退回搜尋結果的 capsule */ }
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

  /* appdetails 補大圖 + 分類（前 30 筆即靜態清單所需；限速經驗值 ~3 筆/秒内安全） */
  for (const g of games.slice(0, 30)) {
    await enrich(g);
    await new Promise((r) => setTimeout(r, 350));
  }

  /* capsule 防護：搜尋結果的 capsule hash 常指向其他 app（DLC/同系列錯位）；
     id 對不上的一律丟棄，僅在 enrich 失敗時才 fallback capsule，避免秀錯圖 */
  for (const g of games) {
    const m = (g.capsule || "").match(/\/apps\/(\d+)\//);
    if (g.capsule && m && m[1] !== g.id) g.capsule = "";
  }

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* ① JSON */
  const jsonFile = path.join(__dirname, "..", "data", "steam.json");
  fs.writeFileSync(jsonFile, JSON.stringify({ updated, source: "Steam 官方商店搜尋（依上架日排序・繁中篩選）", count: games.length, games }, null, 1));

  /* ② steam.html 靜態清單（STEAM-START/END 標記之間，前 30 筆，依上架日分組） */
  const shown = games.slice(0, 30);
  const groups = [];
  for (const g of shown) {
    const last = groups[groups.length - 1];
    if (last && last.date === g.released) last.games.push(g);
    else groups.push({ date: g.released, games: [g] });
  }
  const groupHtml = groups
    .map((gr) => `        <h3 class="day-cap">${esc(gr.date || "最新上架")}<span>${gr.games.length} 款</span></h3>
        <div class="rows">
        <table>
          <colgroup><col class="c-art"><col class="c-title"><col class="c-plat"><col class="c-num"></colgroup>
          <tbody>
${gr.games.map(cardHtml).join("\n")}
          </tbody>
        </table>
        </div>`)
    .join("\n");
  const pageFile = path.join(__dirname, "..", "steam.html");
  let html = fs.readFileSync(pageFile, "utf8");
  const OPEN = "<!--STEAM-START-->";
  const CLOSE = "<!--STEAM-END-->";
  const openIdx = html.indexOf(OPEN);
  const closeIdx = html.indexOf(CLOSE);
  if (openIdx < 0 || closeIdx < 0) throw new Error("steam.html 找不到 STEAM 標記");
  const staticBlock = `${OPEN}
      <div id="steam-grid" data-updated="${updated}" data-count="${games.length}">
${groupHtml}
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
