// The day's build: raw listings → ledger → the site and the mail.
//
//   node build.mjs              reads data/raw/, writes data/ and site/
//
// data/ledger.json is the record of every listing this index has ever shown:
// when it was first and last seen, and every price the seller asked. It is
// only ever added to. A listing that leaves the market is marked, not deleted.
//
// Rules this file keeps:
//   · a source that failed today was not observed: none of its listings is
//     seen again, and none of them vanishes
//   · a listing vanishes only when its source was read to the end twice
//     without it (an auction whose end has passed: once), or when its own
//     page says it is sold or gone — never because a reading was cut short
//   · a price has moved only when the seller's own number moved; the won
//     figure moves with the exchange rate every day and says nothing
//   · a sale record is not a listing: it has no ledger entry, is never new
//     and never vanishes

import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, codeNum, NEW_RE } from './classify.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.CCP_DATA || join(ROOT, 'data');
const RAW = process.env.CCP_RAW || join(DATA, 'raw');
const SITE = process.env.CCP_SITE || join(ROOT, 'site');
export const SITE_URL = 'https://rozykuzy.github.io/ccp/';
// the mail's 전체 보기 opens the combined site on this archive (ROK 2026-09-28). The page is still
// built and published at SITE_URL — the combined site reads it from there
export const MAIL_URL = 'https://rozykuzy.github.io/?archive=ccp';
const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const TODAY = process.env.CCP_TODAY || kst();
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
// the ledger and the sale records: absent is a first run; present but unreadable
// is a stop — rewriting it from nothing would lose every first-seen date
function readRecord(f, empty) {
  if (!existsSync(f)) return empty;
  const txt = readFileSync(f, 'utf8');
  try { return JSON.parse(txt); } catch (e) { throw new Error(f + ' is unreadable (' + e.message + ') — not overwriting it'); }
}
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// how each collector's file is read
export const FILES = {
  // hold: the share of yesterday's listings a complete reading must find again
  // before anything it did not find is counted as missing (auctions end every day)
  yahoo_auctions: { kind: 'live', name: '야후옥션', m: '일본', how: '진행 중 경매', hold: 0.6 },
  yahoo_closed:   { kind: 'sold', name: '야후옥션', m: '일본', how: '180일 낙찰' },
  mercari_jp:     { kind: 'live', name: '메루카리', m: '일본' },
  rakuma:         { kind: 'live', name: '라쿠마', m: '일본' },
  yahoo_fleamarket: { kind: 'live', name: '야후 플리마', m: '일본' },
  secondstreet:   { kind: 'live', name: '세컨드스트리트', m: '일본', how: '온라인 스토어' },
  ff_brand:       { kind: 'live', name: '후루츠패밀리', m: '한국', how: '브랜드 페이지', brandPage: true, partial: true },
  ff_new:         { kind: 'live', name: '후루츠패밀리', m: '한국', how: '신규 등록', brandPage: false, partial: true },
  ff_check:       { kind: 'check', name: '후루츠패밀리', m: '한국' },
  grailed:        { kind: 'live', name: 'Grailed', m: '해외', how: '검색', brandPage: true },
  ebay:           { kind: 'live', name: 'eBay', m: '해외', how: '공식 API' },
};

// ── exchange rates ───────────────────────────────────────────────────────
// ECB reference rates (frankfurter), carried as the site carries them: won per
// dollar, pound, euro, and per 100 yen. Yesterday's rates when today's cannot
// be had — never made-up ones.
export async function fetchRates(prev) {
  if (process.env.CCP_OFFLINE && prev && prev.USD > 0) return { ...prev, stale: true };
  const tries = ['https://api.frankfurter.dev/v1/latest?base=EUR', 'https://api.frankfurter.app/latest?from=EUR'];
  for (const u of tries) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) continue;
      const j = await r.json(), x = j.rates || {};
      if (!(x.KRW > 0 && x.USD > 0 && x.GBP > 0 && x.JPY > 0)) continue;
      const more = {};
      for (const [c, v] of Object.entries(x)) if (v > 0 && !['KRW', 'USD', 'GBP', 'JPY'].includes(c)) more[c] = Math.round(x.KRW / v * 100) / 100;
      return { USD: Math.round(x.KRW / x.USD), GBP: Math.round(x.KRW / x.GBP), EUR: Math.round(x.KRW), JPY: Math.round(x.KRW / x.JPY * 100),
               more, date: j.date || TODAY, from: 'ECB' };
    } catch {}
  }
  if (prev && prev.USD > 0) return { ...prev, stale: true };
  throw new Error('no exchange rate today and none on record — not building with invented rates');
}
export function toKRW(price, cur, rates) {
  if (!(price > 0)) return null;
  if (!cur || cur === 'KRW') return Math.round(price);
  const r = rates[cur] || (rates.more && rates.more[cur]); if (!(r > 0)) return null;
  return Math.round(cur === 'JPY' ? price * r / 100 : price * r);
}

// ── the ledger ───────────────────────────────────────────────────────────
function observe(L, it, file, day, rates, stats) {
  const cfg = FILES[file];
  const k = toKRW(it.price, it.cur, rates);
  const cur = L.items[it.id];
  if (!cur && !k) return;                     // a price we cannot state in won is not shown
  if (!cur) {
    L.items[it.id] = {
      id: it.id, file, src: cfg.name, m: cfg.m, t: it.title, u: it.url, img: it.img || null, p: it.price, cur: it.cur || 'KRW', k,
      first: day, last: day, gone: null, miss: 0, h: [[day, k, it.price]],
      ...(it.size ? { z: it.size } : {}), ...(it.brandTagged ? { tagged: 1 } : {}), ...(it.cond === 'new' ? { cn: 'new' } : {}),
      ...(it.cat ? { cat: it.cat } : {}),
      ...(Number.isFinite(it.bids) ? { bids: it.bids } : {}), ...(it.endsAt ? { ends: it.endsAt, endsPrec: it.endsPrec || 'd' } : {}),
      ...(Array.isArray(it.im) && it.im.length ? { im: it.im.slice(0, 12) } : {}),
    };
    stats.added++; return;
  }
  // seen again. The seller's own number decides whether the price moved.
  if (cur.gone) { cur.gone = null; delete cur.ls; stats.back++; }
  cur.last = day; cur.miss = 0; cur.t = it.title || cur.t; cur.u = it.url || cur.u; if (k) cur.k = k;
  if (!(it.price > 0)) return;
  if (it.img) cur.img = it.img;
  if (it.size) cur.z = it.size;
  if (it.brandTagged) cur.tagged = 1;
  if (it.cat) cur.cat = it.cat;
  if (Number.isFinite(it.bids)) cur.bids = it.bids;
  if (it.endsAt) { cur.ends = it.endsAt; cur.endsPrec = it.endsPrec || 'd'; }
  const sameCur = (cur.cur || 'KRW') === (it.cur || 'KRW');
  if (!sameCur) { cur.cur = it.cur || 'KRW'; cur.p = it.price; cur.h = [[day, k || cur.k, it.price]]; stats.recur++; }
  else if (it.price !== cur.p) {
    const lastH = cur.h[cur.h.length - 1];
    // a day has one price: a second reading on the same day corrects that day's
    // figure (a re-run after a parser fix) and is compared with the day before
    if (lastH && lastH[0] === day) {
      lastH[1] = k || lastH[1]; lastH[2] = it.price; cur.p = it.price;
      if (cur.h.length === 1) cur.k = k || cur.k;
    } else { cur.h.push([day, k || cur.k, it.price]); if (it.price < cur.p) stats.drops++; else stats.rises++; cur.p = it.price; stats.changed++; }
  }
}

const PREC = { m: 6e4, h: 36e5, d: 864e5 };
// prevComplete: the day of each file's last complete reading before today
export function updateLedger(L, raw, summary, rates, day = TODAY, prevComplete = {}) {
  const stats = { added: 0, back: 0, changed: 0, drops: 0, rises: 0, recur: 0, vanished: 0, held: [] };
  const seenBy = {};
  for (const [file, cfg] of Object.entries(FILES)) {
    if (cfg.kind !== 'live') continue;
    const s = summary.sources[file]; if (!s || !s.ok || !raw[file]) continue;
    const seen = seenBy[file] = new Set();
    for (const it of raw[file].items) {
      // a search page also shows what has just sold: it is not for sale, and a
      // listing we had shown that now carries the badge has left the market
      if (it.sold) {
        const x = L.items[it.id];
        if (x && !x.gone) { x.gone = day; x.ls = x.last; stats.vanished++; }
        if (x) seen.add(it.id);
        continue;
      }
      const c = classify(it, { brandPage: !!cfg.brandPage });
      if (c.exclude) {
        // a listing already shown whose title now says it is not for sale (専用 …): hidden, kept
        if (L.items[it.id]) { L.items[it.id].ex = c.exclude; L.items[it.id].last = day; seen.add(it.id); }
        continue;
      }
      if (L.items[it.id] && L.items[it.id].ex) delete L.items[it.id].ex;
      observe(L, it, file, day, rates, stats); seen.add(it.id);
    }
    // linked from today's pages but not readable today (no price on the card): still
    // listed. Kept as seen, its last price unchanged — never brought back from gone.
    for (const id of raw[file].linked || []) {
      const x = L.items[id]; if (!x || x.gone || seen.has(id)) continue;
      x.last = day; x.miss = 0; seen.add(id); stats.unread = (stats.unread || 0) + 1;
    }
  }
  // who was not seen, where the reading went to the end
  for (const [file, seen] of Object.entries(seenBy)) {
    const cfg = FILES[file], s = summary.sources[file];
    if (cfg.partial || !s.complete) continue;
    const mine = Object.values(L.items).filter((x) => x.file === file && !x.gone && !x.ex);
    // a reading that found far fewer of yesterday's listings than were there is
    // held back from saying anything vanished: a half-loaded page looks like this
    // measured against what the last complete reading saw, not against listings
    // already missing before it — or a small source that lost two would hold for good
    const base = prevComplete[file];
    const old = base ? mine.filter((x) => x.first < day && x.last >= base) : [], seenOld = old.filter((x) => x.last === day).length;
    // a few gone is a market; a large share gone at once is a reading. It is held back
    // — its baseline kept — for up to three days, and after that taken as it is
    const held = (L.state.held || {})[file];
    const heldDays = held ? dayDiff(held, day) : 0;
    if (old.length - seenOld >= 5 && seenOld < (cfg.hold || 0.8) * old.length && heldDays < 3) {
      L.state.held = L.state.held || {}; if (!held) L.state.held[file] = day;
      stats.held.push(file); continue; }
    if (held) delete L.state.held[file];
    for (const x of mine) {
      if (x.last === day || x.missDay === day) continue;     // one miss a day, however many runs
      x.miss = (x.miss || 0) + 1; x.missDay = day;
      // an end time known only to the day or the hour may be that much early
      const ended = x.ends && Date.parse(x.ends) + (PREC[x.endsPrec] || PREC.d) < Date.now();
      if (x.miss >= 2 || ended) { x.gone = day; x.ls = x.last; stats.vanished++; }
    }
  }
  // 후루츠패밀리 listings looked at again on their own page
  const chk = summary.sources.ff_check && summary.sources.ff_check.ok ? raw.ff_check : null;
  if (chk) for (const r of chk.items) {
    const x = L.items[r.id]; if (!x) continue;
    L.state.ffChecked = L.state.ffChecked || {}; L.state.ffChecked[r.id] = day;
    if (r.missing || !r.forSale) { if (!x.gone) { x.gone = day; x.ls = x.last; stats.vanished++; } continue; }
    observe(L, { id: r.id, title: r.title || x.t, url: x.u, price: r.price || x.p, cur: r.cur || x.cur, img: r.img }, x.file, day, rates, stats);
  }
  return stats;
}

// which sources answered today, and since when each has been read to the end
export function markSeen(st, summary, stats, day = TODAY) {
  st.srcFirst = st.srcFirst || {}; st.seen = st.seen || {}; st.complete = st.complete || {}; st.lag = st.lag || {};
  for (const [f, s] of Object.entries(summary.sources)) {
    if (!s.ok || s.idle || !FILES[f]) continue;
    // a reading made ahead of the build (Grailed on the PC) is dated the day it was read
    st.seen[f] = s.via === 'pc' && /^\d{4}-\d{2}-\d{2}$/.test(s.seenDay || '') && s.seenDay < day ? s.seenDay : day;
    if (s.via === 'pc') st.lag[f] = Math.min(2, Math.max(0, dayDiff(st.seen[f], day))); else delete st.lag[f];
    // a held reading is not a baseline: the next day still compares with the one before it
    if ((FILES[f].partial || s.complete) && !(stats.held || []).includes(f)) { if (!st.srcFirst[f]) st.srcFirst[f] = day; st.complete[f] = day; }
  }
}

// ── sale records ─────────────────────────────────────────────────────────
export function updateSold(S, raw, summary, rates, day = TODAY) {
  let added = 0;
  for (const [file, cfg] of Object.entries(FILES)) {
    if (cfg.kind !== 'sold') continue;
    const s = summary.sources[file]; if (!s || !s.ok || !raw[file]) continue;
    for (const it of raw[file].items) {
      if (!it.soldAt || S.items[it.id]) continue;
      const c = classify(it); if (c.exclude) continue;
      const k = toKRW(it.price, it.cur, rates); if (!k) continue;
      S.items[it.id] = { id: it.id, file, src: cfg.name, t: it.title, u: it.url, img: it.img || null, p: it.price, cur: it.cur || 'JPY', k,
                         soldAt: it.soldAt, sk: it.soldKind || '낙찰', ...(Number.isFinite(it.bids) ? { bids: it.bids } : {}), first: day };
      added++;
    }
  }
  return added;
}

// ── the payload the page reads ───────────────────────────────────────────
const norm = (t) => { let s = String(t || ''); try { s = s.normalize('NFKC'); } catch {} return s.toLowerCase()
  .replace(/【[^】]*(?:中古|used|美品|送料)[^】]*】|\((?:中古|used)\)/g, ' ').replace(/[【】\[\]()（）|｜\/・,，.。!！?？★☆◆■♪「」"“”'’]/g, ' ')
  .replace(/\s+/g, ' ').trim(); };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2); };
export const yearOfEra = (e) => { let m = /^(?:SS|AW|FW)(\d{2})$/.exec(e || ''); if (m) return (+m[1] >= 90 ? 1900 : 2000) + +m[1];
  m = /^(\d{4})$/.exec(e || ''); return m ? +m[1] : null; };
const md = (d) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : ''; };

// the same model number, sold: a code on both, and the prefixes (when both
// have one) agreeing. Nothing looser — a price beside a different garment misleads.
function sameCode(a, b) {
  for (const x of a) for (const y of b) {
    if (codeNum(x) !== codeNum(y)) continue;
    const px = /^([A-Z]{1,2})\//.exec(x), py = /^([A-Z]{1,2})\//.exec(y);
    if (!px || !py || px[1] === py[1]) return true;
  }
  return false;
}

function payloadItem(x, c, rates, day) {
  // today's rate for today's figure: the struck-through price is at today's rate too
  const o = { t: x.t, k: toKRW(x.p, x.cur, rates) || x.k, r: x.src, l: x.u, i: x.img || null, s: c.section, f: x.first, c: c.tier };
  if (c.era) o.e = c.era;
  if (c.tier === 'B' && c.claim) { o.q = c.claim; o.qk = c.claimKind || 'arch'; }
  if (c.size) o.z = c.size;
  if (x.cur && x.cur !== 'KRW') { o.p = x.p; o.u = x.cur; }
  if (c.codes && c.codes.length) o.mc = c.codes[0];
  if (x.cn === 'new') o.cn = 'new';
  if (Array.isArray(x.im) && x.im.length) o.im = x.im;
  if (x.h && x.h.length >= 2) {
    o.h = x.h.map((pt) => [pt[0], pt[1], pt[2]]);
    // the last move, if it was down and recent, is shown struck through at today's rate
    const last = x.h[x.h.length - 1], prev = x.h[x.h.length - 2];
    if (last[2] < prev[2] && dayDiff(last[0], day) <= 14) { o.w = toKRW(prev[2], x.cur, rates); o.wd = last[0]; }
  }
  if (Number.isFinite(x.bids)) o.ab = x.bids;
  if (x.ends) { o.ae = x.ends; o.aeq = x.endsPrec || 'd'; }
  if (x.gone) { o.x = 1; o.ls = x.ls || x.last; }
  return o;
}

export function buildPayload(L, S, rates, summary, { day = TODAY, issue = 1, fresh = new Set() } = {}) {
  const live = [], goneRecent = [];
  for (const x of Object.values(L.items)) {
    if (x.ex) continue;
    const c = classify({ title: x.t, brandTagged: !!x.tagged, size: x.z, cat: x.cat }, { brandPage: FILES[x.file] ? !!FILES[x.file].brandPage : false });
    if (c.exclude) continue;
    const o = payloadItem(x, c, rates, day);
    if (fresh.has(x.id)) o.n = 1;
    o.__codes = c.codes || []; o.__id = x.id;
    (x.gone ? (dayDiff(x.gone, day) <= 60 ? goneRecent : null) : live)?.push(o);
  }
  // one listing on several platforms under one title: one card, every offer in it
  const byTitle = new Map(), out = [];
  for (const o of live) {
    const key = norm(o.t) + '|' + (o.z || '');
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(o);
  }
  let grouped = 0;
  for (const g of byTitle.values()) {
    // the shape of one listing cross-posted: one copy on each platform, asking
    // about the same. Two on one platform under one title are two garments
    // ("Prosthetic Boots" ×3 on Mercari), and so is a price twice another's.
    const srcs = new Set(g.map((o) => o.r)), ks = g.map((o) => o.k);
    if (g.length < 2 || srcs.size !== g.length || Math.max(...ks) > 1.25 * Math.min(...ks)) { out.push(...g); continue; }
    g.sort((a, b) => a.k - b.k);
    const head = { ...g[0], g: g.length, __ids: g.map((o) => o.__id),
      v: g.map((o) => ({ k: o.k, r: o.r, l: o.l, i: o.i, ...(o.z ? { z: o.z } : {}), ...(o.p ? { p: o.p, u: o.u } : {}) })) };
    if (g.some((o) => o.n)) head.n = 1;
    head.f = g.map((o) => o.f).sort()[0];
    out.push(head); grouped++;
  }
  // sale records, and the same model number's record beside a live listing
  const sold = [];
  for (const r of Object.values(S.items)) {
    if (dayDiff(r.soldAt, day) > 365) continue;
    const c = classify({ title: r.t }); if (c.exclude) continue;
    const o = { t: r.t, k: r.k, r: r.src, l: r.u, i: r.img || null, s: c.section, f: r.first, c: c.tier, so: r.soldAt, sk: r.sk || '낙찰' };
    if (c.era) o.e = c.era;
    if (c.tier === 'B' && c.claim) { o.q = c.claim; o.qk = c.claimKind || 'arch'; }
    if (c.size) o.z = c.size;
    if (r.cur && r.cur !== 'KRW') { o.p = r.p; o.u = r.cur; }
    if (c.codes && c.codes.length) o.mc = c.codes[0];
    if (Number.isFinite(r.bids)) o.ab = r.bids;
    o.__codes = c.codes || [];
    sold.push(o);
  }
  for (const o of out) {
    if (!o.__codes.length) continue;
    const g = sold.filter((r) => r.__codes.length && sameCode(o.__codes, r.__codes)); if (!g.length) continue;
    const curs = new Set(g.map((r) => r.u || 'KRW')), one = curs.size === 1 ? [...curs][0] : 'KRW';
    const vals = g.map((r) => (one === 'KRW' ? r.k : r.p)), dates = g.map((r) => r.so).sort();
    o.sc = { n: g.length, md: median(vals), lo: Math.min(...vals), hi: Math.max(...vals), u: one, k: median(g.map((r) => r.k)), b: 'code',
             d: [...new Set(g.map((r) => r.r))].join('·') + ' ' + (dates.length > 1 ? md(dates[0]) + '–' + md(dates[dates.length - 1]) : md(dates[0])) };
  }
  const freshN = out.reduce((n, o) => n + (o.__ids || [o.__id]).filter((id) => fresh.has(id)).length, 0);
  const items = [...out, ...goneRecent, ...sold].map((o) => { delete o.__codes; delete o.__id; delete o.__ids; return o; });

  const liveN = out.reduce((n, o) => n + (o.v ? o.v.length : 1), 0);
  const sections = {}, sellers = {}, years = [];
  for (const o of out) { sections[o.s] = (sections[o.s] || 0) + 1; for (const v of o.v || [o]) sellers[v.r] = (sellers[v.r] || 0) + 1;
    const y = yearOfEra(o.e); if (y) years.push(y); }
  years.sort((a, b) => a - b);
  const seenOf = (f) => (L.state.seen || {})[f];
  const srcs = new Map();
  for (const [f, cfg] of Object.entries(FILES)) {
    if (cfg.kind === 'check') continue;
    const s = summary.sources[f]; const seen = seenOf(f);
    if (!seen) continue;                                   // never answered: not claimed
    const cur = srcs.get(cfg.name) || { m: cfg.m, name: cfg.name, how: [], seen: null, lag: 0 };
    // read on the PC the morning before: its last reading is a day behind by design, not stopped
    const lag = (L.state.lag || {})[f]; if (lag > cur.lag) cur.lag = lag;
    if (s && s.ok && cfg.how) cur.how.push(cfg.how);
    // the day the listings were last read, not the day the sale records were
    if (cfg.kind === 'live' && (!cur.seen || seen > cur.seen)) cur.seen = seen;
    srcs.set(cfg.name, cur);
  }
  const d = new Date(Date.parse(day + 'T00:00:00Z'));
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return {
    issue, issueLabel: 'Issue ' + String(issue).padStart(3, '0'), date: day.replace(/-/g, '.'),
    dateKo: d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 ' + dow + '요일',
    built: new Date().toISOString(), today: day,
    rates: { USD: rates.USD, GBP: rates.GBP, EUR: rates.EUR, JPY: rates.JPY, ...(rates.date ? { date: rates.date } : {}), ...(rates.stale ? { stale: true } : {}) },
    counts: { entries: Object.keys(L.items).length, items: liveN, grouped, fresh: freshN, changed: 0, sold: sold.length, gone: goneRecent.length },
    sections, sellers, yearSpan: years.length ? years[0] + '–' + years[years.length - 1] : '',
    sources: [...srcs.values()].map((x) => ({ m: x.m, name: x.name, ...(x.how.length ? { how: [...new Set(x.how)].join(' + ') } : {}), ...(x.seen ? { seen: x.seen } : {}),
                                              ...(x.lag ? { lag: x.lag } : {}) })),
    items,
  };
}

// ── the page ─────────────────────────────────────────────────────────────
export function page(template, payload) {
  if (!template.includes('/*__DATA__*/')) throw new Error('template has no /*__DATA__*/ slot');
  // inside <script>, "</" would end the block: every "<" travels as its \\u003c escape
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
  return template.split('/*__DATA__*/').join(json);
}

// ── the mail: a list and a link, no pictures ─────────────────────────────
const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const SYM = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', CNY: 'CN¥', CHF: 'CHF ',
  SEK: 'SEK ', DKK: 'DKK ', NOK: 'NOK ', PLN: 'PLN ', CZK: 'CZK ', HUF: 'HUF ', THB: 'THB ', MXN: 'MX$', BRL: 'R$', INR: '₹', TRY: 'TRY ' };
// The mail task reads this file whole and sends it as it is, so it is kept to
// one row per line and under `limit` characters: past that it lists fewer and
// says how many more (the page has them all).
export function mail(payload, stats, { siteUrl = MAIL_URL, first = false, limit = 24000 } = {}) {
  const P = payload, live = P.items.filter((o) => !o.x && !o.so);
  const fresh = live.filter((o) => o.n).sort((a, b) => b.k - a.k);
  // only what moved today: the page keeps a cut marked for two weeks, the mail says it once
  const drops = live.filter((o) => o.w && o.w > o.k && o.wd === P.today).sort((a, b) => (b.w - b.k) / b.w - (a.w - a.k) / a.w);
  const price = (o) => '₩' + won(o.k) + (o.u && o.p ? ' <span style="color:#8a857c">' + (SYM[o.u] || o.u + ' ') + Number(o.p).toLocaleString('en-US') + '</span>' : '');
  const row = (o, extra = '') => '<tr><td style="padding:10px 0;border-bottom:1px solid #e6e2db;font-size:13px;line-height:1.5">' +
    '<a href="' + escH(o.l) + '" style="color:#181715;text-decoration:none">' + escH(o.t) + '</a><br>' +
    '<span style="font-size:12px;color:#605c55">' + [price(o), escH(o.r), o.z ? escH(o.z) : '', o.e ? escH(o.e) : '', o.mc ? escH(o.mc) : ''].filter(Boolean).join(' · ') + extra + '</span></td></tr>';
  const sect = (label, list, fn, max) => list.length ? '\n<tr><td style="padding:26px 0 6px;font-size:10px;letter-spacing:.18em;color:#605c55">' + label + ' ' + won(list.length) + '</td></tr>\n' +
    list.slice(0, max).map(fn).join('\n') + (list.length > max ? '\n<tr><td style="padding:10px 0;font-size:12px;color:#605c55">외 ' + won(list.length - max) + '건</td></tr>' : '') : '';
  const link = siteUrl + (fresh.length && !first ? (siteUrl.includes('?') ? '&' : '?') + 'show=new&sort=new' : '');
  const compose = (maxFresh, maxDrops) => '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escH(P.issueLabel) + '</title></head>\n' +
    // Gmail drops every `background` from a message (2026-09-28: the dark masthead
    // arrived as pale text on white), so nothing here depends on one: dark type on
    // the page's own white, rules drawn as borders
    '<body style="margin:0;padding:0" bgcolor="#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',Arial,sans-serif;color:#181715">' +
    '<tr><td style="border-top:3px solid #181715;border-bottom:1px solid #181715;padding:18px 24px 16px;color:#181715"><div style="font-size:10px;letter-spacing:.24em;color:#181715">ARCHIVE INDEX</div>' +
    '<div style="font-size:18px;letter-spacing:.04em;margin-top:6px;color:#181715">Carol Christian Poell</div>' +
    '<div style="font-size:11px;color:#605c55;margin-top:10px">' + escH(P.issueLabel) + ' · ' + escH(P.dateKo) + '</div></td></tr>' +
    '<tr><td style="padding:18px 24px 0;font-size:12px;color:#605c55">매물 ' + won(P.counts.items) +
      (first ? ' · 첫 수집' : ' · 신규 ' + won(fresh.length) + (drops.length ? ' · 가격 내림 ' + won(drops.length) : '')) + '</td></tr>' +
    '<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
      (first ? '' : sect('신규', fresh, (o) => row(o), maxFresh) + sect('가격 내림', drops, (o) => row(o, ' · <s>₩' + won(o.w) + '</s>'), maxDrops)) +
    '\n</table></td></tr>\n' +
    '<tr><td style="padding:26px 24px 30px"><a href="' + escH(link) + '" style="display:inline-block;font-size:11px;letter-spacing:.2em;color:#181715;border-bottom:1px solid #181715;padding-bottom:3px;text-decoration:none">전체 보기</a></td></tr>\n' +
    '</table></td></tr></table></body></html>\n';
  let maxFresh = 40, maxDrops = 20, html = compose(maxFresh, maxDrops);
  while (html.length > limit && (maxFresh > 5 || maxDrops > 3)) {
    maxFresh = Math.max(5, maxFresh - 5); maxDrops = Math.max(3, maxDrops - 2); html = compose(maxFresh, maxDrops);
  }
  const subject = 'Archive Index CCP ' + P.issueLabel + ' · ' + md(P.today) + (first ? ' · 매물 ' + won(P.counts.items) : ' · 신규 ' + won(fresh.length) + (drops.length ? ' · 가격 내림 ' + won(drops.length) : ''));
  return { html, meta: { date: P.today, issue: P.issue, subject, fresh: fresh.length, drops: drops.length, items: P.counts.items,
                         send: first ? P.counts.items > 0 : fresh.length + drops.length > 0, first, url: siteUrl } };
}

// ── run ──────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(DATA, { recursive: true }); mkdirSync(SITE, { recursive: true });
  const summary = readJson(join(RAW, '_summary.json'), null);
  if (!summary) throw new Error('no data/raw/_summary.json — run collect.mjs first');
  const raw = {};
  for (const f of Object.keys(FILES)) { const r = readJson(join(RAW, f + '.json'), null); if (r) raw[f] = r; }

  const status = readJson(join(DATA, 'status.json'), null);
  const L = readRecord(join(DATA, 'ledger.json'), null) || { v: 1, start: TODAY, items: {}, state: {} };
  // the last build said how many it kept; a ledger with fewer has lost some, however it parses
  if (status && status.counts && status.counts.entries > Object.keys(L.items || {}).length)
    throw new Error('data/ledger.json has ' + Object.keys(L.items || {}).length + ' entries, the last build kept ' + status.counts.entries + ' — not overwriting it');
  L.state = L.state || {}; L.start = L.start || TODAY;
  const before = { n: Object.keys(L.items).length, first: Object.fromEntries(Object.values(L.items).map((x) => [x.id, x.first])) };
  const S = readRecord(join(DATA, 'sold.json'), null) || { v: 1, items: {} };
  const soldBefore = Object.keys(S.items).length;
  const prevRates = readJson(join(DATA, 'rates.json'), null);
  const rates = await fetchRates(prevRates);
  if (!rates.stale) writeFileSync(join(DATA, 'rates.json'), JSON.stringify(rates, null, 1));

  // A source's first complete reading brings its whole stock: new to the index,
  // not new on the market, and not announced as 신규. Neither is the jump when a
  // reading that was cut short one day goes to the end the next.
  const st = L.state;
  st.srcFirst = st.srcFirst || {}; st.seen = st.seen || {}; st.complete = st.complete || {};
  // a re-run on the same day compares with the reading before today's, not with its own
  const prevComplete = {}, prevFirst = {};
  for (const [f, d] of Object.entries(st.complete)) prevComplete[f] = d < TODAY ? d : (st.completeBefore || {})[f];
  for (const [f, d] of Object.entries(st.srcFirst)) prevFirst[f] = d;
  const stats = updateLedger(L, raw, summary, rates, TODAY, prevComplete);
  st.completeBefore = {};
  for (const [f, d] of Object.entries(prevComplete)) if (d) st.completeBefore[f] = d;
  markSeen(st, summary, stats, TODAY);
  // the first issue is the first one that had anything in it
  const firstBuild = !st.firstMail || st.firstMail === TODAY;
  const soldAdded = updateSold(S, raw, summary, rates);
  // 'newest' is where the reading got to (the last one read, when a day had more than it reads)
  if (raw.ff_new && summary.sources.ff_new && summary.sources.ff_new.ok && raw.ff_new.newest && raw.ff_new.reached)
    st.ffSince = raw.ff_new.newest;

  // the ledger never shrinks and no first-seen date ever moves
  const now = Object.values(L.items);
  if (now.length < before.n) throw new Error('ledger shrank: ' + before.n + ' → ' + now.length);
  if (Object.keys(S.items).length < soldBefore) throw new Error('sale records shrank');
  for (const x of now) if (before.first[x.id] && before.first[x.id] !== x.first) throw new Error('first-seen date moved for ' + x.id);

  const newToday = now.filter((x) => x.first === TODAY && !x.gone && !x.ex);
  const byFile = {}; for (const x of newToday) (byFile[x.file] = byFile[x.file] || []).push(x);
  const fresh = new Set(); stats.flood = [];
  for (const [f, xs] of Object.entries(byFile)) {
    const cfg = FILES[f] || {};
    const known = cfg.partial ? prevFirst[f] && prevFirst[f] < TODAY : prevComplete[f] && prevComplete[f] < TODAY;
    if (!known) continue;
    // Between two complete readings, what is new is new. When a code change widens what
    // a source reads (a new query, a parser fix), set state.quiet[file] to that day by hand:
    // the stock it newly reaches is then not announced as 신규.
    if ((st.quiet || {})[f] === TODAY) { stats.flood.push(f + ' quiet'); continue; }
    for (const x of xs) fresh.add(x.id);
  }
  const ed = readJson(join(DATA, 'edition.json'), { issue: 0 });
  const issue = ed.date === TODAY ? ed.issue : Number(ed.issue || 0) + 1;    // a second run the same day is the same issue
  const payload = buildPayload(L, S, rates, summary, { issue, fresh });
  payload.counts.changed = stats.changed;

  const template = readFileSync(join(ROOT, 'template.html'), 'utf8');
  const html = page(template, payload);
  const m = mail(payload, stats, { first: firstBuild });
  if (firstBuild && payload.counts.items > 0) st.firstMail = TODAY;

  writeFileSync(join(DATA, 'ledger.json'), ledgerJson(L));
  writeFileSync(join(DATA, 'sold.json'), ledgerJson(S));
  writeFileSync(join(DATA, 'archive.json'), JSON.stringify(payload));
  writeFileSync(join(DATA, 'edition.json'), JSON.stringify({ issue, date: TODAY }));
  writeFileSync(join(DATA, 'mail.html'), m.html);
  writeFileSync(join(DATA, 'mail_meta.json'), JSON.stringify(m.meta, null, 1));
  writeFileSync(join(DATA, 'status.json'), JSON.stringify({ day: TODAY, issue, rates, stats, soldAdded, sources: summary.sources,
    counts: payload.counts }, null, 1));
  writeFileSync(join(SITE, 'index.html'), html);
  writeFileSync(join(SITE, '.nojekyll'), '');
  console.log(JSON.stringify({ issue, items: payload.counts.items, fresh: payload.counts.fresh, stats, soldAdded, rates: rates.stale ? 'stale' : rates.date }));
}
// one listing a line: a day's change is a few lines of diff, not the whole file
function ledgerJson(o) {
  const { items, ...rest } = o;
  const keys = Object.keys(items).sort();
  return '{' + Object.entries(rest).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',') + (Object.keys(rest).length ? ',' : '') +
    '"items":{\n' + keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(items[k])).join(',\n') + '\n}}\n';
}

const isMain = (() => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; } })();
if (isMain) main().catch((e) => { console.error('BUILD FAILED: ' + (e && e.stack || e)); process.exit(1); });
