/* 兌換碼雷達：每遊戲一個 fetcher（Node 內建 fetch，無 npm 依賴）
   → ①data/codes.json ②codes.html hub 靜態區塊（<!--CODES-START-->/<!--CODES-END-->）
     ③七個分頁 /codes/<game>.html（<!--SUMMARY-<KEY>--> / <!--CODES-<KEY>--> / <!--EXPIRED-<KEY>-->）
   鐵律：只收真實存在的碼（來源頁面實際列出才收錄），每碼必附 sourceUrl；
         單一來源失敗 fail-soft（保留上次成功資料，標 stale 續跑其他遊戲）。
   渲染層（2026-11-25 起）：
     - liveness cross-check（Hum-Bao/hoyoverse-codes 每日清單：genshin/HSR/ZZZ）→ 該碼加 verified:"official"
     - data/rewards-zh.json 字典 → 獎勵轉自寫繁中格式「原石 ×60、冒險家的經驗 ×5」；
       字典沒涵蓋的 item 顯示「獎勵請於兌換時確認」＋該碼 sourceUrl 連結（可視需要從字典補詞）
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
    livenessUrl: "https://raw.githubusercontent.com/Hum-Bao/hoyoverse-codes/main/GENSHIN.txt",
    livenessName: "Hum-Bao/hoyoverse-codes",
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
    livenessUrl: "https://raw.githubusercontent.com/Hum-Bao/hoyoverse-codes/main/ZZZ.txt",
    livenessName: "Hum-Bao/hoyoverse-codes",
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
  {
    key: "ml", name: "Mobile Legends: Bang Bang", zh: "Mobile Legends: Bang Bang",
    redeemUrl: "https://m.mobilelegends.com/en/codexchange",
    redeemNote: "需遊戲內帳號 ID＋兌換驗證信（驗證碼 30 分鐘內有效）",
    sourceName: "Pocket Gamer（Mobile Legends codes）",
    sourceUrl: "https://www.pocketgamer.com/mobile-legends-bang-bang/redeem-codes/",
    type: "pocketgamer2",
    activeStatus: "unverified", /* 來源以「might currently be available」列示＋各碼設有兌換次數上限 → 誠實標未驗證 */
  },
  {
    key: "crk", name: "Cookie Run: Kingdom", zh: "薑餅人王國",
    redeemUrl: "https://game.devplay.com/coupon/ck/zh-Hant",
    redeemNote: "輸入 DevPlay 帳號（遊戲內設定→Info 可查）；每序號一帳號限用一次",
    sourceName: "Pocket Gamer（Cookie Run: Kingdom codes）",
    sourceUrl: "https://www.pocketgamer.com/cookie-run-kingdom/codes/",
    type: "pocketgamer2",
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
  [/Traveler's Guide/gi, "漫遊指南"], [/Refined Aether/gi, "精煉的以太"],
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

/* ---------- 獎勵字典（data/rewards-zh.json）----------
   把來源獎勵字串轉成自寫格式「原石 ×60、冒險家的經驗 ×5」：
   逐 item 查字典；查不到的 item → 整句掛「…＋其餘獎勵請於兌換時確認」（渲染層附 sourceUrl 連結）。
   設計為冪等：已是輸出格式的字串再跑一次結果不變（舊資料 fail-soft 重渲染用）。 */
const REWARD_DICT = (() => {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "rewards-zh.json"), "utf8")); } catch (_) {}
  const map = new Map(); /* en/zh 小寫鍵 → 繁中 */
  if (raw && Array.isArray(raw.items)) {
    for (const it of raw.items) {
      if (it && it.zh) {
        if (it.en) map.set(String(it.en).toLowerCase(), it.zh);
        map.set(String(it.zh).toLowerCase(), it.zh); /* 冪等：zh→zh */
      }
    }
  }
  return {
    map,
    passThrough: new Set((raw && raw.passThrough || []).map((s) => String(s).trim())),
    fallback: (raw && raw.fallback) || "獎勵請於兌換時確認",
    fallbackRest: (raw && raw.fallbackRest) || "其餘獎勵請於兌換時確認",
  };
})();

const dictLookup = (name) => {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return null;
  if (REWARD_DICT.map.has(k)) return REWARD_DICT.map.get(k);
  const noS = k.replace(/s$/, "");
  if (REWARD_DICT.map.has(noS)) return REWARD_DICT.map.get(noS);
  return null;
};

/* 解析單一 item 的「數量 + 名稱」；回傳 {qty, name}（qty 為字串，保留千分位） */
function splitQty(item) {
  let t = item.trim().replace(/^[-–—•]\s*/, "");
  let m;
  if ((m = t.match(/^[x×]\s*(\d[\d,]*)\s+(.+)$/i))) return { qty: m[1], name: m[2] }; /* "x100 星聲" */
  if ((m = t.match(/^(\d[\d,]*)\s*[x×]\s+(.+)$/i))) return { qty: m[1], name: m[2] };  /* "50x 星瓊" */
  if ((m = t.match(/^(.+?)\s*[x×]\s*(\d[\d,]*)$/i))) return { qty: m[2], name: m[1] }; /* "原石 ×60" */
  if ((m = t.match(/^(\d[\d,]*)k\s+(.+)$/i))) return { qty: m[1] + ",000", name: m[2] }; /* "20k Denny" */
  if ((m = t.match(/^(\d[\d,]*)\s+(.+)$/))) return { qty: m[1], name: m[2] };           /* "60 Primogems" */
  return { qty: "", name: t };
}

/* 整句獎勵 → { text, unresolved } */
function translateReward(raw) {
  let t = String(raw || "").replace(/[\u2018\u2019]/g, "'").trim();
  if (!t) return { text: REWARD_DICT.fallback, unresolved: true };
  if (REWARD_DICT.passThrough.has(t)) return { text: t, unresolved: false };

  /* 抽出所有括號註記（半形/全形；亞洲服限定、valid until… 等），逐項分類保留 */
  const notes = [];
  t = t.replace(/\(([^)]*)\)/g, (_, inner) => {
    const s = inner.trim();
    if (s) notes.push(/asia only/i.test(s) ? "亞洲服限定" : s);
    return " ";
  }).replace(/（([^）]*)）/g, (_, inner) => {
    const s = inner.trim();
    if (s) notes.push(s);
    return " ";
  }).replace(/\s{2,}/g, " ").trim();

  /* 切 item：半形逗號（後接空白）、全形逗號、頓號、英文 and、半/全形 +（＋ 為本層輸出的 fallback 接續符，切開才冪等） */
  const parts = t.split(/,\s+|，|、|\s+and\s+|\s+\+\s+|＋/i).map((s) => s.trim()).filter(Boolean);
  const known = [];
  let unknown = 0;
  for (const p of parts) {
    const { qty, name } = splitQty(p);
    const zh = dictLookup(name);
    if (zh) {
      known.push(qty ? `${zh} ×${qty}` : zh);
    } else {
      unknown++;
    }
  }
  const noteStr = notes.length ? "（" + notes.join("；") + "）" : "";
  if (known.length && !unknown) return { text: known.join("、") + noteStr, unresolved: false };
  if (known.length && unknown) return { text: known.join("、") + "＋" + REWARD_DICT.fallbackRest + noteStr, unresolved: true };
  return { text: REWARD_DICT.fallback + noteStr, unresolved: true };
}

/* ---------- liveness cross-check（官方渠道彙整清單，每日更新）---------- */
async function fetchLivenessSet(url) {
  try {
    const txt = await fetchHtml(url);
    const set = new Set(txt.split(/\r?\n/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{4,20}$/.test(s)));
    return set.size ? set : null;
  } catch (_) { return null; /* fail-soft：驗證清單抓不到 → 不掛徽章 */ }
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

/* ---------- Fetcher：Pocket Gamer 變體（「Active …」標題制；Mobile Legends / 薑餅人王國用）
   與常駐頁（genshin/zzz/wuwa）差異：
   ① 有效區標題是「Active …」而非「Newest / … working」→ 現有 parser 抓不到
   ② 過期區常不是 <li> 清單而是「code I code | code」流水文字 → 需解析分隔符
   ③ 更新日期被 <strong> 切碎（如「November 26</strong><strong>th, 2026」）→ 先 decode 再抓 */
function parsePocketgamerList(html, game) {
  const heads = headings(html);
  const plain = decode(html);
  /* 日期常被 <strong> 切碎（如「November 26</strong><strong>th, 2026」→ 解碼後變「26 th」），被切開的序數補回 */
  const dateM = plain.match(/Updated on ([A-Z][a-z]+ \d{1,2}\s*(?:st|nd|rd|th)?\s*,?\s*\d{0,4})/);
  const dateRaw = dateM
    ? dateM[1].replace(/\s+/g, " ").replace(/(\d)\s+(st|nd|rd|th)/i, "$1$2").replace(/\s*,\s*/, ", ").replace(/,\s*$/, "").trim()
    : "";
  const activeH = heads.find((h) => /\bactive\b|newest|working/i.test(h.text) && !/expired|not working/i.test(h.text));
  const expiredH = heads.find((h) => /expired|not working/i.test(h.text));
  if (!activeH && !expiredH) throw new Error("找不到 codes 分區標題");

  const active = activeH ? liEntries(segment(html, heads, activeH)) : [];
  let expired = expiredH ? liEntries(segment(html, heads, expiredH)) : [];
  /* 過期區無 <li> → 解析「 I 」「 | 」分隔的流水文字（與有效碼去重，最多留檔 MAX_EXPIRED）。
     段落後方常接文章配圖/嵌入腳本（非碼內容）→ 先在 <picture>/<img>/<script> 處截斷；
     導言與首碼會黏在同一 token → 用尾端比對救回 */
  if (expiredH && !expired.length) {
    let segHtml = segment(html, heads, expiredH).replace(/^<h[23][^>]*>[\s\S]*?<\/h[23]>/, "");
    const cut = segHtml.search(/<(?:picture|img|script|iframe)\b/i);
    if (cut > 0) segHtml = segHtml.slice(0, cut);
    const seg = decode(segHtml);
    const seen = new Set(active.map((e) => e.code.toUpperCase()));
    for (const tok of seg.split(/\s*[|｜]\s*|\s+I\s+/)) {
      /* 整 token 是碼，或結尾在非字母數字邊界後接一個碼（救回黏在導言後的首碼） */
      const m = tok.trim().match(/^[A-Za-z0-9]{4,20}$|[^A-Za-z0-9]([A-Za-z0-9]{4,20})$/);
      const code = m ? (m[1] || tok.trim()) : "";
      if (!code) continue;
      if (seen.has(code.toUpperCase())) continue;
      seen.add(code.toUpperCase());
      expired.push({ code, reward: "" });
      if (expired.length >= MAX_EXPIRED) break;
    }
  }

  const activeStatus = game.activeStatus || "active";
  const mk = (e, status) => ({
    code: e.code,
    reward: zhReward(e.reward),
    status,
    sourceUrl: game.sourceUrl,
  });
  return {
    codes: [
      ...active.slice(0, MAX_ACTIVE).map((e) => mk(e, activeStatus)),
      ...expired.slice(0, MAX_EXPIRED).map((e) => mk(e, "expired")),
    ],
    sourceUpdated: dateRaw,
    note: activeStatus === "unverified"
      ? "來源以「目前可能可用」列示，且部分碼設有總兌換次數上限（先搶先贏）；一律標「未驗證」，領取失敗即已過期或額滿"
      : "",
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

/* ---------- 渲染層：hub + 分頁 ---------- */
function statusBadge(s) {
  return s === "active" ? '<span class="st st-active">有效</span>'
    : s === "expired" ? '<span class="st st-expired">已過期</span>'
    : '<span class="st st-unverified">未驗證</span>';
}
const V_BADGE = '<span class="v-badge" title="此碼命中官方渠道每日更新彙整清單（Hum-Bao/hoyoverse-codes），仍以官方兌換結果為準"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>官方渠道驗證</span>';

function rewardHtml(c) {
  let t = esc(c.reward);
  if (c.rewardUnresolved) {
    const link = `<a class="reward-src" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">獎勵請於兌換時確認</a>`;
    t = t.replace("獎勵請於兌換時確認", link);
  }
  return t;
}
function codeLi(c, expiredStyle) {
  const st = expiredStyle ? "" : statusBadge(c.status);
  const v = (!expiredStyle && c.verified === "official") ? V_BADGE : "";
  const src = `<a class="src-mini" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener" title="本碼出處連結">來源</a>`;
  return `        <li class="code-item${expiredStyle ? " code-item-expired" : ""}">
          <span class="code-chip" data-code="${esc(c.code)}">${esc(c.code)}</span>
          <span class="reward">${rewardHtml(c)}</span>${src}${v}${st}
          <button type="button" class="copy-btn" data-copy="${esc(c.code)}">複製</button>
        </li>`;
}

/* 摘要數字（分頁 code-sum 卡 + hub 卡共用） */
function gameStats(g) {
  const codes = g.codes || [];
  const active = codes.filter((c) => c.status === "active").length;
  const unverified = codes.filter((c) => c.status === "unverified").length;
  const expired = codes.filter((c) => c.status === "expired").length;
  const verified = codes.filter((c) => c.verified === "official" && c.status !== "expired").length;
  return { active, unverified, expired, verified, live: active + unverified };
}

/* hub：每遊戲一張卡（top 3 預覽 + 連結分頁） */
function hubCard(g) {
  const s = gameStats(g);
  const title = g.zh === g.name ? g.zh : `${g.zh} ${g.name}`;
  const en = g.zh === g.name ? "" : ` <span class="hub-en">${esc(g.name)}</span>`;
  const parts = [];
  if (s.active) parts.push(s.active + " 有效");
  if (s.unverified) parts.push(s.unverified + " 未驗證");
  const live = g.codes.filter((c) => c.status !== "expired").slice(0, 3);
  const lines = [];
  lines.push(`    <section class="card game-hub-card" id="game-${esc(g.key)}">`);
  lines.push(`      <h2><a href="codes/${esc(g.key)}.html">${esc(g.zh)}${en}</a> <span class="spec-meta">${s.live ? `${s.live} 個收錄碼${parts.length ? "（" + parts.join("・") + "）" : ""}` : "目前無收錄碼"}</span></h2>`);
  const metaBits = [
    `最近更新 ${esc(g.retrieved || "—")}`,
    s.verified ? `官方渠道驗證 ${s.verified} 碼` : "",
    s.expired ? `過期留檔 ${s.expired} 碼` : "",
    g.stale ? `上次抓取失敗，以下為 ${esc(g.retrieved || "")} 舊資料` : "",
  ].filter(Boolean);
  lines.push(`      <p class="hub-meta">${metaBits.join(" · ")} · <a href="${esc(g.redeemUrl)}" target="_blank" rel="noopener">官方兌換入口 ↗</a>${g.redeemNote ? "（" + esc(g.redeemNote) + "）" : ""}</p>`);
  if (live.length) {
    lines.push(`      <ul class="code-list code-preview">`);
    for (const c of live) lines.push(codeLi(c, false));
    lines.push(`      </ul>`);
  } else {
    lines.push(`      <p class="empty-note">目前來源沒有可收錄的有效碼——寧缺勿假，抓到再上。教學與過期留檔仍在此遊戲分頁。</p>`);
  }
  lines.push(`      <p class="redeem-line"><a class="btn-ghost" href="codes/${esc(g.key)}.html">查看${esc(g.zh)}全部兌換碼與教學 →</a></p>`);
  lines.push(`    </section>`);
  return lines.join("\n");
}

/* 分頁：SUMMARY marker 內容（統計數字） */
function summaryBlock(g, updated) {
  const s = gameStats(g);
  const cells = [];
  if (s.active) cells.push(`<div class="sum-cell ok"><b>${s.active}</b><span>有效碼</span></div>`);
  if (s.unverified) cells.push(`<div class="sum-cell warn"><b>${s.unverified}</b><span>未驗證碼</span></div>`);
  if (s.verified) cells.push(`<div class="sum-cell ver"><b>${s.verified}</b><span>官方渠道驗證</span></div>`);
  cells.push(`<div class="sum-cell"><b>${s.expired}</b><span>過期碼留檔</span></div>`);
  return `      <div class="sum-grid">
${cells.map((c) => "        " + c).join("\n")}
      </div>
      <div class="sum-updated">本站最近更新：${esc(updated)}（每日自動抓取${g.stale ? "；本次來源失敗，顯示上次資料" : ""}）</div>`;
}

/* 分頁：CODES marker 內容（有效碼全表） */
function codesBlock(g) {
  const live = g.codes.filter((c) => c.status !== "expired");
  if (!live.length) {
    return `      <p class="empty-note">目前來源沒有可收錄的有效碼——寧缺勿假，抓到再上。可先從官方管道（版本直播・官方社群）留意新碼，本站抓到會立即更新此頁。</p>`;
  }
  const lines = [`      <ul class="code-list">`];
  for (const c of live) lines.push(codeLi(c, false));
  lines.push(`      </ul>`);
  return lines.join("\n");
}

/* 分頁：EXPIRED marker 內容（折疊留檔） */
function expiredBlock(g) {
  const dead = g.codes.filter((c) => c.status === "expired");
  if (!dead.length) return `      <p class="empty-note">目前沒有留檔的過期碼。</p>`;
  const lines = [`      <details class="expired-details"><summary>已過期（${dead.length}，留檔參考）</summary>`, `      <ul class="code-list">`];
  for (const c of dead) lines.push(codeLi(c, true));
  lines.push(`      </ul></details>`);
  return lines.join("\n");
}

/* patch 標記區塊（open/close 為完整註釋字串；重寫內容同時保留首尾標記，確保可重複執行） */
function patchBlock(html, open, close, content) {
  const oi = html.indexOf(open);
  const ci = html.indexOf(close, oi + open.length);
  if (oi < 0 || ci < 0) throw new Error("找不到標記 " + open);
  return html.slice(0, oi) + open + "\n" + content + "\n    " + close + html.slice(ci + close.length);
}

/* ---------- 主流程 ---------- */
async function main() {
  const jsonFile = path.join(__dirname, "..", "data", "codes.json");
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(jsonFile, "utf8")); } catch (_) {}
  const prevByKey = new Map((prev && prev.games ? prev.games : []).map((g) => [g.key, g]));

  const results = [];
  const livenessCache = new Map(); /* url → Set|null（同一次執行不重抓） */
  for (const game of GAMES) {
    try {
      const html = await fetchHtml(game.sourceUrl);
      const parsed = game.type === "pocketgamer" ? parsePocketgamer(html, game)
        : game.type === "pocketgamer2" ? parsePocketgamerList(html, game)
        : game.type === "oneesports" ? await fetchOneesports(game, html)
        : parseFollowchain(html, game);
      const result = {
        key: game.key, name: game.name, zh: game.zh,
        redeemUrl: game.redeemUrl, ...(game.redeemNote ? { redeemNote: game.redeemNote } : {}),
        sourceName: game.sourceName, sourceUrl: game.sourceUrl,
        ...(parsed.sourceUpdated ? { sourceUpdated: parsed.sourceUpdated } : {}),
        ...(parsed.note ? { note: parsed.note } : {}),
        retrieved: new Date().toISOString().slice(0, 10),
        codes: parsed.codes,
      };
      results.push(result);
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

  /* ---- 後處理 1：官方渠道 liveness cross-check → verified:"official" ---- */
  for (const game of GAMES) {
    if (!game.livenessUrl) continue;
    let set = livenessCache.get(game.livenessUrl);
    if (set === undefined) {
      set = await fetchLivenessSet(game.livenessUrl);
      livenessCache.set(game.livenessUrl, set);
    }
    const g = results.find((r) => r.key === game.key);
    if (!set || !g) { if (g && set === null) console.log(`  ~ ${game.key}: liveness 清單抓取失敗，不掛驗證徽章`); continue; }
    let hits = 0;
    for (const c of g.codes) {
      if (c.status !== "expired" && set.has(String(c.code).toUpperCase())) { c.verified = "official"; hits++; }
    }
    console.log(`  ✓ ${game.key}: liveness 命中 ${hits} / 清單 ${set.size} 碼`);
  }

  /* ---- 後處理 2：獎勵字典翻譯（冪等，新舊資料統一走這層） ---- */
  for (const g of results) {
    for (const c of g.codes) {
      const t = translateReward(c.reward);
      c.reward = t.text;
      if (t.unresolved) c.rewardUnresolved = true;
      else delete c.rewardUnresolved;
    }
  }

  const updated = new Date().toISOString().slice(0, 16).replace("T", " ");
  const payload = { updated, games: results };
  fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 1));

  /* ---- 渲染 1：codes.html hub（<!--CODES-START--> 全區重寫） ---- */
  const hubFile = path.join(__dirname, "..", "codes.html");
  let hub = fs.readFileSync(hubFile, "utf8");
  const HUB_OPEN = "<!--CODES-START-->";
  const HUB_CLOSE = "<!--CODES-END-->";
  const totalLive = results.reduce((n, g) => n + gameStats(g).live, 0);
  hub = patchBlock(hub, HUB_OPEN, HUB_CLOSE, results.map(hubCard).join("\n"));
  hub = hub.replace(/<div id="codes-root"[^>]*>/, `<div id="codes-root" data-updated="${updated}" data-total="${totalLive}">`);
  fs.writeFileSync(hubFile, hub);

  /* ---- 渲染 2：各分頁（各自 marker；單頁失敗 fail-soft 不炸其他頁） ---- */
  for (const game of GAMES) {
    const g = results.find((r) => r.key === game.key);
    if (!g) continue;
    const file = path.join(__dirname, "..", "codes", game.key + ".html");
    if (!fs.existsSync(file)) { console.error(`  ✗ ${game.key}: 分頁 ${file} 不存在，跳過`); continue; }
    try {
      let page = fs.readFileSync(file, "utf8");
      const KEY = game.key.toUpperCase();
      page = patchBlock(page, `<!--SUMMARY-${KEY}-START-->`, `<!--SUMMARY-${KEY}-END-->`, summaryBlock(g, updated));
      page = patchBlock(page, `<!--CODES-${KEY}-START-->`, `<!--CODES-${KEY}-END-->`, codesBlock(g));
      page = patchBlock(page, `<!--EXPIRED-${KEY}-START-->`, `<!--EXPIRED-${KEY}-END-->`, expiredBlock(g));
      page = page.replace(/<div id="codes-root"[^>]*>/, `<div id="codes-root" data-updated="${updated}">`);
      fs.writeFileSync(file, page);
      const s = gameStats(g);
      console.log(`  ✓ ${game.key}: 分頁已渲染（${s.live} 收錄 / ${s.verified} 驗證 / ${s.expired} 過期）`);
    } catch (e) {
      console.error(`  ✗ ${game.key}: 分頁渲染失敗（${e.message}），保留舊內容`);
    }
  }

  const totalVerified = results.reduce((n, g) => n + gameStats(g).verified, 0);
  console.log(`OK ${updated} — ${results.length} 遊戲 — 收錄 ${totalLive} 碼（官方渠道驗證 ${totalVerified}）— data/codes.json + codes.html + ${results.length} 分頁已更新`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
