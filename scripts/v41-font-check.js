/* v4.1 字體 CDN 驗證：fonts.check + console/請求錯誤清零 */
const { chromium } = require('/tmp/pwtest/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const page of ['index.html', 'steam.html', 'tier-list.html']) {
    const errors = [];
    const p = await b.newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('requestfailed', r => { if (r.url().includes('jsdelivr')) errors.push('REQFAIL: ' + r.url()); });
    await p.goto('file:///home/node/.openclaw/workspace/game-radar/' + page, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const fonts = await p.evaluate(async () => {
      await document.fonts.ready;
      return {
        noto: document.fonts.check('16px "Noto Sans TC Web"'),
        chakra: document.fonts.check('16px "Chakra Petch Web"'),
        ox: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    out.push({ page, ...fonts, errors: errors.length ? errors : 'NONE' });
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
