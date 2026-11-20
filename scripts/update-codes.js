/* 兌換碼雷達：每遊戲一個 fetcher（Node 內建 fetch，無 npm 依賴）
   → ①data/codes.json ②codes.html 靜態區塊（<!--CODES-START-->/<!--CODES-END-->）
   鐵律：只收真實存在的碼（來源頁面實際列出才收錄），每碼必附 sourceUrl；
         單一來源失敗 fail-soft（保留上次成功資料，標 stale 續跑其他遊戲）。
   用法：node scripts/update-codes.js（在 game-radar 目錄下執行） */
const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 game-radar-updater/1.0";

const MAX_ACTIVE = 20; /* 每遊戲最多收錄有效碼 */
const MAX_EXPIRED = 10; /* 過期碼折疊區最多收錄（來源排列大致新→舊） */

/* 遊戲清單：官方兌換入口 + 社群權威整理來源 */
const GAMES = [
  {
    key: "genshin", name: "Genshin Impact", zh: "原神",
    redeemUrl: "https://genshin.hoyoverse.com/redemption",
    sourceName: "Pocket Gamer（Genshin Impact codes）",
    sourceUrl: "https://www.pocketgamer.com/genshin-impact/genshin-impact-codes/",
    type: "pocketgamer",
  },
  {
    key: "starrail", name: "Honkai: Star Rail", zh: "崩壞：星穹鐵道",
    redeemUrl: "https://hsr.hoyoverse.com/redemption",
    sourceName: "ONE eSports（HSR codes）× Hum-Bao/hoyoverse-codes 每日驗證",
    sourceUrl: "https://www.oneesports.gg/honkai-star-rail/honkai-star-rail-codes-redeem/",
    type: "oneesports",
    livenessUrl: "https://raw.githubusercontent.com/Hum-Bao/hoyoverse-codes/main/HSR.txt",
    livenessName: "Hum-Bao/hoyoverse-codes",
  },
  {
    key: "zzz", name: "Zenless Zone Zero", zh: "絕區零",
    redeemUrl: "https://zenless.hoyoverse.com/redemption",
    sourceName: "Pocket Gamer（Zenless Zone Zero codes）",
    sourceUrl: "https://www.pocketgamer.com/zenless-zone-zero/codes/",
    type: "pocketgamer",
  },
  {
    key: "wuwa", name: "Wuthering Waves", zh: "鳴潮",
    redeemUrl: "https://wutheringwaves.kurogames.com/en/main",
    redeemNote: "兌換請於遊戲內操作：設定 → 帳號 → 兌換碼",
    sourceName: "Pocket Gamer（Wuthering Waves codes）",
    sourceUrl: "https://www.pocketgamer.com/wuthering-waves/codes/",
    type: "pocketgamer",
  },
  {
    key: "roblox", name: "Roblox", zh: "Roblox",
    redeemUrl: "https://www.roblox.com/redeem",
    redeemNote: "官方 /promocodes 頁已併入 /redeem（登入後輸入即可）",
    sourceName: "Followchain（Roblox promo codes 整理）",
    sourceUrl: "https://www.followchain.org/roblox-promo-codes/",
    type: "followchain",
  },
];

/* ---------- 共用工具 ---------- */
const decode = (s) =>
  String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&times;/gi, "×").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 標準貨幣/道具名對照（只譯官方繁中確定者，其餘保留原文，不猜不編） */
const ZH_TERMS = [
  [/Primogems?\b/gi, "原石"], [/Mora\b/gi, "摩拉"], [/Hero's Wit/gi, "大英雄的經驗"],
  [/Adventurer's Experience/gi, "冒險家的經驗"], [/Stellar Jades?\b/gi, "星瓊"],
  [/Traveler's Guide/gi, "旅行者的指引"], [/Refined Aether/gi, "精煉的以太"],
  [/Credits?\b/gi, "信用點"], [/Polychrome/gi, "菲林"], [/Astrites?\b/gi, "星聲"],
  [/Shell Credits?/gi, "貝幣"],
];
function zhReward(r) {
  let t = String(r || "").replace(/[\u2018\u2019]/g, "'");
  const asia = /\(Asia only\)/i.test(t);
  t = t.replace(/\(Asia only\)/gi, "").replace(/\(new!\)/gi, "").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  for (const [re, zh] of ZH_TERMS) t = t.replace(re, zh);
  t = t.replace(/ x(\d)/gi, " ×$1").replace(/(\d)\s*x\s*(\d)/gi, "$1×$2");
  if (asia) t += "（亞洲服限定）";
  return t || "見來源標示";
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

function headings(html) {
  return [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
    .map((m) => ({ pos: m.index, text: decode(m[1]) }))
    .filter((h) => h.text);
}
function segment(html, heads, h) {
  const next = heads.find((x) => x.pos > h.pos);
  return html.slice(h.pos, next ? next.pos : h.pos + 30000);
}
function liEntries(seg) {
  const out = [];
  for (const m of seg.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const t = decode(m[1]);
    if (!t) continue;
    const i = t.indexOf(" - ");
    const code = (i < 0 ? t : t.slice(0, i)).trim();
    const reward = i < 0 ? "" : t.slice(i + 3).trim();
    if (!/^[A-Za-z0-9]{4,20}$/.test(code)) continue; /* 多字詞（活動名等）非單一兌換碼，跳過 */
    out.push({ code, reward });
  }
  return out;
}

/* ---------- Fetcher：Pocket Gamer 系列（active/expired 分區明確） ---------- */
function parsePocketgamer(html, game) {
  const heads = headings(html);
  const dateRaw = decode((html.match(/Updated on ([^<]{5,60})/) || [])[1] || "");
  const retired = /article retired/i.test(html);
  const activeH = heads.find((h) => /newest|working/i.test(h.text) && !/expired|not working/i.test(h.text));
  const expiredH = heads.find((h) => /expired|not working/i.test(h.text));
  if (!activeH && !expiredH) throw new Error("找不到 codes 分區標題");

  const active = activeH ? liEntries(segment(html, heads, activeH)) : [];
  const expired = expiredH ? liEntries(segment(html, heads, expiredH)) : [];

  const mk = (e, status) => ({
    code: e.code,
    reward: zhReward(e.reward),
    status,
    sourceUrl: game.sourceUrl,
  });
  /* 來源頁已聲明「article retired」→ 該頁不再維護，有效區一律降級為 unverified（誠實標示） */
  const activeStatus = retired ? "unverified" : "active";
  return {
    codes: [
      ...active.slice(0, MAX_ACTIVE).map((e) => mk(e, activeStatus)),
      ...expired.slice(0, MAX_EXPIRED).map((e) => mk(e, "expired")),
    ],
    sourceUpdated: dateRaw || "",
    note: retired ? "來源頁面已停止維護（article retired），碼狀態僅供參考" : "",
  };
}

/* ---------- Fetcher：Followchain（Roblox 促銷碼；來源不標有效期限 → 一律 unverified） ---------- */
function parseFollowchain(html, game) {
  /* 該站清單標題不是 <h*> 而是 <p>Roblox promo codes to redeem</p>，後接第一個 <ul> */
  const anchorM = html.match(/<p[^>]*>\s*Roblox promo codes to redeem\s*<\/p>/i);
  if (!anchorM) throw new Error("找不到 promo codes 區塊");
  const anchor = anchorM.index;
  const ul = html.slice(anchor).match(/<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (!ul) throw new Error("找不到 promo codes 清單");
  const seen = new Set();
  const codes = [];
  for (const m of ul[1].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const code = decode(m[1]);
    if (!/^[A-Za-z0-9]{4,20}$/.test(code)) continue;
    const k = code.toUpperCase();
    if (seen.has(k)) continue; /* 去除大小寫重複 */
    seen.add(k);
    codes.push({
      code,
      reward: "免費虛擬物品（肩寵・配件等，依各活動而定）",
      status: "unverified",
      sourceUrl: game.sourceUrl,
    });
    if (codes.length >= MAX_ACTIVE) break;
  }
  if (!codes.length) throw new Error("解析到 0 碼");
  return { codes, sourceUpdated: "", note: "來源未標示各碼有效期限，一律標「未驗證」，領取失敗即已過期" };
}

/* ---------- Fetcher：ONE eSports（HSR）
   主表格 = 日期/到期/碼/獎勵；表格下方另有「Expired codes」清單。
   活碼狀態用 Hum-Bao/hoyoverse-codes（GitHub，每日白動更新，US 區）交叉驗證：
   在清單上=active、不=expired、清單抓不到=unverified（依到期日推估） ---------- */
function parseOneesports(html) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const codesTable = tables.find((tb) => tb.includes("<td") && /CODES/i.test(tb));
  if (!codesTable) throw new Error("找不到 codes 表格");
  const entries = [];
  for (const r of codesTable.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => decode(c[1]));
    if (cells.length < 4) continue;
    const expiryRaw = cells[1], code = cells[2], reward = cells[3];
    if (!/^[A-Za-z0-9]{4,20}$/.test(code)) continue;
    entries.push({ expiryRaw, code, reward });
  }
  if (!entries.length) throw new Error("表格解析到 0 碼");
  const expiredBlock = html.match(/Expired[^<]{0,40}codes[\s\S]{0,8000}?<\/ul>/i);
  const expiredSet = new Set();
  if (expiredBlock) {
    for (const m of expiredBlock[0].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const c = decode(m[1]);
      if (/^[A-Za-z0-9]{4,20}$/.test(c)) expiredSet.add(c.toUpperCase());
    }
  }
  return { entries, expiredSet };
}

async function fetchOneesports(game, html) {
  const { entries, expiredSet } = parseOneesports(html);

  let live = [];
  let livenessOk = false;
  try {
    const txt = await fetchHtml(game.livenessUrl);
    live = txt.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^[A-Za-z0-9]{4,20}$/.test(s));
    livenessOk = true;
  } catch (_) { /* fail-soft：驗證清單抓不到 → 狀態降級 */ }
  const liveSet = new Set(live.map((c) => c.toUpperCase()));
  const now = Date.now();

  const out = [];
  for (const e of entries) {
    if (expiredSet.has(e.code.toUpperCase())) continue;
    const dm = e.expiryRaw.match(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
    const exp = dm ? new Date(dm[0] + " 23:59:00+08:00") : null;
    let status;
    if (livenessOk) status = liveSet.has(e.code.toUpperCase()) ? "active" : "expired";
    else status = exp && exp.getTime() < now ? "expired" : "unverified";
    out.push({ code: e.code, reward: zhReward(e.reward), status, sourceUrl: game.sourceUrl });
  }
  /* 活碼清單有、表格沒有的碼（新碼表格還沒收）也補進來 */
  for (const c of live) {
    if (!out.some((o) => o.code.toUpperCase() === c.toUpperCase())) {
      out.push({ code: c, reward: "見官方兌換頁說明", status: "active", sourceUrl: game.sourceUrl });
    }
  }
  if (!out.length) throw new Error("解析到 0 碼");

  const act = out.filter((c) => c.status === "active").slice(0, MAX_ACTIVE);
  const expd = out.filter((c) => c.status === "expired").slice(0, MAX_EXPIRED);
  return {
    codes: [...act, ...expd],
    sourceUpdated: "",
    note: livenessOk
      ? "活碼狀態由 Hum-Bao/hoyoverse-codes 每日更新清單交叉驗證（US 區）"
      : "驗證清單抓取失敗，狀態僅依表格到期日推估，僅供參考",
  };
}

/* ---------- codes.html 靜態區塊 ---------- */
function statusBadge(s) {
  return s === "active" ? '<span class="st st-active">有效</span>'
    : s === "expired" ? '<span class="st st-expired">已過期</span>'
    : '<span class="st st-unverified">未驗證</span>';
}
function codeLi(c, expiredStyle) {
  const st = expiredStyle ? "" : statusBadge(c.status);
  return `        <li class="code-item${expiredStyle ? " code-item-expired" : ""}">
          <span class="code-chip" data-code="${esc(c.code)}">${esc(c.code)}</span>
          <span class="reward">${esc(c.reward)}</span>${st}
          <button type="button" class="copy-btn" data-copy="${esc(c.code)}">複製</button>
        </li>`;
}
function gameCard(g) {
  const live = g.codes.filter((c) => c.status !== "expired");
  const dead = g.codes.filter((c) => c.status === "expired");
  const activeN = g.codes.filter((c) => c.status === "active").length;
  const unvN = g.codes.filter((c) => c.status === "unverified").length;
  const parts = [];
  if (activeN) parts.push(activeN + " 有效");
  if (unvN) parts.push(unvN + " 未驗證");
  const countLabel = activeN + unvN > 0
    ? `${activeN + unvN} 個收錄碼${parts.length ? "（" + parts.join("・") + "）" : ""}`
    : "目前無收錄碼";
  const title = g.zh === g.name ? g.zh : `${g.zh} ${g.name}`;
  const lines = [];
  lines.push(`    <section class="card game-codes" id="game-${esc(g.key)}">`);
  lines.push(`      <h2>🎁 ${esc(title)} <span class="spec-meta">${esc(countLabel)}</span></h2>`);
  lines.push(`      <p class="redeem-line"><a class="redeem-btn" href="${esc(g.redeemUrl)}" target="_blank" rel="noopener">官方兌換入口 ↗</a>${g.redeemNote ? ' <span class="redeem-note">' + esc(g.redeemNote) + "</span>" : ""}</p>`);
  lines.push(`      <p class="src-line">資料來源：<a href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">${esc(g.sourceName)}</a>${g.sourceUpdated ? "（來源頁標示更新：" + esc(g.sourceUpdated) + "）" : ""}${g.note ? "｜⚠ " + esc(g.note) : ""}${g.stale ? "｜⚠ 上次抓取失敗，以下為 " + esc(g.retrieved || "") + " 抓取之舊資料" : ""}</p>`);
  if (live.length) {
    lines.push(`      <ul class="code-list">`);
    for (const c of live) lines.push(codeLi(c, false));
    lines.push(`      </ul>`);
  } else {
    lines.push(`      <p class="empty-note">目前來源沒有可收錄的有效碼——寧缺勿假，抓到再上。可先從官方管道（版本直播・官方社群）留意新碼。</p>`);
  }
  if (dead.length) {
    lines.push(`      <details class="expired-details"><summary>已過期（${dead.length}，留檔參考）</summary>`);
    lines.push(`      <ul class="code-list">`);
    for (const c of dead) lines.push(codeLi(c, true));
    lines.push(`      </ul></details>`);
  }
  lines.push(`    </section>`);
  return lines.join("\n");
}

/* ---------- 主流程 ---------- */
async function main() {
  const jsonFile = path.join(__dirname, "..", "data", "codes.json");
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(jsonFile, "utf8")); } catch (_) {}
  const prevByKey = new Map((prev && prev.games ? prev.games : []).map((g) => [g.key, g]));

  const results = [];
  for (const game of GAMES) {
    try {
      const html = await fetchHtml(game.sourceUrl);
      const parsed = game.type === "pocketgamer" ? parsePocketgamer(html, game)
        : game.type === "oneesports" ? await fetchOneesports(game, html)
        : parseFollowchain(html, game);
      results.push({
        key: game.key, name: game.name, zh: game.zh,
        redeemUrl: game.redeemUrl, ...(game.redeemNote ? { redeemNote: game.redeemNote } : {}),
        sourceName: game.sourceName, sourceUrl: game.sourceUrl,
        ...(parsed.sourceUpdated ? { sourceUpdated: parsed.sourceUpdated } : {}),
        ...(parsed.note ? { note: parsed.note } : {}),
        retrieved: new Date().toISOString().slice(0, 10),
        codes: parsed.codes,
      });
      console.log(`  ✓ ${game.key}: ${parsed.codes.filter((c) => c.status !== "expired").length} 收錄 / ${parsed.codes.filter((c) => c.status === "expired").length} 過期`);
    } catch (e) {
      /* fail-soft：單一來源失敗 → 保留上次資料並標 stale */
      console.error(`  ✗ ${game.key}: 來源抓取失敗（${e.message}），保留舊資料`);
      const old = prevByKey.get(game.key);
      if (old) results.push({ ...old, stale: true });
      else results.push({
        key: game.key, name: game.name, zh: game.zh,
        redeemUrl: game.redeemUrl, ...(game.redeemNote ? { redeemNote: game.redeemNote } : {}),
        sourceName: game.sourceName, sourceUrl: game.sourceUrl,
        retrieved: "", codes: [], note: "來源待接（首次抓取失敗）",
      });
    }
  }

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");
  const payload = { updated, games: results };
  fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 1));

  /* patch codes.html */
  const pageFile = path.join(__dirname, "..", "codes.html");
  let html2 = fs.readFileSync(pageFile, "utf8");
  const OPEN = "<!--CODES-START-->";
  const CLOSE = "<!--CODES-END-->";
  const oi = html2.indexOf(OPEN);
  const ci = html2.indexOf(CLOSE);
  if (oi < 0 || ci < 0) throw new Error("codes.html 找不到 CODES 標記");
  const block = `${OPEN}
${results.map(gameCard).join("\n")}
    ${CLOSE}`;
  html2 = html2.slice(0, oi) + block + html2.slice(ci + CLOSE.length);
  html2 = html2.replace(/(<div id="codes-root"[^>]*data-updated=")[^"]*"/, `$1${updated}"`);
  fs.writeFileSync(pageFile, html2);

  const totalLive = results.reduce((n, g) => n + g.codes.filter((c) => c.status !== "expired").length, 0);
  console.log(`OK ${updated} — ${results.length} 遊戲 — 收錄 ${totalLive} 碼 — data/codes.json + codes.html 已更新`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
