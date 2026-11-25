"use strict";

/* 遊戲前哨站 v4 — 首頁狀態列 + 側欄兌換碼即時刷新 + 靜態清單缺失時的備援渲染 */

const escHtml = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function setStatus(updated, count) {
  const status = document.getElementById("data-status");
  if (!status) return;
  status.innerHTML =
    `<span>最近更新：<strong>${escHtml(updated)}</strong></span>` +
    `<span>收錄 <strong>${count}</strong> 款最新遊戲</span>` +
    `<span>來源：Apple 官方 iTunes RSS</span>`;
}

function rowHtml(g) {
  const free = /^(取得|免費|Free)/i.test(g.price || "");
  return `<tr>
  <td class="art">${g.icon ? `<img class="ico" src="${escHtml(g.icon)}" alt="" loading="lazy">` : ""}</td>
  <td class="title"><a href="${escHtml(g.url)}" target="_blank" rel="noopener"><b>${escHtml(g.name)}</b><span>${escHtml(g.artist) || "獨立開發"}</span></a></td>
  <td class="num"><b class="${free ? "free" : ""}">${escHtml(g.price || "免費")}</b></td>
</tr>`;
}

function mountRows(grid, games) {
  const tb = grid.querySelector("tbody");
  if (tb) tb.innerHTML = games.map(rowHtml).join("");
}

(async () => {
  const grid = document.getElementById("game-grid");
  const note = document.getElementById("game-note");
  const countEl = document.getElementById("app-count");

  if (grid && grid.dataset.updated) {
    setStatus(grid.dataset.updated, grid.dataset.count || "0");
    const shown = grid.querySelectorAll("tbody tr").length;
    if (note) note.textContent = `顯示最新 ${shown} 款（按上架時間新到舊）。清單為官方資料自動收錄，非編輯推薦。`;
    if (countEl) countEl.textContent = grid.dataset.count || shown;
  } else if (grid) {
    /* 備援：靜態內容缺失時才動態抓 JSON */
    try {
      const res = await fetch("data/games.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      mountRows(grid, data.games.slice(0, 24));
      setStatus(data.updated, data.count);
      if (note) note.textContent = `顯示最新 ${Math.min(24, data.games.length)} 款（共收錄 ${data.count} 款，按上架時間新到舊）。`;
    } catch (e) {
      const status = document.getElementById("data-status");
      if (status) status.textContent = "資料載入失敗（" + (e.message || e) + "）——請稍後再試。";
    }
  }

  /* 側欄兌換碼：用 data/codes.json 刷新（靜態快取僅無 JS 時用） */
  const side = document.getElementById("side-codes");
  if (side) {
    try {
      const res = await fetch("data/codes.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const lis = [];
      for (const gm of (data.games || []).slice(0, 5)) {
        const c = (gm.codes || []).find((x) => x.status !== "expired");
        if (!c) continue;
        const gmName = escHtml(gm.zh || gm.name || "");
        const page = "codes/" + (gm.key || "") + ".html";
        lis.push(`<li><span class="dot ${c.status === "active" ? "ok" : "warn"}"></span><div><b>${gm.key ? `<a href="${escHtml(page)}">${gmName}</a>` : gmName}</b><code>${escHtml(c.code)}</code></div></li>`);
        if (lis.length >= 5) break;
      }
      if (lis.length) side.innerHTML = lis.join("");
    } catch (e) { /* 保留靜態快取 */ }
  }
})();
