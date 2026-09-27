// Grailed through the page its robots.txt leaves open: /designers/carol-christian-poell
// (robots.txt closes /search and /sold, not /designers). The listings on that
// page arrive through Grailed's own search service, as they would for anyone
// reading it; we read what the page shows and scroll the way a reader does.
// No automation flag is hidden and no identity is faked — the browser keeps
// its own headless user agent. If Grailed turns it away, this says so and stops.
//
// Needs `playwright` (the workflow installs it).

import { rulesFor, robotsAllows } from './lib.mjs';

export const PATH = '/designers/carol-christian-poell';
const AGE = /\bago\b|^(?:\d+|an?)\s+(?:second|minute|hour|day|week|month|year)s?\b|^(?:new|free shipping|sold|price drop|reduced|offer|staff pick|like)$/i;
// shoe sizes are one digit as often as two (9, 10.5): this label is mostly boots
const SIZE = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|OS|One Size|\d{1,2}(?:\.5)?|\d{1,2}(?:\.5)?\s?\/\s?\d{2}|[A-Z]{1,4}\s?\/\s?\d{2}|US\s?\d{1,2}(?:\.5)?|EU\s?\d{2}|IT\s?\d{2}|UK\s?\d{1,2}(?:\.5)?)$/i;
// the designer line: the brand alone, or the brand with a collaborator
const DESIGNER = /^carol\s*christian\s*poell(?:\s*[×x&+]\s*.+)?$/i;

// one card's text lines → a listing (exported for the tests)
export function cardOf(id, lines, img) {
  lines = lines.filter((l) => !AGE.test(l));
  const priceLine = lines.find((l) => /^\$\s?[\d,]+/.test(l));
  const price = priceLine ? Number(priceLine.replace(/^\$\s?([\d,]+(?:\.\d{2})?).*$/, '$1').replace(/,/g, '')) : null;
  const size = lines.find((l) => SIZE.test(l));
  const rest = lines.filter((l) => l !== priceLine && l !== size && !/^\$/.test(l) && l.length > 3);
  const title = rest.filter((l) => !DESIGNER.test(l)).sort((a, b) => b.length - a.length)[0];
  if (!title || !(price > 0)) return null;
  return { id: 'grailed:' + id, url: 'https://www.grailed.com/listings/' + id, title, price, cur: 'USD', img: img || null,
           ...(size ? { size } : {}) };
}

export async function collectGrailed(log = () => {}, { maxScrolls = 260 } = {}) {
  const rules = await rulesFor('https://www.grailed.com');
  if (!robotsAllows(rules, PATH))
    return { skipped: rules[0] && rules[0].why ? 'grailed.com: ' + rules[0].why : 'robots.txt no longer allows ' + PATH, items: [] };
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return { skipped: 'playwright is not installed', items: [] }; }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();   // the browser's own, unaltered user agent
    const res = await page.goto('https://www.grailed.com' + PATH, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (res && (res.status() === 403 || res.status() === 429)) return { refused: 'HTTP ' + res.status() + ' from grailed.com', items: [] };
    // wherever the page ended up after redirects has to be open to us as well
    const landed = new URL(page.url());
    const rules2 = await rulesFor(landed.origin);
    if (!robotsAllows(rules2, landed.pathname + landed.search)) return { refused: 'redirected to ' + landed.host + landed.pathname + ', which robots.txt closes', items: [] };
    await page.waitForSelector('a[href*="/listings/"]', { timeout: 45000 }).catch(() => null);
    const seen = new Map(); let still = 0, s = 0;
    for (; s < maxScrolls && still < 5; s++) {
      const batch = await page.$$eval('a[href*="/listings/"]', (as) => as.map((a) => {
        const m = /\/listings\/(\d+)/.exec(a.getAttribute('href') || '');
        const img = a.querySelector('img');
        return m && { id: m[1], text: (a.innerText || '').trim(), img: img && (img.currentSrc || img.src) };
      }).filter(Boolean));
      let fresh = 0;
      for (const b of batch) {
        const cur = seen.get(b.id) || { id: b.id, lines: [], img: null };
        for (const l of b.text.split('\n').map((x) => x.trim()).filter(Boolean)) if (!cur.lines.includes(l)) cur.lines.push(l);
        if (!cur.img && b.img && /^https?:/.test(b.img)) cur.img = b.img;
        if (!seen.has(b.id)) fresh++;
        seen.set(b.id, cur);
      }
      still = fresh ? 0 : still + 1;
      if (s % 20 === 0) log('grailed scroll ' + s + ': ' + seen.size);
      await page.mouse.wheel(0, 2400);
      await page.waitForTimeout(1400);
    }
    const items = [];
    for (const v of seen.values()) { const it = cardOf(v.id, v.lines, v.img); if (it) items.push(it); }
    // complete only when the page's own count says we have (nearly) all of it: a
    // feed that stops loading looks exactly like a feed that has ended
    const total = await page.evaluate(() => { const m = /([\d,]+)\s*(?:listings|results|items)\b/i.exec(document.body.innerText || ''); return m ? Number(m[1].replace(/,/g, '')) : null; });
    return { items, cards: seen.size, scrolls: s, total, complete: still >= 5 && total > 0 && seen.size >= 0.95 * total };
  } finally { await browser.close(); }
}
