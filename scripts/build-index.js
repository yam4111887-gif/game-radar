/* v4 首頁產生器：編輯台雙欄（主欄=App 表+Steam 精選；側欄=兌換碼/排行/編輯內容/方法論）
   讀 data/*.json + 舊 index.html 的 <head> 與 #how 區塊 → 重寫 index.html
   GAMES-START/END 標記保留（update-games.js 每日回填）
   用法：node scripts/build-index.js */
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");

const steam = JSON.parse(fs.readFileSync(path.join(REPO, "data/steam.json"), "utf8"));
const games = JSON.parse(fs.readFileSync(path.join(REPO, "data/games.json"), "utf8"));
const codes = JSON.parse(fs.readFileSync(path.join(REPO, "data/codes.json"), "utf8"));

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Steam 精選（前 6 筆） */
const steamRows = steam.games.slice(0, 6).map((g) => `        <tr>
          <td class="art"><img src="${esc(g.header || g.capsule)}" alt="" loading="lazy"></td>
          <td class="title"><a href="${esc(g.url)}" target="_blank" rel="noopener"><b>${esc(g.name)}</b><span>${esc((g.genres || []).join("・") || "—")}</span></a></td>
          <td class="num">${g.discount ? `<em>-${g.discount}%</em>` : ""}<b>${esc(g.price || "—")}</b></td>
        </tr>`).join("\n");

/* 側欄兌換碼靜態快取（無 JS 時的 fallback；app.js 會用 data/codes.json 即時刷新） */
const codeLis = (codes.games || []).slice(0, 5).map((gm) => {
  const c = (gm.codes || []).find((x) => x.status === "expired" ? false : true);
  if (!c) return "";
  return `        <li><span class="dot ${c.status === "active" ? "ok" : "warn"}"></span><div><b>${esc(gm.game)}</b><code>${esc(c.code)}</code></div></li>`;
}).filter(Boolean).join("\n");

const tiers = [
  ["lol-tier-list.html", "英雄聯盟", "26.23"],
  ["genshin-tier-list.html", "原神", "5.8"],
  ["hsr-tier-list.html", "崩壞：星穹鐵道", "3.6"],
  ["wuwa-tier-list.html", "鳴潮", "2.6"],
  ["zzz-tier-list.html", "絕區零", "1.9"],
  ["wild-rift-tier-list.html", "Wild Rift", "6.2"],
];
const tierLis = tiers.map(([h, n, v]) => `        <li><a href="${h}">${esc(n)}<span class="ver">v${esc(v)}</span></a></li>`).join("\n");

const edits = [
  ["zelda-ocarina-remake.html", "薩爾達《時之笛》重製版整理"],
  ["gta-6.html", "GTA 6 最新整理"],
  ["gamescom-2026.html", "Gamescom 2026 重點"],
  ["couple-games.html", "情侶遊戲推薦指南"],
];
const editLis = edits.map(([h, n]) => `        <li><a href="${h}">${esc(n)}</a></li>`).join("\n");

/* 舊 index 的 head 與 how 區塊 */
const oldHtml = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const head = oldHtml.match(/<head>[\s\S]*?<\/head>/)[0];
const how = (oldHtml.match(/<section class="card" id="how">[\s\S]*?<\/section>/) || [""])[0]
  .replace(/<span class="h2i"[^>]*>[\s\S]*?<\/span>\s*/g, "");

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
${head}
<body>
<a class="skip-link" href="#main-content">跳到主要內容</a>
<header class="masthead">
  <div class="masthead-in">
    <div class="brand">遊戲前哨站<em>GAME RADAR</em></div>
    <div class="stamp">獨立觀察站 · 官方資料每日更新</div>
  </div>
</header>
<nav class="tabs">
  <div class="tabs-in">
      <a href="index.html" class="on">今日新品</a>
      <a href="steam.html">Steam</a>
      <a href="ai-games.html">AI 遊戲</a>
      <a href="specs.html">配備需求</a>
      <a href="codes.html">兌換碼</a>
      <a href="tier-list.html">強度排行</a>
      <span class="sp"></span>
      <a class="minor" href="submit.html">開發者投稿</a>
      <a class="minor" href="sponsor.html">贊助</a>
      <a class="minor" href="about.html">關於</a>
  </div>
</nav>

<section class="lede" id="hero">
  <h1>每天早上，把昨天上架的遊戲<mark>整理成一張表</mark>。</h1>
  <p>台灣 App Store 與 Steam（繁中）的最新上架，官方資料自動收錄、依上架日排列。不推薦、不刷榜、不收費——就是 newest 的那一批，等你自己挑。</p>
  <div class="acts">
    <a class="btn prime" href="steam.html">看 Steam 新品</a>
    <a class="btn" href="codes.html">領兌換碼</a>
    <a class="btn" href="#how">這站怎麼運作</a>
  </div>
</section>

<div class="desk" id="main-content">
  <main class="desk-col">
    <div class="data-status" id="data-status">正在載入最新收錄…</div>

    <div class="sec-h" id="apps">
      <span class="eyebrow">App Store</span>
      <h2>今日新品</h2>
      <a class="more" href="#apps">共 <span id="app-count">${esc(String(games.count))}</span> 款</a>
    </div>
    <!--GAMES-START-->
      <div class="rows" id="game-grid" data-updated="${esc(games.updated)}" data-count="${esc(String(games.count))}">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-num"></colgroup>
        <tbody>
        </tbody>
      </table>
      </div>
    <!--GAMES-END-->
    <p style="color:var(--muted-dim);font-size:12.5px;margin-top:10px" id="game-note"></p>

    <div class="sec-h" id="steam">
      <span class="eyebrow">Steam</span>
      <h2>Steam 精選</h2>
      <a class="more" href="steam.html">全部 →</a>
    </div>
    <div class="rows">
      <table>
        <colgroup><col class="c-art"><col class="c-title"><col class="c-num"></colgroup>
        <tbody>
${steamRows}
        </tbody>
      </table>
    </div>
    <p style="color:var(--muted-dim);font-size:12.5px;margin-top:10px">繁中篩選、依上架日新到舊。完整清單與配備需求在 <a href="steam.html" style="color:var(--link)">Steam 新品雷達</a>。</p>

${how}
  </main>

  <aside class="side">
    <div class="panel" id="side-codes-panel">
      <div class="panel-h"><b>CODES</b>兌換碼 · 最新</div>
      <ul class="code-list" id="side-codes">
${codeLis}
      </ul>
      <div class="note"><a href="codes.html">全部兌換碼與來源 →</a></div>
    </div>

    <div class="panel">
      <div class="panel-h"><b>TIER</b>強度排行</div>
      <ul class="tier-list">
${tierLis}
      </ul>
    </div>

    <div class="panel">
      <div class="panel-h"><b>READ</b>編輯內容</div>
      <ul class="tier-list">
${editLis}
      </ul>
    </div>

    <div class="panel">
      <div class="panel-h"><b>ABOUT</b>這站怎麼運作</div>
      <div class="note">
        每日 05:10 UTC 自動抓官方公開資料（Apple iTunes RSS、Steam 商店），機器收錄、人工零干預。開發者可以<a href="submit.html">自由投稿</a>，但我們不收費、不賣排名。<a href="about.html">完整方法 →</a>
      </div>
    </div>
  </aside>
</div>

<footer class="site-footer">
  <div class="foot-in">
    <div class="fl"><a href="index.html">今日新品</a><a href="steam.html">Steam</a><a href="ai-games.html">AI 遊戲</a><a href="specs.html">配備</a><a href="codes.html">兌換碼</a><a href="tier-list.html">排行</a><a href="submit.html">投稿</a><a href="sponsor.html">贊助</a><a href="about.html">關於</a><a href="privacy.html">隱私</a></div>
    <div class="cr">© 2026 遊戲前哨站 · 獨立觀察，非官方 · <a class="to-top" href="#top">回頂端 ↑</a></div>
  </div>
</footer>
<script src="app.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(REPO, "index.html"), html);
console.log("index.html rebuilt:", (html.length / 1024).toFixed(0), "KB · how section:", how ? "kept" : "MISSING!");
