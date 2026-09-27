// 후루츠패밀리 — the Korean market, through the two doors the site itself opens
// for machines (llms.txt: "the public web catalog is server-rendered").
//
//   1. its product sitemap, newest first, 500 addresses a page, each address
//      ending in the listing's own title: /product/{id}/{title-slug}. We read
//      pages until we reach what the last run already saw, keep the addresses
//      whose title names the brand (or a word only this brand uses), and read
//      those listings' own pages.
//   2. a listing's own page, which states in plain meta tags who made it
//      (product:brand), its price, and whether it is still for sale
//      (product:availability). A brand word in the title is not required: the
//      seller's own brand field decides.
//
// Listings we already know are looked at again a few at a time (RECHECK a
// day), because the brand page shows only 40 and the sitemap only what is new:
// without a second look a sold listing would stay on the index for ever.

import { get, decode } from './lib.mjs';

const BASE = 'https://fruitsfamily.com';
export const RECHECK = 40;           // listing pages re-read per day, oldest look first
export const RECHECK_EVERY = 3;      // days between two looks at one listing

// a title slug is the seller's title, lower-cased and hyphenated
// (not "carol" or "캐롤" alone: Carolina Herrera and 캐롤라인 are someone else)
export const SLUG_RE = /carol[-_ ]?chr|poel{1,2}(?![a-z])|캐롤[-_ ]?크리스|포엘|(?:^|[-_ ])ccp(?:[-_ ]|$)|キャロル[-_ ]?クリス|prosthetic|프로스테틱|object[-_]?dye|오브젝트[-_]?다이/i;

export function parseSitemap(xml) {
  const out = []; const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi; let m;
  while ((m = re.exec(String(xml || '')))) {
    const loc = decode(m[1]).trim();
    const p = /\/product\/([0-9a-z]{4,8})(?:\/([^?#]*))?/i.exec(loc); if (!p) continue;
    let slug = p[2] || ''; try { slug = decodeURIComponent(slug); } catch {}
    out.push({ id: p[1], url: BASE + '/product/' + p[1] + '/', slug, lastmod: m[2] ? m[2].trim() : null });
  }
  return out;
}

function meta(html, prop) {
  const a = new RegExp('<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["\']' + prop.replace(/[.:]/g, '\\$&') + '["\'][^>]*>', 'i').exec(html);
  if (!a) return null;
  const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(a[0]);
  return c ? decode(c[2] ?? c[3] ?? '').trim() : null;
}
// what a listing's own page says about it — nothing about who is selling it
export function productOf(html) {
  html = String(html || '');
  let title = meta(html, 'og:title') || ((/<title[^>]*>([^<]*)/i.exec(html) || [])[1] || '');
  title = decode(title).replace(/\s*[|｜\-–—]\s*(?:후루츠\s*패밀리|후루츠패밀리|fruits\s*family|fruitsfamily)\s*$/i, '').trim();
  const price = Number(String(meta(html, 'product:price:amount') || '').replace(/[^\d.]/g, ''));
  const avail = (meta(html, 'product:availability') || '').toLowerCase();
  const out = {
    title, price: price > 0 ? price : null, cur: meta(html, 'product:price:currency') || 'KRW',
    brand: meta(html, 'product:brand') || null, img: meta(html, 'og:image') || null,
    cond: (meta(html, 'product:condition') || '').toLowerCase() || null,
    // "in stock" is for sale; anything else the page says (out of stock, sold) is not
    forSale: avail ? /in\s*stock|instock|available/.test(avail) && !/out/.test(avail) : !/판매\s*완료/.test(html),
  };
  const sz = /사이즈\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{1,16})</.exec(html) || /사이즈\s*[:：]\s*([^<\s]{1,12})/.exec(html);
  if (sz) out.size = decode(sz[1]).trim();
  return out;
}
export const isCCP = (s) => /carol\s*christian\s*poell|캐롤\s*크리스[찬챤]\s*포엘/i.test(String(s || ''));

// 1 — what is new since `since` (an ISO time), newest first
export async function discover({ since, maxPages = 40, log = () => {}, fetchPage = get } = {}) {
  const hits = new Map(); const pagesRead = []; let newest = null, reached = false;
  for (let page = 1; page <= maxPages; page++) {
    const xml = await fetchPage(BASE + '/sitemap.product.xml?page=' + page);
    const entries = parseSitemap(xml);
    if (!entries.length) { reached = true; break; }
    let matched = 0, oldest = null;
    for (const e of entries) {
      if (e.lastmod && (!newest || e.lastmod > newest)) newest = e.lastmod;
      if (e.lastmod && (!oldest || e.lastmod < oldest)) oldest = e.lastmod;
      if (SLUG_RE.test(e.slug) && !hits.has(e.id)) { hits.set(e.id, e); matched++; }
    }
    pagesRead.push({ page, entries: entries.length, matched, oldest });
    log('ff sitemap p' + page + ': ' + entries.length + ' entries, ' + matched + ' matched, back to ' + oldest);
    if (since && oldest && oldest < since) { reached = true; break; }
  }
  return { candidates: [...hits.values()], pagesRead, newest, reached };
}

// 2 — a listing's own page; null when it is gone (404)
export async function readProduct(id, { fetchPage = get } = {}) {
  const html = await fetchPage(BASE + '/product/' + id + '/', { allow404: true });
  if (html == null) return null;
  return { id: 'ff:' + id, url: BASE + '/product/' + id + '/', ...productOf(html) };
}
