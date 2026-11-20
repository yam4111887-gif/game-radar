/* 配備需求分區：抓 Steam appdetails API（繁中/台灣區）
   → 讀 data/steam.json 前 12 款新品的最低/建議配備
   → ①data/specs.json ②specs.html 靜態清單（SEO）
   用法：node scripts/update-specs.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

/* Steam 的需求是 HTML（<ul><li>…），轉成乾淨的文字行 */
function reqToLines(html) {
  if (!html) return [];
  return html
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => decode(l))
    .filter((l) => l.length > 1 && l.length < 220 && !/^(最低|建議|Minimum|Recommended)\s*配備\s*[:：]?\s*$/i.test(l));
}

function cardHtml(g) {
  const li = (arr) => (arr.length ? arr.map((l) => `          <li>${esc(l)}</li>`).join("\n") : `          <li>官方商店頁未提供</li>`);
  return `      <div class="spec-card">
        <h3>${esc(g.name)} <span class="spec-meta">${esc(g.released)}${g.price ? " · " + esc(g.price) : ""}</span></h3>
        <div class="spec-cols">
          <div class="spec-col"><h4>最低配備</h4>
            <ul>
${li(g.minimum)}
            </ul>
          </div>
          <div class="spec-col"><h4>建議配備</h4>
            <ul>
${li(g.recommended)}
            </ul>
          </div>
        </div>
        <a class="spec-go" href="${esc(g.url)}" target="_blank" rel="noopener">在 Steam 商店查看 →</a>
      </div>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const steamFile = path.join(__dirname, "..", "data", "steam.json");
  const steam = JSON.parse(fs.readFileSync(steamFile, "utf8"));
  const targets = (steam.games || []).filter((g) => g.id && g.name).slice(0, 12);

  const specs = [];
  for (const g of targets) {
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${g.id}&cc=tw&l=tchinese`,
        { headers: { "Accept-Language": "zh-TW,zh;q=0.9", "User-Agent": "Mozilla/5.0 game-radar-updater/1.0" } }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const d = j && j[g.id] && j[g.id].data;
      const req = d && d.pc_requirements;
      if (!req || (!req.minimum && !req.recommended)) continue; /* 無 PC 需求（如純 Mac）跳過 */
      specs.push({
        name: g.name, id: g.id, url: g.url, released: g.released, price: g.price, discount: g.discount || 0,
        minimum: reqToLines(req.minimum),
        recommended: reqToLines(req.recommended),
      });
    } catch (e) {
      console.error("  略過 " + g.name + "：" + e.message);
    }
    await sleep(350); /* 對 appdetails 有禮貌一點 */
  }
  if (specs.length < 3) throw new Error("有效配備資料過少（" + specs.length + " 筆）");

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");

  /* ① JSON */
  const jsonFile = path.join(__dirname, "..", "data", "specs.json");
  fs.writeFileSync(jsonFile, JSON.stringify({ updated, source: "Steam appdetails API（台灣區・繁中）", count: specs.length, specs }, null, 1));

  /* ② specs.html 靜態清單 */
  const pageFile = path.join(__dirname, "..", "specs.html");
  let html = fs.readFileSync(pageFile, "utf8");
  const OPEN = "<!--SPECS-START-->";
  const CLOSE = "<!--SPECS-END-->";
  const openIdx = html.indexOf(OPEN);
  const closeIdx = html.indexOf(CLOSE);
  if (openIdx < 0 || closeIdx < 0) throw new Error("specs.html 找不到 SPECS 標記");
  const staticBlock = `${OPEN}
      <div class="spec-list" id="spec-list" data-updated="${updated}" data-count="${specs.length}">
${specs.map(cardHtml).join("\n")}
      </div>
      ${CLOSE}`;
  html = html.slice(0, openIdx) + staticBlock + html.slice(closeIdx + CLOSE.length);
  fs.writeFileSync(pageFile, html);

  console.log(`OK ${updated} — 配備頁 ${specs.length} 款 — JSON ${(fs.statSync(jsonFile).size / 1024).toFixed(0)}KB — specs.html 已更新`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
