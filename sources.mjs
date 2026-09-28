// Every search-page source for Carol Christian Poell, and the exact routes each
// one uses. The routes are the ones the Helmut Lang index checked against each
// host's robots.txt; lib.get() checks robots.txt again on every run, so a site
// that closes a path later is obeyed without anyone editing this file.
//
// Read on 2026-09-27 through public pages (no collector has run yet):
//   야후옥션 진행 "carol christian poell" 73건 · 낙찰(180일) 59건
//   메루카리 on_sale 첫 페이지 약 120건 (절반은 설명에만 이름이 있는 다른 브랜드)
//   라쿠마 약 800건 (설명 일치 · 판매 완료 포함)
//   RAGTAG은 CCP 취급 없음, 2nd STREET는 결과가 스크립트로만 그려져 넣지 않았다

import { get, listingsFrom, today, decode } from './lib.mjs';

export const QUERIES = { en: 'carol christian poell', ja: 'キャロルクリスチャンポエル' };

// "9/22 18:17" → 2026-09-22 (the closed search covers 180 days, so a month
// later than this one belongs to last year)
export function mdToDate(s, now = today()) {
  const m = /(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s || ''); if (!m) return null;
  const [y0, m0] = now.split('-').map(Number);
  const y = Number(m[1]) > m0 ? y0 - 1 : y0;
  return y + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
}
// "残り 10時間" / "4日" / "35分" → an end time, and how precisely it is known
export function leftToEnd(s, now = Date.now()) {
  const m = /(\d+)\s*(日|時間|分)/.exec(s || ''); if (!m) return null;
  const n = Number(m[1]), unit = m[2];
  const ms = unit === '日' ? n * 864e5 : unit === '時間' ? n * 36e5 : n * 6e4;
  return { endsAt: new Date(now + ms).toISOString(), endsPrec: unit === '日' ? 'd' : unit === '時間' ? 'h' : 'm' };
}
function fromJsonAuction(o) {
  const out = {};
  const end = o.endTime || o.endDate || o.end_time || o.endAt;
  if (typeof end === 'string' && !isNaN(Date.parse(end))) { out.endsAt = new Date(end).toISOString(); out.endsPrec = 'm'; }
  const bids = o.bids ?? o.bidCount ?? o.bid_count ?? o.numberOfBids;
  if (Number.isFinite(Number(bids))) out.bids = Number(bids);
  return out;
}
// the number and the word come in either order on a card: 入札 16 · 16入札 · 16件
const bidsOf = (t) => { const b = /入札\s*[:：]?\s*(\d+)|(\d+)\s*(?:件\s*)?入札/.exec(t); return b ? Number(b[1] ?? b[2]) : null; };

// "I/99AW/イタリア製/ジャケット/46/ウール/BEG/? NULL ?//" → "Carol Christian Poell I · 99AW · イタリア製 · ジャケット · 46 · ウール · BEG"
export function secondStreetCard(seg) {
  const field = (cls) => { const m = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([^<]*)<').exec(seg || ''); return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : ''; };
  const out = {}, name = field('itemCard_name'), size = /^サイズ\s*(.+)$/.exec(field('itemCard_size'));
  if (name) out.title = name;
  if (size && !/^(?:その他|--|-|F)$/.test(size[1])) out.size = size[1];
  return out;
}
// a model number keeps its own slash (CM/1716B, AM/2601L): only the field separators become dots
export function secondStreetTitle(t, brand) {
  const kept = String(t || '').replace(/\?\s*NULL\s*\?/gi, '/').replace(/\b([A-Z]{2})\/(\d{3,4}[A-Z0-9]*)\b/g, '$1\u2215$2');
  const parts = kept.split('/').map((x) => x.trim().replace(/\u2215/g, '/')).filter((x) => x && x !== '--');
  return (brand + ' ' + parts.join(' · ')).trim();
}

const CCP_LABEL = /^(?:carol\s*christian\s*poell|キャロル\s*[・･]?\s*クリスチャン\s*[・･]?\s*ポエル)$/i;

export const SOURCES = [
  // ── Japan ───────────────────────────────────────────────────────────────
  {
    name: '야후옥션', market: '일본', file: 'yahoo_auctions',
    // /search/search is open; only its sort and page-size parameters are not.
    // 50 per page is the default, so we page with b= and never set n=.
    queries: [QUERIES.en, QUERIES.ja],
    pages: (q, i) => 'https://auctions.yahoo.co.jp/search/search?p=' + encodeURIComponent(q) + (i ? '&b=' + (i * 50 + 1) : ''),
    maxPages: 20, pageSize: 50, noneRe: /一致する(?:商品|オークション)はありません|見つかりませんでした/,
    spec: {
      cur: 'JPY', hrefRe: /\/jp\/auction\/([a-z]?\d{6,})/i,
      key: (id) => 'yahoo:' + id, urlOf: (id) => 'https://auctions.yahoo.co.jp/jp/auction/' + id,
      idOf: (id) => (/^[a-z]?\d{6,}$/i.test(id) ? id : null),
      fromJson: fromJsonAuction,
      fromCard: (t) => {
        const out = {};
        const b = bidsOf(t); if (b != null) out.bids = b;
        const l = /残り\s*([\d]+\s*(?:日|時間|分))/.exec(t) || /(\d+\s*(?:日|時間|分))\s*$/.exec(t.slice(0, 200));
        if (l) Object.assign(out, leftToEnd(l[1]));
        return out;
      },
    },
  },
  {
    name: '야후옥션', market: '일본', file: 'yahoo_closed', sold: true,
    // robots.txt: Disallow /closedsearch/  Allow /closedsearch/closedsearch
    queries: [QUERIES.en, QUERIES.ja],
    pages: (q, i) => 'https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=' + encodeURIComponent(q) + (i ? '&b=' + (i * 50 + 1) : ''),
    maxPages: 20, pageSize: 50, noneRe: /一致する(?:商品|オークション)はありません|見つかりませんでした/,
    spec: {
      cur: 'JPY', hrefRe: /\/jp\/auction\/([a-z]?\d{6,})/i,
      key: (id) => 'yahoo:' + id, urlOf: (id) => 'https://auctions.yahoo.co.jp/jp/auction/' + id,
      idOf: (id) => (/^[a-z]?\d{6,}$/i.test(id) ? id : null),
      fromJson: fromJsonAuction,
      fromCard: (t) => {
        const out = { sold: true, soldKind: '낙찰' };
        const b = bidsOf(t); if (b != null) out.bids = b;
        const d = /(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/.exec(t); if (d) out.soldAt = mdToDate(d[1]);
        return out;
      },
    },
  },
  {
    name: '메루카리', market: '일본', file: 'mercari_jp', browser: true,
    // robots.txt closes /mypage /purchase /sell /transaction /v1 /v2 — not /search.
    // The search page draws its listings in the browser, so collect.mjs reads it
    // through mercari.mjs; the routes and the listing format below stay the same.
    queries: [QUERIES.en, QUERIES.ja],
    pages: (q, i) => 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(q) + '&status=on_sale' + (i ? '&page_token=v1%3A' + i : ''),
    maxPages: 10, pageSize: 120, noneRe: /出品された商品がありません|見つかりませんでした|該当する商品はありません/,
    spec: {
      // its own listings (/item/m…) and Mercari Shops listings (/shops/product/…)
      cur: 'JPY', hrefRe: /\/(?:item\/(m\d{6,})|shops\/product\/([A-Za-z0-9]{16,32}))(?:[\/?#"]|$)/,
      key: (id) => 'mercari:' + id,
      urlOf: (id) => (/^m\d+$/.test(id) ? 'https://jp.mercari.com/item/' + id : 'https://jp.mercari.com/shops/product/' + id),
      idOf: (id) => (/^m\d{6,}$/.test(id) || /^[A-Za-z0-9]{16,32}$/.test(id) ? id : null), soldRe: /SOLD/,
      brandChunkRe: CCP_LABEL,
    },
  },
  {
    name: '라쿠마', market: '일본', file: 'rakuma',
    // robots.txt closes /search/ and the sort=/status= parameters; /s?query= is open.
    // The search also matches descriptions: most of its ~800 hits are other brands
    // or sold, and the title reading drops them.
    queries: [QUERIES.en],
    pages: (q, i) => 'https://fril.jp/s?query=' + encodeURIComponent(q) + (i ? '&page=' + (i + 1) : ''),
    maxPages: 25, pageSize: 40, noneRe: /見つかりませんでした|該当する商品はありません/,
    spec: {
      cur: 'JPY', hrefRe: /item\.fril\.jp\/([0-9a-f]{32})/i,
      key: (id) => 'rakuma:' + id, urlOf: (id) => 'https://item.fril.jp/' + id,
      idOf: (id) => (/^[0-9a-f]{32}$/i.test(id) ? id : null), soldRe: /SOLD|売り切れ/,
      brandChunkRe: CCP_LABEL,
    },
  },
  {
    name: '야후 플리마', market: '일본', file: 'yahoo_fleamarket',
    // Yahoo!フリマ (formerly PayPayフリマ), same LY terms as 야후옥션. robots.txt closes
    // /search/ only with sort= order= sold= open= price and filter parameters;
    // the page and page= are open. Results come as the page's own JSON, 100 a page,
    // with what has sold marked SOLD (read as gone, never as a listing).
    queries: [QUERIES.en, QUERIES.ja],
    pages: (q, i) => 'https://paypayfleamarket.yahoo.co.jp/search/' + encodeURIComponent(q) + (i ? '?withSpeller=0&page=' + (i + 1) : ''),
    maxPages: 10, pageSize: 100, noneRe: /該当する商品(?:は|が)ありません|見つかりませんでした|商品が見つかりません/,
    spec: {
      cur: 'JPY', hrefRe: /(?:paypayfleamarket\.yahoo\.co\.jp)?\/item\/([a-z]\d{6,})(?:[\/?#"]|$)/i,
      key: (id) => 'yfm:' + id, urlOf: (id) => 'https://paypayfleamarket.yahoo.co.jp/item/' + id,
      idOf: (id) => (/^[a-z]\d{6,}$/i.test(id) ? id : null), soldRe: /^SOLD$|売り切れ/,
      brandChunkRe: CCP_LABEL,
      fromJson: (o) => ({ ...(o.itemStatus === 'SOLD' ? { sold: true } : {}),
                          ...(o.brand && CCP_LABEL.test(String(o.brand.name || '').trim()) ? { brandTagged: true } : {}) }),
    },
  },
  {
    name: '세컨드스트리트', market: '일본', file: 'secondstreet',
    // 2nd STREET online store. robots.txt closes only its share links; /search is open.
    // 60 a page. The card names the brand on its own line and describes the piece in
    // slash-separated fields (season, 本人期, category, size, material, colour); the
    // title is the brand followed by those fields.
    queries: ['Carol Christian Poell'],
    pages: (q, i) => 'https://www.2ndstreet.jp/search?keyword=' + encodeURIComponent(q) + (i ? '&page=' + (i + 1) : ''),
    maxPages: 10, pageSize: 60, noneRe: /該当する商品(?:は|が)ありません|見つかりませんでした|検索結果はありません/,
    spec: {
      cur: 'JPY', hrefRe: /\/goods\/detail\/goodsId\/(\d{8,})\/shopsId\/\d+/,
      key: (id) => '2nd:' + id, urlOf: (id) => 'https://www.2ndstreet.jp/goods/detail/goodsId/' + id,
      idOf: (id) => (/^\d{8,}$/.test(id) ? id : null), soldRe: /^SOLD\s*OUT$|売り切れ/,
      brandChunkRe: CCP_LABEL,
      // the card's own fields, not the longest text on it ("商品の状態 : 中古B" can be longer than a short name)
      fromCard: (t, seg) => secondStreetCard(seg),
      title: (t) => secondStreetTitle(t, 'Carol Christian Poell'),
    },
  },
  // ── Korea ───────────────────────────────────────────────────────────────
  {
    name: '후루츠패밀리', market: '한국', file: 'ff_brand', brandPage: true, partial: true,
    // robots.txt: `*` may read everything but /my /checkout /upload /login /auth.
    // The brand page shows 40 listings in its default order (트렌드순); the rest
    // loads by script. `partial`: absence here says nothing about a listing.
    queries: ['Carol Christian Poell'],
    pages: (q, i) => (i ? null : 'https://fruitsfamily.com/brand/' + encodeURIComponent(q)),
    maxPages: 1,
    spec: {
      cur: 'KRW', hrefRe: /(?:fruitsfamily\.com)?\/product\/([0-9a-z]{4,8})(?:[\/?#]|$)/i,
      key: (id) => 'ff:' + id, urlOf: (id) => 'https://fruitsfamily.com/product/' + id + '/',
      idOf: (id) => (/^[0-9a-z]{4,8}$/i.test(id) ? id : null), soldRe: /판매완료|SOLD/,
    },
  },
];

// Pages until the results run out. `complete` says whether every query ran out
// by itself, and a query has run out only when its last page was short — fewer
// than the site's page size (a first page included) — or when the site says in
// its own words that nothing matched. A full page followed by an empty one, or
// by a repeat of what was already read (a site ignoring the page parameter, a
// challenge page), is not an end we can vouch for; neither is a reading stopped
// by maxPages. An incomplete reading never makes an unread listing look vanished.
function linkIds(html, re) {
  const ids = new Set(); const a = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi; let m;
  while ((m = a.exec(String(html || '')))) { const h = m[2] ?? m[3] ?? ''; const x = re.exec(h); if (x) { const v = x.slice(1).find((y) => y); if (v) ids.add(v); } }
  return ids;
}
export async function collect(src, log = () => {}, fetchPage = get) {
  const all = new Map(); const pagesRead = []; const linked = new Set(); let firstHtml = null, complete = !src.partial;
  for (const q of src.queries) {
    const mine = new Set(); let ranOut = false, size = src.pageSize || 0;
    for (let i = 0; i < src.maxPages; i++) {
      const url = src.pages(q, i); if (!url) { ranOut = true; break; }
      let html;
      try { html = await fetchPage(url); }
      catch (e) {
        // past the last full page some sites answer 404: an end only after a short page, which we would not have followed
        if (i > 0 && /HTTP 404/.test(String(e && e.message))) break;
        throw e;
      }
      if (firstHtml == null) firstHtml = html;
      const got = listingsFrom(html, src.spec);
      let fresh = 0, added = 0;
      for (const it of got) {
        if (!mine.has(it.id)) { mine.add(it.id); fresh++; }
        if (!all.has(it.id)) { all.set(it.id, src.sold ? { sold: true, ...it } : it); added++; }
      }
      // how long the page was is told by its listing links, not by how many of
      // them we could read a price from: a full page read badly is still full
      // every listing linked from the page is on the market today, read or not:
      // a card whose price we could not read is not a listing that has gone
      const links = linkIds(html, src.spec.hrefRe);
      for (const id of links) linked.add(src.spec.key(id));
      const cards = Math.max(got.length, links.size);
      pagesRead.push({ q, page: i + 1, cards, found: got.length, fresh, added });
      log(src.file + ' "' + q + '" p' + (i + 1) + ': ' + cards + ' cards, ' + got.length + ' read, ' + fresh + ' new here, ' + added + ' new overall');
      if (!size && i === 0) size = cards;                      // no stated page size: the first page's
      if (!cards) { ranOut = !!(src.noneRe && src.noneRe.test(html)); break; }
      if (!fresh) break;                                       // the same page again: not an end
      if (cards < 0.8 * size) { ranOut = true; break; }       // a short page is the last one
    }
    if (!ranOut) complete = false;
  }
  return { items: [...all.values()], pagesRead, firstHtml, complete, linked: [...linked] };
}
