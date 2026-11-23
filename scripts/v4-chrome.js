/* v4 chrome codemod：site-header→masthead+tabs、hero→lede、footer→平面、拔 h2i/pic icon
   用法：node scripts/v4-chrome.js（冪等：已有 .masthead 則跳過該檔） */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SKIP = new Set(["index.html", "preview-v4.html"]);

const NAV = [
  { href: "index.html", label: "今日新品", on: ["index.html"] },
  { href: "steam.html", label: "Steam", on: ["steam.html"] },
  { href: "ai-games.html", label: "AI 遊戲", on: ["ai-games.html"] },
  { href: "specs.html", label: "配備需求", on: ["specs.html"] },
  { href: "codes.html", label: "兌換碼", on: ["codes.html"] },
  { href: "tier-list.html", label: "強度排行", on: ["tier-list.html", "lol-tier-list.html", "genshin-tier-list.html", "hsr-tier-list.html", "wuwa-tier-list.html", "zzz-tier-list.html", "wild-rift-tier-list.html"] },
];

const LEDE = {
  "steam.html": {
    h1: 'Steam 上，今天又出了什麼<mark>新遊戲</mark>？',
    sub: "從 Steam 官方商店收錄支援繁體中文的最新上架——依上架日新到舊、附價格與平台，機器每日更新、人工零干預。",
    acts: `<a class="btn" href="index.html">App Store 新品</a><a class="btn" href="specs.html">配備需求查詢</a><a class="btn" href="codes.html">領兌換碼</a>`,
  },
};

function chromeFor(file) {
  const tabs = NAV.map((n) => `<a href="${n.href}"${n.on.includes(file) ? ' class="on"' : ""}>${n.label}</a>`).join("\n      ") + `\n      <span class="sp"></span>\n      <a class="minor" href="submit.html">開發者投稿</a>\n      <a class="minor" href="sponsor.html">贊助</a>\n      <a class="minor" href="about.html"${file === "about.html" ? ' class="minor on"' : ""}>關於</a>`;
  return { tabs };
}

for (const file of fs.readdirSync(REPO).filter((f) => f.endsWith(".html"))) {
  if (SKIP.has(file)) continue;
  const p = path.join(REPO, file);
  let html = fs.readFileSync(p, "utf8");
  if (html.includes('class="masthead"')) { console.log(file, "skip (already v4)"); continue; }

  const before = html.length;

  /* 1) header → masthead + tabs */
  html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, () => {
    const { tabs } = chromeFor(file);
    return `<header class="masthead">
  <div class="masthead-in">
    <div class="brand">遊戲前哨站<em>GAME RADAR</em></div>
    <div class="stamp">獨立觀察站 · 官方資料每日更新</div>
  </div>
</header>
<nav class="tabs">
  <div class="tabs-in">
      ${tabs}
  </div>
</nav>`;
  });

  /* 2) hero → lede */
  html = html.replace(/<section id="hero">([\s\S]*?)<\/section>/, (_m, inner) => {
    const h1m = inner.match(/<h1>([\s\S]*?)<\/h1>/);
    const subm = inner.match(/<p class="hero-sub">([\s\S]*?)<\/p>/);
    const cfg = LEDE[file] || {};
    const h1 = cfg.h1 || (h1m ? h1m[1].trim() : "遊戲前哨站");
    const sub = cfg.sub || (subm ? subm[1].trim() : "");
    const acts = cfg.acts || "";
    return `<section class="lede" id="hero">
  <h1>${h1}</h1>
  <p>${sub}</p>
  ${acts ? `<div class="acts">${acts}</div>` : ""}
</section>`;
  });

  /* 3) stats-band / cta-band 移除（保險；index 由產生器處理） */
  html = html.replace(/<div class="stats-band"[\s\S]*?<\/div>\n?/g, "");
  html = html.replace(/<section class="cta-band"[\s\S]*?<\/section>\n?/g, "");
  html = html.replace(/<div class="cta-band"[\s\S]*?<\/div>\n?/g, "");

  /* 4) h2i 與 promo pic 拔除 */
  html = html.replace(/<span class="h2i"[^>]*>[\s\S]*?<\/span>\s*/g, "");
  html = html.replace(/<span class="pic">[\s\S]*?<\/span>\s*/g, "");

  /* 5) footer → 平面 */
  html = html.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, () => `<footer class="site-footer">
  <div class="foot-in">
    <div class="fl"><a href="index.html">今日新品</a><a href="steam.html">Steam</a><a href="ai-games.html">AI 遊戲</a><a href="specs.html">配備</a><a href="codes.html">兌換碼</a><a href="tier-list.html">排行</a><a href="submit.html">投稿</a><a href="sponsor.html">贊助</a><a href="about.html">關於</a><a href="privacy.html">隱私</a></div>
    <div class="cr">© 2026 遊戲前哨站 · 獨立觀察，非官方 · <a class="to-top" href="#top">回頂端 ↑</a></div>
  </div>
</footer>`);

  fs.writeFileSync(p, html);
  console.log(file, "done", before, "→", html.length);
}
