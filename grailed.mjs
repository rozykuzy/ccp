// Grailed through its own search service (ROK 2026-09-29: "Grailed는 HL처럼 검색 백엔드로 읽어줘").
//
// Grailed's pages turn a headless browser away (HTTP 403, 2026-09-28), and the listings
// on a designer page are not in its HTML: the reader's browser asks Grailed's search
// service (Algolia, application MNRWEFSS2Q) for them with the public search-only key
// that grailed.com hands every visitor. This asks the same service the same question —
// the listings whose designer is Carol Christian Poell — the way the Helmut Lang index
// has read Grailed every morning since 2026-09-15.
//
// Through lib.get, like every other source: the search host's robots.txt is read first
// (it answers 404: no rules), one honest User-Agent, 2.5 s between requests, and a 403
// or 429 stops it for the day. Nothing about the seller is kept.
//
// A search answers at most 1,000 hits, so the stock is read in price bands, each split
// in two until it fits. Complete = every band came back whole.

import { get } from './lib.mjs';

export const APP = 'MNRWEFSS2Q';
export const KEY = 'c89dbaddf15fe70e1941a109bf7c2a3d';     // the public search-only key grailed.com serves to every reader
export const INDEX = 'Listing_by_date_added_production';
export const DESIGNER = 'Carol Christian Poell';
const HOST = 'https://' + APP.toLowerCase() + '-dsn.algolia.net';
const EDGES = [0, 100, 200, 300, 400, 500, 650, 800, 1000, 1250, 1500, 2000, 3000, 5000, 10000];

// what Grailed filed it under, in words classify.mjs reads (the title comes first there;
// this is used only when the title does not say what the thing is)
export function catOf(path) {
  const p = String(path || '').toLowerCase();
  if (/jewel/.test(p)) return 'ring';
  if (/bags|luggage/.test(p)) return 'bag';
  if (/footwear/.test(p)) return 'shoes';
  if (/outerwear/.test(p)) return 'jacket';
  if (/tailoring|suits|blazers/.test(p)) return 'suit';
  if (/dresses/.test(p)) return 'dress';
  if (/skirts/.test(p)) return 'skirt';
  if (/bottoms/.test(p)) return /denim|jeans/.test(p) ? 'jeans' : 'pants';
  if (/button_ups/.test(p)) return 'button up shirt';
  if (/tops/.test(p)) return 't-shirt';
  if (/accessories/.test(p)) return 'belt';
  return '';
}
const COND_NEW = new Set(['is_new']);

// one search hit → a listing (exported for the tests)
export function hitOf(h) {
  if (!h || h.sold || h.deleted || !h.id || !h.title || !(h.price_i > 0)) return null;
  const img = h.cover_photo && (h.cover_photo.url || h.cover_photo.image_url);
  const cat = catOf(h.category_path);
  const size = h.size != null && String(h.size).trim() && !/^one\s*size$/i.test(String(h.size).trim()) ? String(h.size).trim().toUpperCase() : '';
  return { id: 'grailed:' + h.id, url: 'https://www.grailed.com/listings/' + h.id, title: String(h.title).replace(/\s+/g, ' ').trim(),
           price: h.price_i, cur: 'USD', img: /^https?:\/\//.test(img || '') ? img : null, brandTagged: true,
           ...(cat ? { cat } : {}), ...(size ? { size } : {}), ...(COND_NEW.has(h.condition) ? { cond: 'new' } : {}) };
}

async function search(lo, hi) {
  const q = new URLSearchParams({ query: '', hitsPerPage: '1000', page: '0',
    facetFilters: JSON.stringify([['designers.name:' + DESIGNER]]),
    numericFilters: JSON.stringify(['price_i>=' + lo].concat(hi != null ? ['price_i<' + hi] : [])) });
  return get(HOST + '/1/indexes/' + INDEX + '?' + q, { type: 'json', headers: { 'x-algolia-application-id': APP, 'x-algolia-api-key': KEY } });
}

// ask(lo, hi) is the search itself; the tests hand in a stock of their own
export async function collectGrailed(log = () => {}, ask = search) {
  const seen = new Map(); let complete = true, calls = 0, total = 0;
  async function band(lo, hi, depth) {
    const r = await ask(lo, hi); calls++;
    const n = r.nbHits || 0;
    if (n > (r.hits || []).length) {
      // more than one answer holds: halve the band (an open top band doubles first)
      if (depth < 10) {
        const mid = hi == null ? lo * 2 + 1 : Math.floor((lo + hi) / 2);
        if (mid > lo) { await band(lo, mid, depth + 1); await band(mid, hi, depth + 1); return; }
      }
      complete = false;                           // a single price holding more than 1,000: read what came
    }
    total += n;
    for (const h of r.hits || []) seen.set(String(h.id), h);
  }
  for (let i = 0; i < EDGES.length - 1; i++) await band(EDGES[i], EDGES[i + 1], 0);
  await band(EDGES[EDGES.length - 1], null, 0);
  const items = [];
  for (const h of seen.values()) { const it = hitOf(h); if (it) items.push(it); }
  log('grailed: ' + items.length + ' listings from ' + seen.size + ' hits (' + total + ' counted, ' + calls + ' searches)');
  return { items, cards: seen.size, total, calls, complete: complete && seen.size >= total };
}
