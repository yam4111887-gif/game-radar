/* AI 遊戲雷達：Steam 社群「Artificial Intelligence」標籤（tag 7926）的最新上架遊戲
   → ①data/ai-games.json（含 stats 統計）②ai-games.html 靜態清單（AI-GAMES 標記）
   誠實紅線：標籤＝開發商/社群標示，非本站認證；僅收錄與連結，頁面必有此聲明。
   用法：node scripts/update-ai-games.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const SEARCH_URL =
  "https://store.steampowered.com/search/results/?query&start=0&count=50&infinite=1&sort_by=Released_DESC&term=&tags=7926&cc=tw&ndl=1";

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const decode = (s) =>
  String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

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

/* appdetails 補充：類型（zh）＋分類（單人/合作等，zh）→ 雙人同樂標記 */
async function enrich(id) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=tchinese&cc=tw`, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) game-radar-updater/1.0" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    const d = j[id] && j[id].data;
    if (!d) throw new Error("無資料");
    const cats = (d.categories || []).map((c) => c.description || "");
    const genres = (d.genres || []).map((g) => g.description || "").filter(Boolean);
    return {
      genres: genres.slice(0, 3),
      coop: /合作|Co-op/i.test(cats.join(" ")) || /共享|分割/i.test(cats.join(" ")),
      single: /單人玩家/.test(cats.join(" ")),
      multi: /多人玩家/.test(cats.join(" ")),
    };
  } catch (_) {
    return { genres: [], coop: false, single: false, multi: false };
  }
}

function cardHtml(g) {
  const tags = [];
  if (g.demo) tags.push('<span class="chip chip-demo">試玩版</span>');
  if (g.coop) tags.push('<span class="chip chip-coop">雙人同樂</span>');
  if (g.free) tags.push('<span class="chip chip-free">免費</span>');
  const sub = [g.released, g.price, (g.genres || []).slice(0, 2).join("・")].filter(Boolean).join(" · ");
  return `        <tr>
          <td class="art">${g.capsule ? `<img src="${esc(g.capsule)}" alt="" loading="lazy">` : ""}</td>
          <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc(sub || "—")}</span></a></td>
          <td class="num">${tags.join("")}</td>
        </tr>`;
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
    if (!id || !name) continue;
    if (/Playtest|Soundtrack|原聲帶|\bOST\b|DLC|\bPack\b/i.test(name)) continue;
    const demo = /\bDemo\b|試玩版/i.test(name);
    const released = decode((r.match(/class="search_released[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "");
    const capsule = (r.match(/<div class="search_capsule">\s*<img src="([^"]+)"/) || [])[1] || "";
    const platforms = [];
    if (/platform_img win/.test(r)) platforms.push("Win");
    if (/platform_img mac/.test(r)) platforms.push("Mac");
    if (/platform_img linux/.test(r)) platforms.push("Linux");
    const price = priceText(r);
    games.push({
      name, id, demo,
      url: `https://store.steampowered.com/app/${id}/`,
      capsule, released, price,
      free: /免費/.test(price),
      discount: parseInt((r.match(/discount_block[^>]*data-discount="(\d+)"/) || [])[1] || "0", 10) || 0,
      platforms,
      genres: [], coop: false, single: false, multi: false,
    });
  }
  if (games.length < 5) throw new Error("解析結果異常（僅 " + games.length + " 筆）");

  /* 前 30 筆補充類型/合作資訊（節流：每 300ms 一筆） */
  for (let i = 0; i < Math.min(30, games.length); i++) {
    const e = await enrich(games[i].id);
    Object.assign(games[i], e);
    await new Promise((ok) => setTimeout(ok, 300));
  }

  /* 統計（以本批收錄計算，頁面聲明口径） */
  const stats = {
    total: games.length,
    free: games.filter((g) => g.free).length,
    coop: games.filter((g) => g.coop).length,
    demo: games.filter((g) => g.demo).length,
  };

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* ① JSON */
  const jsonFile = path.join(__dirname, "..", "data", "ai-games.json");
  fs.writeFileSync(jsonFile, JSON.stringify({
    updated,
    source: "Steam 商店搜尋（AI 標籤 tag 7926・依上架日排序）",
    count: games.length, stats, games,
  }, null, 1));

  /* ② ai-games.html 靜態清單 */
  const pageFile = path.join(__dirname, "..", "ai-games.html");
  let html = fs.readFileSync(pageFile, "utf8");
  const OPEN = "<!--AI-GAMES-START-->";
  const CLOSE = "<!--AI-GAMES-END-->";
  const openIdx = html.indexOf(OPEN);
  const closeIdx = html.indexOf(CLOSE);
  if (openIdx < 0 || closeIdx < 0) throw new Error("ai-games.html 找不到 AI-GAMES 標記");
  const block = `${OPEN}
      <div class="rows" id="ai-grid" data-updated="${updated}" data-count="${games.length}">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-num" style="width:230px"></colgroup>
        <tbody>
${games.slice(0, 30).map(cardHtml).join("\n")}
        </tbody>
      </table>
      </div>
      ${CLOSE}`;
  html = html.slice(0, openIdx) + block + html.slice(closeIdx + CLOSE.length);
  html = html.replace(/(<div id="ai-stats"[^>]*data-total=")\d+"/, `$1${stats.total}"`);
  html = html.replace(/(<div id="ai-stats"[^>]*data-free=")\d+"/, `$1${stats.free}"`);
  html = html.replace(/(<div id="ai-stats"[^>]*data-coop=")\d+"/, `$1${stats.coop}"`);
  fs.writeFileSync(pageFile, html);

  console.log(`OK ${updated} — AI 雷達收錄 ${games.length} 款（免費 ${stats.free}／雙人 ${stats.coop}／試玩 ${stats.demo}）— ai-games.html 已更新`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
