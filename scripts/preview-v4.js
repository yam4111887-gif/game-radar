/* v4 預覽頁產生器：編輯台/資料桌式（flat editorial desk）
   讀 data/*.json → preview-v4.html（僅本地預覽用，未部署） */
const fs = require("fs");
const path = require("path");
const REPO = "/home/node/.openclaw/workspace/game-radar";

const steam = JSON.parse(fs.readFileSync(path.join(REPO, "data/steam.json"), "utf8"));
const games = JSON.parse(fs.readFileSync(path.join(REPO, "data/games.json"), "utf8"));
const codes = JSON.parse(fs.readFileSync(path.join(REPO, "data/codes.json"), "utf8"));

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const today = (steam.updated || "").slice(0, 10);

/* steam 依日分組 */
const groups = [];
for (const g of steam.games.slice(0, 22)) {
  const last = groups[groups.length - 1];
  if (last && last.date === g.released) last.games.push(g);
  else groups.push({ date: g.released, games: [g] });
}
const steamBlocks = groups.map((gr) => `      <h3 class="day-cap">${esc(gr.date)}<span>${gr.games.length} 款</span></h3>
      <div class="rows">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-plat"><col class="c-num"></colgroup>
        <tbody>
${gr.games.map((g) => `        <tr>
          <td class="art"><img src="${esc(g.header || g.capsule)}" alt="" loading="lazy"></td>
          <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc((g.genres || []).join("・") || "—")}</span></a></td>
          <td class="plat">${(g.platforms || []).map((p) => `<i>${esc(p)}</i>`).join("")}</td>
          <td class="num">${g.discount ? `<em>-${g.discount}%</em>` : ""}<b>${esc(g.price || "—")}</b></td>
        </tr>`).join("\n")}
        </tbody>
      </table>
      </div>`).join("\n");

const appRows = games.games.slice(0, 10).map((g) => `      <tr>
        <td class="art"><img class="ico" src="${esc(g.icon)}" alt="" loading="lazy"></td>
        <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc(g.artist || "獨立開發")}</span></a></td>
        <td class="num"><b>${esc(g.price || "免費")}</b></td>
      </tr>`).join("\n");

/* codes 側欄：各遊戲第一個未過期碼 */
const codeItems = (codes.games || []).slice(0, 5).map((gm) => {
  const c = (gm.codes || []).find((x) => x.status !== "expired");
  if (!c) return "";
  return `<li><span class="dot ${c.status === "active" ? "ok" : "warn"}"></span><div><b>${esc(gm.game)}</b><code>${esc(c.code)}</code></div></li>`;
}).filter(Boolean).join("\n");

const tiers = [
  ["lol-tier-list.html", "英雄聯盟", "26.23"],
  ["genshin-tier-list.html", "原神", "5.8"],
  ["hsr-tier-list.html", "崩壞：星穹鐵道", "3.6"],
  ["wuwa-tier-list.html", "鳴潮", "2.6"],
  ["zzz-tier-list.html", "絕區零", "1.9"],
  ["wild-rift-tier-list.html", "傳說對決（Wild Rift）", "6.2"],
];

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>v4 預覽：編輯台式 — 遊戲前哨站</title>
<meta name="robots" content="noindex">
<style>
/* 自架字體（同 style.css v3.1 層） */
@font-face { font-family: "Noto Sans TC Web"; src: url("fonts/NotoSansTC-sub.woff2") format("woff2-variations"); font-weight: 100 900; font-display: swap; }
@font-face { font-family: "Chakra Petch Web"; src: url("fonts/ChakraPetch-Medium.woff2") format("woff2"); font-weight: 400 500; font-display: swap; }
@font-face { font-family: "Chakra Petch Web"; src: url("fonts/ChakraPetch-SemiBold.woff2") format("woff2"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Chakra Petch Web"; src: url("fonts/ChakraPetch-Bold.woff2") format("woff2"); font-weight: 700; font-display: swap; }
/* ===== V4 PREVIEW ONLY：編輯台 tokens（覆蓋式預覽，不影響線上） ===== */
:root {
  --v4-bg: #0e1116;
  --v4-surface: #14181f;
  --v4-surface-2: #191e27;
  --v4-line: #262d39;
  --v4-line-soft: #1d232d;
  --v4-text: #e7eaee;
  --v4-muted: #98a1ac;
  --v4-dim: #6b7480;
  --v4-accent: #e2a03f;      /* 信號琥珀：雷達/儀器的顏色，不是 AI 紫 */
  --v4-accent-ink: #171106;
  --v4-link: #9db8d9;
  --v4-ok: #57b57c;
  --v4-warn: #d9a53f;
}
.v4 * { box-sizing: border-box; }
.v4 {
  margin: 0;
  background: var(--v4-bg);
  color: var(--v4-text);
  font-family: "Noto Sans TC Web", "PingFang TC", "Microsoft JhengHei", sans-serif;
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.v4 a { color: inherit; text-decoration: none; }

/* ---- 報頭 ---- */
.v4 .masthead {
  border-bottom: 1px solid var(--v4-line);
  background: var(--v4-surface);
}
.v4 .masthead-in {
  max-width: 1120px; margin: 0 auto; padding: 14px 20px 12px;
  display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
}
.v4 .brand {
  font-size: 21px; font-weight: 800; letter-spacing: .01em;
}
.v4 .brand em {
  font-style: normal; font-family: "Chakra Petch Web", monospace;
  font-size: 11px; font-weight: 700; letter-spacing: .28em;
  color: var(--v4-accent); margin-left: 10px; vertical-align: 2px;
}
.v4 .stamp {
  margin-left: auto; font-size: 12px; color: var(--v4-dim);
  font-family: "Chakra Petch Web", monospace; letter-spacing: .04em;
}
.v4 .stamp b { color: var(--v4-muted); font-weight: 600; }

/* ---- 導覽：平面頁籤 ---- */
.v4 .tabs { border-bottom: 1px solid var(--v4-line); background: var(--v4-bg); position: sticky; top: 0; z-index: 5; }
.v4 .tabs-in {
  max-width: 1120px; margin: 0 auto; padding: 0 20px;
  display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
}
.v4 .tabs-in::-webkit-scrollbar { display: none; }
.v4 .tabs a {
  padding: 11px 13px 9px; font-size: 13.5px; font-weight: 600; color: var(--v4-muted);
  border-bottom: 2px solid transparent; white-space: nowrap;
}
.v4 .tabs a:hover { color: var(--v4-text); }
.v4 .tabs a.on { color: var(--v4-text); border-bottom-color: var(--v4-accent); }
.v4 .tabs .sp { flex: 1; }
.v4 .tabs a.minor { color: var(--v4-dim); font-weight: 400; }

/* ---- 綱領句（取代 hero） ---- */
.v4 .lede {
  max-width: 1120px; margin: 0 auto; padding: 26px 20px 8px;
}
.v4 .lede h1 {
  margin: 0 0 6px; font-size: 26px; font-weight: 800; line-height: 1.35; letter-spacing: .005em;
}
.v4 .lede h1 mark { background: none; color: var(--v4-accent); }
.v4 .lede p { margin: 0; color: var(--v4-muted); font-size: 14px; max-width: 62ch; }
.v4 .lede .acts { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.v4 .btn {
  font-size: 13px; font-weight: 700; padding: 7px 14px; border-radius: 4px;
  border: 1px solid var(--v4-line); color: var(--v4-text); background: var(--v4-surface);
}
.v4 .btn.prime { background: var(--v4-accent); color: var(--v4-accent-ink); border-color: var(--v4-accent); }

/* ---- 主佈局：編輯台雙欄 ---- */
.v4 .desk {
  max-width: 1120px; margin: 18px auto 40px; padding: 0 20px;
  display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 32px;
  align-items: start;
}

/* ---- 區節標：小帽眉毛＋髮絲線 ---- */
.v4 .sec-h {
  display: flex; align-items: baseline; gap: 10px;
  border-bottom: 2px solid var(--v4-line); padding-bottom: 7px; margin: 26px 0 0;
}
.v4 .desk-col > .sec-h:first-child { margin-top: 0; }
.v4 .sec-h .eyebrow {
  font-family: "Chakra Petch Web", monospace; font-size: 11px; font-weight: 700;
  letter-spacing: .3em; color: var(--v4-accent);
}
.v4 .sec-h h2 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: .01em; }
.v4 .sec-h .more { margin-left: auto; font-size: 12.5px; color: var(--v4-dim); font-weight: 600; }
.v4 .sec-h .more:hover { color: var(--v4-link); }

/* ---- 資料表：核心反 AI 結構 ---- */
.v4 table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.v4 col.c-art { width: 132px; }
.v4 col.c-plat { width: 92px; }
.v4 col.c-num { width: 150px; }
.v4 td.art img { width: 116px; }
.v4 .day-cap {
  display: flex; align-items: baseline; gap: 8px;
  margin: 14px 0 0; font-size: 12px; font-weight: 700; color: var(--v4-muted); letter-spacing: .06em;
  font-family: "Chakra Petch Web", "Noto Sans TC Web", monospace;
}
.v4 .day-cap span { color: var(--v4-dim); font-weight: 600; }
.v4 .rows { border: 1px solid var(--v4-line-soft); border-radius: 6px; overflow: hidden; margin-top: 12px; background: var(--v4-surface); }
.v4 tbody tr { border-top: 1px solid var(--v4-line-soft); }
.v4 tbody tr:first-child { border-top: 0; }
.v4 tbody tr:hover { background: var(--v4-surface-2); }
.v4 td { vertical-align: middle; padding: 9px 12px 9px 0; }
.v4 td:first-child { padding-left: 12px; }
.v4 td.art { width: 1%; padding-right: 12px; }
.v4 td.art img { display: block; width: 116px; height: 54px; object-fit: cover; border-radius: 3px; background: #0a0d12; }
.v4 td.art img.ico { width: 40px; height: 40px; border-radius: 8px; }
.v4 td.title { min-width: 0; }
.v4 td.title a { display: block; min-width: 0; max-width: 520px; }
.v4 td.title b {
  display: block; font-size: 14.5px; font-weight: 700; line-height: 1.4; color: var(--v4-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.v4 tbody tr:hover td.title b { color: #fff; }
.v4 td.title span { display: block; font-size: 12px; color: var(--v4-dim); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v4 td.plat { white-space: nowrap; }
.v4 td.plat i {
  font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: .05em;
  color: var(--v4-dim); border: 1px solid var(--v4-line); border-radius: 3px; padding: 1px 5px; margin-right: 3px;
  font-family: "Chakra Petch Web", monospace;
}
.v4 td.num { text-align: right; white-space: nowrap; padding-right: 14px; }
.v4 td.num b {
  font-family: "Chakra Petch Web", monospace; font-size: 13.5px; font-weight: 700;
  color: var(--v4-text); font-variant-numeric: tabular-nums;
}
.v4 td.num em {
  font-style: normal; font-family: "Chakra Petch Web", monospace; font-size: 11.5px; font-weight: 700;
  background: rgba(87, 181, 124, .15); color: var(--v4-ok); border-radius: 3px; padding: 1px 5px; margin-right: 6px;
}
.v4 td.num b.free { color: var(--v4-ok); }

/* ---- 側欄 ---- */
.v4 .side .panel { border: 1px solid var(--v4-line-soft); border-radius: 6px; background: var(--v4-surface); overflow: hidden; }
.v4 .side .panel + .panel { margin-top: 18px; }
.v4 .panel-h {
  padding: 9px 14px 8px; border-bottom: 1px solid var(--v4-line-soft); background: var(--v4-surface-2);
  font-size: 12px; font-weight: 800; letter-spacing: .14em; color: var(--v4-muted);
}
.v4 .panel-h b { color: var(--v4-accent); margin-right: 6px; font-family: "Chakra Petch Web", monospace; letter-spacing: 0; }
.v4 .code-list { list-style: none; margin: 0; padding: 0; }
.v4 .code-list li {
  display: flex; gap: 9px; align-items: flex-start; padding: 9px 14px;
  border-top: 1px solid var(--v4-line-soft); font-size: 13px;
}
.v4 .code-list li:first-child { border-top: 0; }
.v4 .code-list b { display: block; font-size: 13px; font-weight: 700; }
.v4 .code-list code {
  display: inline-block; margin-top: 2px; font-family: "Chakra Petch Web", monospace;
  font-size: 12.5px; font-weight: 600; letter-spacing: .08em; color: var(--v4-link);
  background: var(--v4-bg); border: 1px solid var(--v4-line); border-radius: 3px; padding: 1px 7px;
}
.v4 .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; }
.v4 .dot.ok { background: var(--v4-ok); }
.v4 .dot.warn { background: var(--v4-warn); }
.v4 .tier-list { list-style: none; margin: 0; padding: 4px 0; }
.v4 .tier-list li { border-top: 1px solid var(--v4-line-soft); }
.v4 .tier-list li:first-child { border-top: 0; }
.v4 .tier-list a { display: flex; align-items: center; gap: 10px; padding: 8px 14px; font-size: 13.5px; font-weight: 600; }
.v4 .tier-list a:hover { background: var(--v4-surface-2); color: #fff; }
.v4 .tier-list .ver {
  margin-left: auto; font-family: "Chakra Petch Web", monospace; font-size: 11.5px;
  color: var(--v4-dim); font-weight: 600;
}
.v4 .side .note { padding: 11px 14px; font-size: 12.5px; color: var(--v4-dim); line-height: 1.7; }
.v4 .side .note a { color: var(--v4-link); }

/* ---- 頁腳 ---- */
.v4 footer {
  border-top: 1px solid var(--v4-line); background: var(--v4-surface);
}
.v4 .foot-in {
  max-width: 1120px; margin: 0 auto; padding: 18px 20px;
  display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline;
  font-size: 12.5px; color: var(--v4-dim);
}
.v4 .foot-in .fl { display: flex; gap: 14px; flex-wrap: wrap; }
.v4 .foot-in a:hover { color: var(--v4-text); }
.v4 .foot-in .cr { margin-left: auto; }

/* ---- 響應式 ---- */
@media (max-width: 900px) {
  .v4 .desk { grid-template-columns: 1fr; gap: 8px; }
  .v4 td.art img { width: 76px; height: 36px; }
  .v4 td.art img.ico { width: 36px; height: 36px; }
  .v4 td.plat { padding: 0; overflow: hidden; max-width: 0; }
  .v4 td.title a { max-width: none; }
  .v4 col.c-art { width: 84px; }
  .v4 col.c-plat { width: 0; }
  .v4 col.c-num { width: 106px; }
  .v4 td.num b { font-size: 12.5px; }
  .v4 td.num em { font-size: 10.5px; margin-right: 4px; }
  .v4 td.num { padding-right: 10px; }
  .v4 .lede h1 { font-size: 21px; }
}
</style>
</head>
<body class="v4">

<header class="masthead">
  <div class="masthead-in">
    <div class="brand">遊戲前哨站<em>GAME RADAR</em></div>
    <div class="stamp"><b>${esc(steam.updated || "")}</b> UTC 更新 ・ 資料：Apple RSS × Steam 商店</div>
  </div>
</header>

<nav class="tabs">
  <div class="tabs-in">
    <a class="on" href="#">今日新品</a>
    <a href="#">Steam</a>
    <a href="#">AI 遊戲</a>
    <a href="#">配備需求</a>
    <a href="#">兌換碼</a>
    <a href="#">強度排行</a>
    <span class="sp"></span>
    <a class="minor" href="#">開發者投稿</a>
    <a class="minor" href="#">贊助</a>
    <a class="minor" href="#">關於</a>
  </div>
</nav>

<div class="lede">
  <h1>每天早上，把昨天上架的遊戲<mark>整理成一張表</mark>。</h1>
  <p>台灣 App Store 與 Steam（繁中）的最新上架，官方資料自動收錄、依上架日排列。不推薦、不刷榜、不收費——就是 newest 的那一批，等你自己挑。</p>
  <div class="acts">
    <a class="btn prime" href="#steam">看 Steam 新品</a>
    <a class="btn" href="#codes">領兌換碼</a>
    <a class="btn" href="#how">資料怎麼來</a>
  </div>
</div>

<div class="desk">
  <main class="desk-col">
    <div class="sec-h" id="steam">
      <span class="eyebrow">STEAM</span>
      <h2>Steam 新品（繁中）</h2>
      <a class="more" href="#">全部 38 款 →</a>
    </div>
    <div class="rows">
${steamBlocks}
    </div>

    <div class="sec-h" id="apps">
      <span class="eyebrow">APP STORE</span>
      <h2>App Store 新品</h2>
      <a class="more" href="#">全部 ${esc(String(games.count))} 款 →</a>
    </div>
    <div class="rows">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-num"></colgroup>
        <tbody>
${appRows}
        </tbody>
      </table>
    </div>
  </main>

  <aside class="side">
    <div class="panel" id="codes">
      <div class="panel-h"><b>CODES</b>兌換碼 · 最新</div>
      <ul class="code-list">
${codeItems}
      </ul>
      <div class="note"><a href="#">全部兌換碼與來源 →</a></div>
    </div>

    <div class="panel">
      <div class="panel-h"><b>TIER</b>強度排行</div>
      <ul class="tier-list">
${tiers.map(([href, name, ver]) => `        <li><a href="${href}">${esc(name)}<span class="ver">v${esc(ver)}</span></a></li>`).join("\n")}
      </ul>
    </div>

    <div class="panel">
      <div class="panel-h"><b>ABOUT</b>這站怎麼運作</div>
      <div class="note">
        每日 05:10 UTC 自動抓官方公開資料（Apple iTunes RSS、Steam 商店搜尋），機器收錄、人工零干預。開發者可以<a href="#">自由投稿</a>，但我們不收費、不賣排名。<a href="#">完整方法 →</a>
      </div>
    </div>
  </aside>
</div>

<footer>
  <div class="foot-in">
    <div class="fl"><a href="#">App 新品</a><a href="#">Steam</a><a href="#">配備</a><a href="#">兌換碼</a><a href="#">排行</a><a href="#">投稿</a><a href="#">贊助</a><a href="#">關於</a><a href="#">隱私</a></div>
    <div class="cr">© 2026 遊戲前哨站 · 獨立觀察，非官方</div>
  </div>
</footer>

</body>
</html>
`;

fs.writeFileSync(path.join(REPO, "preview-v4.html"), html);
console.log("preview-v4.html written:", (html.length / 1024).toFixed(0), "KB · steam groups:", groups.length, "· codes:", codeItems.split("<li>").length - 1);
