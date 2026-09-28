// Mercari through its search page, drawn the way a reader's browser draws it.
// The page ships no listings in its HTML: they arrive from Mercari's own service
// as the page runs (2026-09-28: 395 KB of markup, no listing links, no JSON).
// robots.txt closes /mypage /purchase /sell /transaction /language /v1 /v2 —
// not /search. We read what the page shows and turn its pages with its own
// 次へ link. The browser keeps its own headless user agent and nothing about it
// is hidden. Photos are answered inside the browser with a blank 1×1 image, so
// the page still writes each photo's address into its card but nothing is
// fetched from Mercari's image host; fonts and video are not fetched either.
// If Mercari turns it away, this says so and stops.
//
// Needs `playwright` (the workflow installs it).

import { rulesFor, robotsAllows } from './lib.mjs';

export const BASE = 'https://jp.mercari.com';
const LINKS = 'a[href*="/item/m"], a[href*="/shops/product/"]';
const NONE = /出品された商品がありません|見つかりませんでした|該当する商品(?:は|が)ありません|検索結果がありません/;
const ID = /\/item\/(m\d{6,})|\/shops\/product\/([A-Za-z0-9]{16,32})/;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export const searchUrl = (q, i) => BASE + '/search?keyword=' + encodeURIComponent(q) + '&status=on_sale' + (i ? '&page_token=v1%3A' + i : '');
export const idOfHref = (href) => { const m = ID.exec(href || ''); return m ? m[1] || m[2] : null; };

// one card as the page showed it → a listing (exported for the tests)
export function cardOf(c) {
  const id = idOfHref(c.href); if (!id) return null;
  const title = String(c.name || '').replace(/\s+/g, ' ').trim() ||
                String(c.alt || '').replace(/のサムネイル$/, '').replace(/\s+/g, ' ').trim();
  const pm = /(\d[\d,]*)/.exec(String(c.price || '').replace(/[¥￥\s]/g, '')) || /[¥￥]\s*(\d[\d,]*)/.exec(c.text || '');
  const price = pm ? Number(pm[1].replace(/,/g, '')) : null;
  if (!title || !(price > 0)) return null;
  const url = /^m\d+$/.test(id) ? BASE + '/item/' + id : BASE + '/shops/product/' + id;
  const sold = /\bSOLD\b|売り切れ/.test(c.text || '');
  return { id: 'mercari:' + id, url, title, price, cur: 'JPY',
           ...(c.img && /^https:\/\//.test(c.img) ? { img: c.img } : {}), ...(sold ? { sold: true } : {}) };
}

export async function collectMercari(queries, log = () => {}, { maxPages = 10, gapMs = 4000 } = {}) {
  const rules = await rulesFor(BASE);
  if (!robotsAllows(rules, '/search?keyword=x&status=on_sale'))
    return { skipped: rules[0] && rules[0].why ? 'jp.mercari.com: ' + rules[0].why : 'robots.txt no longer allows /search', items: [] };
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return { skipped: 'playwright is not installed', items: [] }; }
  // CCP_BROWSER_CHANNEL=chrome runs an installed Chrome instead of Playwright's own (a check on a PC)
  const browser = await chromium.launch(process.env.CCP_BROWSER_CHANNEL ? { channel: process.env.CCP_BROWSER_CHANNEL } : {});
  const all = new Map(), linked = new Set(), pagesRead = [];
  let complete = true, diag = null;
  try {
    // the browser's own, unaltered user agent; a tall window, so a photo's card is on screen long enough to get its address
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
    await ctx.route('**/*', (r) => {
      const t = r.request().resourceType();
      if (t === 'image') return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
      return t === 'media' || t === 'font' ? r.abort() : r.continue();
    });
    const page = await ctx.newPage();
    for (const q of queries) {
      let ranOut = false;
      for (let i = 0; i < maxPages; i++) {
        const url = searchUrl(q, i), u = new URL(url);
        if (!robotsAllows(rules, u.pathname + u.search)) break;
        if (pagesRead.length) await page.waitForTimeout(gapMs);
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const status = res ? res.status() : 0;
        if (status === 403 || status === 429) {
          if (!all.size) return { refused: 'HTTP ' + status + ' from jp.mercari.com', items: [] };
          complete = false; break;
        }
        // wherever the page ended up has to be open to us as well
        const landed = new URL(page.url());
        if (landed.host !== u.host || !robotsAllows(await rulesFor(landed.origin), landed.pathname + landed.search)) {
          if (!all.size) return { refused: 'redirected to ' + landed.host + landed.pathname, items: [] };
          complete = false; break;
        }
        await page.waitForSelector(LINKS, { timeout: 30000 }).catch(() => null);
        // the grid is drawn as it scrolls: read it at every step, a screen at a time,
        // until the end of the page has shown nothing new four times running
        const seen = new Map(); let still = 0;
        for (let s = 0; s < 80 && still < 4; s++) {
          const batch = await page.$$eval(LINKS, (as) => as.map((a) => {
            const name = a.querySelector('[data-testid="thumbnail-item-name"]');
            const price = a.querySelector('[data-testid="item-tile-price"]');
            const img = a.querySelector('img');
            return { href: a.getAttribute('href') || '', name: name ? name.textContent : '', price: price ? price.textContent : '',
                     alt: img ? img.getAttribute('alt') || '' : '', img: img ? img.getAttribute('src') || '' : '',
                     text: (a.innerText || '').slice(0, 400) };
          }));
          const before = seen.size;
          for (const c of batch) { const had = seen.get(c.href); if (!had) seen.set(c.href, c); else if (!had.img && c.img) had.img = c.img; }
          const atEnd = await page.evaluate(() => window.innerHeight + window.scrollY >= document.body.scrollHeight - 80);
          still = seen.size === before && atEnd ? still + 1 : 0;
          await page.mouse.wheel(0, 1200);
          await page.waitForTimeout(800);
        }
        const next = await page.$$eval('a[href*="page_token"]', (as) => as.some((a) => /次へ|next/i.test((a.innerText || '') + ' ' + (a.getAttribute('aria-label') || ''))));
        const none = await page.evaluate((src) => new RegExp(src).test(document.body.innerText || ''), NONE.source);
        let found = 0, fresh = 0;
        for (const c of seen.values()) {
          const id = idOfHref(c.href); if (id) linked.add('mercari:' + id);
          const it = cardOf(c); if (!it) continue;
          found++;
          if (!all.has(it.id)) { all.set(it.id, it); fresh++; }
        }
        pagesRead.push({ q, page: i + 1, cards: seen.size, found, fresh, next });
        log('mercari_jp "' + q + '" p' + (i + 1) + ': ' + seen.size + ' cards, ' + found + ' read, ' + fresh + ' new' + (next ? '' : ', last page'));
        if (!seen.size) {
          ranOut = none;
          // the page's shape, never its words
          if (!diag) diag = await page.evaluate(() => ({ title: document.title, bytes: document.documentElement.outerHTML.length,
            anchors: document.querySelectorAll('a').length, text: (document.body.innerText || '').length }));
          break;
        }
        if (!fresh) break;                                      // the same page again: not an end
        if (!next) { ranOut = true; break; }                    // no 次へ: the last page
      }
      if (!ranOut) complete = false;
    }
    // every page before the last holds the same number of cards; one that came up
    // short was not read to its end, and its missing cards must not count as gone
    const full = pagesRead.filter((p) => p.next).map((p) => p.cards);
    if (full.length && Math.min(...full) < 0.85 * Math.max(...full)) complete = false;
  } finally { await browser.close(); }
  return { items: [...all.values()], pagesRead, complete, linked: [...linked], ...(diag ? { diag } : {}) };
}
