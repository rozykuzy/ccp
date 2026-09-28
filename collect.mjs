// Runs every collector and writes one file per source under data/raw/.
//
//   node collect.mjs                       all sources
//   node collect.mjs yahoo_closed ff_brand just these
//
// One source failing never stops the others. A search page whose first page
// yields nothing is a failure, not "no listings today" — that is what a
// redesign or a block looks like — and the shape of that page (never its text)
// is written to data/raw/_diag.json so the parser can be fixed from there.
// Exit code is non-zero only when every source failed.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, collect } from './sources.mjs';
import { collectEbay } from './ebay.mjs';
import { collectGrailed } from './grailed.mjs';
import { collectMercari } from './mercari.mjs';
import { discover, readProduct, isCCP, RECHECK, RECHECK_EVERY } from './fruitsfamily.mjs';
import { writeRaw, Refused, diagOf, today } from './lib.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const OUT = process.env.CCP_RAW || join(DATA, 'raw');
mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (f) => !only.size || only.has(f);
const log = (s) => console.log(new Date().toISOString().slice(11, 19) + ' ' + s);
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const summary = { startedAt: new Date().toISOString(), day: today(), sources: {} };
const diag = {};
const failed = (file, e) => {
  summary.sources[file] = { ok: false, refused: e instanceof Refused, error: String((e && e.message) || e).slice(0, 300) };
  log(file + ' FAILED: ' + summary.sources[file].error);
};

// ── search pages ─────────────────────────────────────────────────────────
for (const src of SOURCES) {
  if (!want(src.file) || src.browser) continue;
  const t0 = Date.now();
  try {
    const r = await collect(src, log);
    if (!r.items.length) {
      diag[src.file] = diagOf(r.firstHtml, src.spec);
      throw new Error('first page yielded no listings — markup changed or the page is blocked (see _diag.json)');
    }
    const n = writeRaw(join(OUT, src.file + '.json'), src.name, src.market, r.items, { pages: r.pagesRead, complete: r.complete, linked: r.linked });
    summary.sources[src.file] = { ok: true, read: r.items.length, kept: n, complete: r.complete, pages: r.pagesRead.length,
                                  sec: Math.round((Date.now() - t0) / 1000) };
    // a first page that parsed, but thinly, is worth a look too
    if (r.pagesRead[0] && r.pagesRead[0].found < 5) diag[src.file] = diagOf(r.firstHtml, src.spec);
    log(src.file + ': ' + n + ' listings' + (r.complete ? '' : ' (reading cut short)'));
  } catch (e) { failed(src.file, e); }
}

// ── 메루카리: the search page as a browser draws it ────────────────────────
if (want('mercari_jp')) {
  const src = SOURCES.find((s) => s.file === 'mercari_jp');
  const t0 = Date.now();
  try {
    const r = await collectMercari(src.queries, log);
    if (r.skipped || r.refused) summary.sources.mercari_jp = { ok: false, ...(r.skipped ? { skipped: r.skipped } : { refused: true, error: r.refused }) };
    else if (!r.items.length) {
      diag.mercari_jp = { browser: true, ...(r.diag || {}), pages: r.pagesRead };
      throw new Error('first page yielded no listings — markup changed or the page is blocked (see _diag.json)');
    } else {
      const n = writeRaw(join(OUT, 'mercari_jp.json'), src.name, src.market, r.items, { pages: r.pagesRead, complete: r.complete, linked: r.linked });
      summary.sources.mercari_jp = { ok: true, read: r.items.length, kept: n, complete: r.complete, pages: r.pagesRead.length,
                                     sec: Math.round((Date.now() - t0) / 1000) };
      log('mercari_jp: ' + n + ' listings' + (r.complete ? '' : ' (reading cut short)'));
    }
  } catch (e) { failed('mercari_jp', e); }
}

// ── 후루츠패밀리: what is new, from its own sitemap ───────────────────────
// what the last build knew: the ledger, and the state it keeps (build.mjs writes both)
const ledger = readJson(join(DATA, 'ledger.json'), { items: {}, state: {} });
const state = ledger.state || {};
if (want('ff_new')) {
  const t0 = Date.now();
  try {
    // first run: the last two days. After that: back to what the last run saw, less an hour
    const since = state.ffSince ? new Date(Date.parse(state.ffSince) - 3600e3).toISOString()
                                : new Date(Date.now() - 48 * 3600e3).toISOString();
    const d = await discover({ since, log });
    const known = ledger.items || {};
    // already on the ledger: the recheck looks after those. Of the rest, at most 80 a day;
    // a day that had more does not move the watermark, so tomorrow picks up the remainder
    // oldest first, so a day with more than 80 moves the watermark to the last one read
    // and the next day carries on from there
    const todo = d.candidates.filter((c) => !known['ff:' + c.id] && (!c.lastmod || c.lastmod >= since))
      .sort((a, b) => String(a.lastmod || '').localeCompare(String(b.lastmod || '')));
    const cut = todo.length > 80, batch = todo.slice(0, 80);
    const mark = cut ? batch[batch.length - 1].lastmod : d.newest;
    const items = []; let read = 0, notBrand = 0, gone = 0;
    for (const c of batch) {
      const p = await readProduct(c.id); read++;
      if (!p) { gone++; continue; }
      if (!isCCP(p.brand) && !isCCP(p.title)) { notBrand++; continue; }
      if (!p.forSale || !(p.price > 0) || !p.title) continue;
      items.push({ id: p.id, url: p.url, title: p.title, price: p.price, cur: p.cur || 'KRW', img: p.img,
                   ...(p.size ? { size: p.size } : {}), ...(isCCP(p.brand) ? { brandTagged: true } : {}),
                   ...(p.cond === 'new' ? { cond: 'new' } : {}) });
    }
    const n = writeRaw(join(OUT, 'ff_new.json'), '후루츠패밀리', '한국', items,
      { newest: mark, reached: d.reached, cut, pages: d.pagesRead.length, candidates: d.candidates.length, read, notBrand, gone });
    summary.sources.ff_new = { ok: true, kept: n, candidates: d.candidates.length, read, notBrand, pages: d.pagesRead.length,
      reached: d.reached, newest: d.newest, complete: false, sec: Math.round((Date.now() - t0) / 1000) };
    log('ff_new: ' + n + ' listings from ' + d.candidates.length + ' candidates');
  } catch (e) { failed('ff_new', e); }
}

// ── 후루츠패밀리: a second look at listings already on the ledger ──────────
if (want('ff_check')) {
  const t0 = Date.now();
  try {
    const seenToday = new Set((readJson(join(OUT, 'ff_brand.json'), { items: [] }).items || []).map((x) => x.id));
    const checked = state.ffChecked || {};
    const due = Object.values(ledger.items || {})
      .filter((it) => it.file && it.file.startsWith('ff_') && !it.gone && !it.ex && !seenToday.has(it.id))
      .filter((it) => { const c = checked[it.id] || it.first; return !c || (Date.parse(today()) - Date.parse(c)) / 864e5 >= RECHECK_EVERY; })
      .sort((a, b) => String(checked[a.id] || a.first).localeCompare(String(checked[b.id] || b.first)))
      .slice(0, RECHECK);
    const out = [];
    for (const it of due) {
      const id = it.id.replace(/^ff:/, '');
      const p = await readProduct(id);
      out.push(p ? { id: it.id, forSale: p.forSale, price: p.price, cur: p.cur, title: p.title, img: p.img } : { id: it.id, missing: true });
    }
    writeFileSync(join(OUT, 'ff_check.json'), JSON.stringify({ src: '후루츠패밀리', fetchedAt: new Date().toISOString(), n: out.length, items: out }, null, 1));
    // nothing due is not a reading: it asked nothing of anyone
    summary.sources.ff_check = { ok: true, checked: out.length, ...(out.length ? {} : { idle: true }), sec: Math.round((Date.now() - t0) / 1000) };
    log('ff_check: ' + out.length + ' listings looked at again');
  } catch (e) { failed('ff_check', e); }
}

// ── the two that need more than a page ───────────────────────────────────
if (want('grailed')) {
  const t0 = Date.now();
  try {
    const r = await collectGrailed(log);
    if (r.skipped || r.refused) summary.sources.grailed = { ok: false, ...(r.skipped ? { skipped: r.skipped } : { refused: true, error: r.refused }) };
    else {
      const n = writeRaw(join(OUT, 'grailed.json'), 'Grailed', '해외', r.items, { complete: r.complete, cards: r.cards, scrolls: r.scrolls });
      summary.sources.grailed = { ok: n > 0, kept: n, cards: r.cards, scrolls: r.scrolls, complete: r.complete, sec: Math.round((Date.now() - t0) / 1000) };
    }
  } catch (e) { failed('grailed', e); }
}
if (want('ebay')) {
  try {
    const r = await collectEbay(log);
    if (r.skipped) summary.sources.ebay = { ok: false, skipped: r.skipped };
    else { const n = writeRaw(join(OUT, 'ebay.json'), 'eBay', '해외', r.items, { calls: r.calls.length, complete: r.complete });
           summary.sources.ebay = { ok: n > 0, kept: n, calls: r.calls.length, complete: r.complete }; }
  } catch (e) { failed('ebay', e); }
}

summary.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, '_summary.json'), JSON.stringify(summary, null, 1));
writeFileSync(join(OUT, '_diag.json'), JSON.stringify({ at: summary.finishedAt, pages: diag }, null, 1));
const oks = Object.values(summary.sources).filter((s) => s.ok && !s.idle).length;
log('done: ' + oks + '/' + Object.keys(summary.sources).length + ' sources ok');
process.exit(oks || !Object.keys(summary.sources).length ? 0 : 1);
