// Every rule the collectors and the build keep, checked without the network.
//   node test.mjs
// Runs in the daily workflow before anything is collected: a failing rule
// stops the day's build and yesterday's site stays up.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRobots, robotsAllows, listingsFrom, get, diagOf, Refused, unlinked } from './lib.mjs';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SOURCES, collect, mdToDate, leftToEnd } from './sources.mjs';
import { parseSitemap, productOf, isCCP, discover, SLUG_RE } from './fruitsfamily.mjs';
import { hitOf, catOf, collectGrailed } from './grailed.mjs';
import { cardOf as mercariCard, searchUrl as mercariUrl } from './mercari.mjs';
import { itemOf } from './ebay.mjs';
import { classify, era, codesOf, section, size, excludeReason } from './classify.mjs';
import { updateLedger, updateSold, buildPayload, page, mail, toKRW, FILES, MAIL_URL, markSeen } from './build.mjs';

let n = 0; const ok = (label) => { n++; if (process.env.V) console.log('  ✓ ' + label); };
const S = Object.fromEntries(SOURCES.map((s) => [s.file, s]));

// ── robots.txt, as each host wrote it (read 2026-09-23 / 09-27) ────────────
{
  const yahoo = 'User-agent: *\nDisallow: /members/\nDisallow: /closedsearch/\nDisallow: /closedsearch\nDisallow: /search/advanced\n' +
    'Disallow: /search/*?*n=\nDisallow: /search/*?*mode=\nDisallow: /search/*?*s1=\nAllow: /closedsearch/closedsearch\n';
  const ff = 'User-agent: *\nDisallow: /my\nDisallow: /checkout/\nDisallow: /upload\nDisallow: /login\nDisallow: /auth/\n\n' +
    'User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: anthropic-ai\nAllow: /llms.txt\nDisallow: /\n';
  const rakuma = 'User-agent: *\nDisallow: /search/\nDisallow: /*?*sort=\nDisallow: /*?*status=\nAllow: /search/$\n';
  const grailed = 'User-agent: *\nDisallow: /search\nDisallow: /sold\nDisallow: /users/*\nDisallow: /listings/*/edit\nDisallow: /listings/*/similar\n';
  const ebay = 'User-agent: *\nDisallow: /sch/\nAllow: /sch/ebayadvsearch\nDisallow: /itm/*,\n';
  const cases = [
    [yahoo, '/search/search?p=carol+christian+poell', true], [yahoo, '/search/search?p=carol+christian+poell&b=51', true],
    [yahoo, '/search/search?p=x&n=100', false], [yahoo, '/closedsearch/closedsearch?p=carol+christian+poell', true],
    [yahoo, '/closedsearch/?p=x', false],
    [ff, '/brand/Carol%20Christian%20Poell', true], [ff, '/sitemap.product.xml?page=3', true], [ff, '/product/64x3n/', true], [ff, '/my/orders', false],
    [rakuma, '/s?query=carol+christian+poell&page=2', true], [rakuma, '/s?query=x&sort=created_at', false],
    [grailed, '/designers/carol-christian-poell', true], [grailed, '/search?q=x', false], [grailed, '/sold', false],
    [ebay, '/sch/i.html?_nkw=carol', false],
  ];
  for (const [txt, path, want] of cases) assert.equal(robotsAllows(parseRobots(txt), path), want, path);
  // the AI-crawler group is someone else's rules, not ours
  assert.equal(parseRobots(ff).some((r) => r.path === '/' && !r.allow), false);
  ok('robots: ' + cases.length + ' routes');
}

// ── reading search pages ─────────────────────────────────────────────────
{
  const yahoo = `<ul><li class="Product">
    <a href="https://auctions.yahoo.co.jp/jp/auction/c1243046384"><img src="https://auc-pctr.c.yimg.jp/i/a.jpg" alt="x"></a>
    <h3><a href="https://auctions.yahoo.co.jp/jp/auction/c1243046384">超希少 CAROL CHRISTIAN POELL 07SS ツイストシャツ 44 白 CM/2240 RAUCH/1</a></h3>
    <span>現在 28,000円</span><span>入札 3</span><span>残り 47分</span></li>
    <li class="Product"><a href="/jp/auction/j1245414100"><img data-src="https://auc-pctr.c.yimg.jp/i/b.jpg"></a>
    <a href="/jp/auction/j1245414100">CAROL CHRISTIAN POELL キャロルクリスチャンポエル パンツ スラックス ブラック 46</a>
    <span>31,500円</span> 16入札 2時間</li></ul>`;
  const g = listingsFrom(yahoo, S.yahoo_auctions.spec);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].id, g[0].price, g[0].bids, g[0].endsPrec], ['yahoo:c1243046384', 28000, 3, 'm']);
  assert.deepEqual([g[1].price, g[1].bids, g[1].endsPrec, g[1].img], [31500, 16, 'h', 'https://auc-pctr.c.yimg.jp/i/b.jpg']);   // number before the word
  const closed = '<li><a href="https://auctions.yahoo.co.jp/jp/auction/k1244417862">新品未使用 CAROL CHRISTIAN POELL DIAGONAL ZIP BOOTS RED AM/2601L</a><span>落札 221,000円</span> 入札 88 <span>9/21 00:31</span></li>';
  const c = listingsFrom(closed, S.yahoo_closed.spec)[0];
  assert.deepEqual([c.sold, c.soldKind, c.bids, c.price], [true, '낙찰', 88, 221000]); assert.match(c.soldAt, /^\d{4}-09-21$/);
  const ff = '<a href="/product/64x3n/carol-christian-poell-combat-boots-7"><img src="https://image.production.fruitsfamily.com/public/product/resized%40width620/a.jpg"></a>' +
    '<a href="/product/64x3n/carol-christian-poell-combat-boots-7">Carol Christian Poell combat boots 7</a><span>3,100,000원</span>';
  const f = listingsFrom(ff, S.ff_brand.spec)[0];
  assert.deepEqual([f.id, f.url, f.price, f.cur], ['ff:64x3n', 'https://fruitsfamily.com/product/64x3n/', 3100000, 'KRW']);
  const m = listingsFrom('<li><a href="/item/m21149925004"><span>CAROL CHRISTIAN POELL</span><span>コンバットブーツ 7</span><span>¥319,800</span></a></li>', S.mercari_jp.spec)[0];
  assert.deepEqual([m.title, m.brandTagged, m.price], ['コンバットブーツ 7', true, 319800]);
  const r = listingsFrom('<li><a href="https://item.fril.jp/ef8eaacc7b78fce2fd7bd9089d3dbd44">Carol Christian Poell スニーカー サイズ10</a><span>¥170,000</span><span>SOLD OUT</span></li>', S.rakuma.spec)[0];
  assert.deepEqual([r.id, r.sold], ['rakuma:ef8eaacc7b78fce2fd7bd9089d3dbd44', true]);
  ok('search pages: yahoo live and closed, fruitsfamily, mercari label, rakuma sold');
}
{
  // Yahoo!フリマ: the page's own JSON, 100 a page. SOLD is read as sold; the auction
  // module on the same page (links to 야후옥션, no title) is not a listing of this source
  const nd = { props: { initialState: { searchState: { search: { result: { totalResultsAvailable: 3, items: [
    { id: 'x1229425247', title: '2008‐9 スパイラル ネイル リング キャロルクリスチャンポエル Carol Christian Poell', price: 94000, itemStatus: 'OPEN',
      thumbnailImageUrl: 'https://auc-pctr.c.yimg.jp/i/a.jpg', brand: { id: 1, name: 'CAROL CHRISTIAN POELL' } },
    { id: 'z520111612', title: 'テーラードジャケット 黒', price: 112100, itemStatus: 'OPEN', brand: { id: 1, name: 'キャロルクリスチャンポエル' } },
    { id: 'k1245640158', title: 'ccp レザー ブーツ', price: 450000, itemStatus: 'SOLD', brand: null } ] },
    auctionItemsModule: { items: [{ id: 'v1200000001', price: 5000, url: 'https://auctions.yahoo.co.jp/jp/auction/v1200000001', isAuction: true }] } } } } } };
  const html = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(nd) + '</script>' +
    '<a href="/item/x1229425247"><img src="https://auc-pctr.c.yimg.jp/i/a.jpg"></a><a href="https://auctions.yahoo.co.jp/jp/auction/v1200000001">x</a>';
  const r = listingsFrom(html, S.yahoo_fleamarket.spec);
  assert.deepEqual(r.map((x) => x.id).sort(), ['yfm:k1245640158', 'yfm:x1229425247', 'yfm:z520111612']);
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(by['yfm:x1229425247'].url, 'https://paypayfleamarket.yahoo.co.jp/item/x1229425247');
  assert.equal(by['yfm:x1229425247'].img, 'https://auc-pctr.c.yimg.jp/i/a.jpg');
  assert.equal(by['yfm:z520111612'].brandTagged, true);          // the seller filed it under the brand
  assert.equal(by['yfm:k1245640158'].sold, true); assert.equal(by['yfm:x1229425247'].cur, 'JPY');
  assert.equal(S.yahoo_fleamarket.pages('carol christian poell', 1), 'https://paypayfleamarket.yahoo.co.jp/search/carol%20christian%20poell?withSpeller=0&page=2');
  const yfm = parseRobots('User-agent: *\nDisallow: /item/*/edit\nDisallow: /search/*?*sort=\nDisallow: /search/*?*sold=\nDisallow: /search/*?*minPrice=\n');
  assert.equal(robotsAllows(yfm, '/search/%E3%82%AD?withSpeller=0&page=2'), true);
  assert.equal(robotsAllows(yfm, '/search/%E3%82%AD?sort=openTime'), false);

  // 2nd STREET: brand on its own line, the piece in slash fields. The name is read from
  // its own field even when the condition line is longer; a model number keeps its slash
  const card = (id, name, size, price, off) => '<li class="js-favorite itemCard" goodsid="' + id + '"><a href="/goods/detail/goodsId/' + id + '/shopsId/31108" class="itemCard_inner">' +
    '<div class="itemCard_img"><img src="https://cdn2.2ndstreet.jp/img/pc/goods/' + id + '/1_tn.jpg" loading="lazy" />' + (off ? '<ul class="itemCard_labelList"><li class="priceDown itemCard_label -off">25%OFF</li></ul>' : '') + '</div>' +
    '<div class="itemCard_body"><p class="itemCard_brand">CAROL CHRISTIAN POELL</p><p class="itemCard_name">' + name + '</p><p class="itemCard_size">サイズ' + size + '</p>' +
    '<p class="itemCard_status">商品の状態 : 中古B</p><p class="itemCard_price' + (off ? ' -down' : '') + ' itemCard_price">&yen;' + price + ' </p></div><a class="favorite itemCard_favorite"></a></a></li>';
  const page2 = '<ul class="itemCardList -wrap">' + card('2346610082523', 'I/99AW/イタリア製/ジャケット/46/ウール/BEG/? NULL ?//', '46', '175,890', true) +
    card('2347101730237', 'シャツ/CM/1716B', 'その他', '65,890') + '</ul>';
  const t = listingsFrom(page2, S.secondstreet.spec);
  assert.deepEqual(t.map((x) => [x.id, x.price, x.size || null, !!x.brandTagged]),
    [['2nd:2346610082523', 175890, '46', true], ['2nd:2347101730237', 65890, null, true]]);
  assert.equal(t[0].title, 'Carol Christian Poell I · 99AW · イタリア製 · ジャケット · 46 · ウール · BEG');
  assert.equal(t[1].title, 'Carol Christian Poell シャツ · CM/1716B');
  assert.equal(t[0].url, 'https://www.2ndstreet.jp/goods/detail/goodsId/2346610082523');
  assert.equal(S.secondstreet.pages('Carol Christian Poell', 2), 'https://www.2ndstreet.jp/search?keyword=Carol%20Christian%20Poell&page=3');
  ok('search pages: Yahoo!フリマ JSON and sold, 2nd STREET cards and titles');
}
{
  // Grailed read on the PC the morning before: dated that day, a day's lag declared, and
  // the page does not call it stopped until it is later than that
  const st = {}, sum = { sources: { grailed: { ok: true, via: 'pc', seenDay: '2026-09-29', complete: true },
                                    rakuma: { ok: true, complete: true } } };
  markSeen(st, sum, { held: [] }, '2026-09-30');
  assert.deepEqual([st.seen.grailed, st.lag.grailed, st.seen.rakuma, st.lag.rakuma], ['2026-09-29', 1, '2026-09-30', undefined]);
  markSeen(st, { sources: { grailed: { ok: true, complete: true } } }, { held: [] }, '2026-10-01');   // read on the runner again
  assert.deepEqual([st.seen.grailed, st.lag.grailed], ['2026-10-01', undefined]);
  const tpl = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
  const fn = /function daysBetween[\s\S]*?\n(?=function )/.exec(tpl), dn = /function dnum[\s\S]*?\n(?=function )/.exec(tpl);
  const stop = /function srcStopped[^\n]*\n/.exec(tpl);
  assert.ok(fn && dn && stop, 'template helpers not found');
  const run = new Function('SRCSTAT', 'TODAY', dn[0] + fn[0] + stop[0] + 'return srcStopped;');
  assert.equal(run({ G: { seen: '2026-09-29', lag: 1 } }, '2026-09-30')('G'), false);
  assert.equal(run({ G: { seen: '2026-09-28', lag: 1 } }, '2026-09-30')('G'), true);
  assert.equal(run({ R: { seen: '2026-09-29' } }, '2026-09-30')('R'), true);
  ok('grailed read on the PC: dated, lag declared, not called stopped');
}
{
  // two spellings, pages of 50: English 50 + 23, Japanese 30 of which 10 are also in the English results
  const page = (ids) => ids.map((i) => '<a href="/jp/auction/x1' + String(i).padStart(6, '0') + '">CCP drip boots ' + i + '</a> 1,000円').join('');
  const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
  const pages = { en: [page(range(0, 50)), page(range(50, 73))], ja: [page(range(63, 93))] };
  const fetchPage = async (url) => { const u = new URL(url); const key = u.searchParams.get('p') === 'carol christian poell' ? 'en' : 'ja';
    return pages[key][Math.floor((Number(u.searchParams.get('b') || 1) - 1) / 50)] || ''; };
  const res = await collect(S.yahoo_auctions, () => {}, fetchPage);
  assert.equal(res.items.length, 93); assert.equal(res.complete, true);
  // a reading stopped by the page limit is not complete
  const endless = async (url) => { const b = Number(new URL(url).searchParams.get('b') || 1); return page(range(1000 + b, 1050 + b)); };
  const cut = await collect({ ...S.yahoo_auctions, maxPages: 3 }, () => {}, endless);
  assert.equal(cut.complete, false);
  // a first page with nothing on it: the end only if the site says nothing matched
  const none = await collect({ ...S.yahoo_auctions, queries: ['x'] }, () => {}, async () => '<p>条件に一致する商品は見つかりませんでした</p>');
  assert.equal(none.complete, true);
  const blocked = await collect({ ...S.yahoo_auctions, queries: ['x'] }, () => {}, async () => '<p>アクセスが集中しています</p>');
  assert.equal(blocked.complete, false);
  // the brand page is partial by nature
  const bp = await collect(S.ff_brand, () => {}, async () => '<a href="/product/64x3n/x">CCP combat boots</a> 1,000원');
  assert.equal(bp.complete, false);
  assert.match(mdToDate('9/21 00:31', '2026-09-27'), /^2026-09-21$/); assert.equal(mdToDate('12/30 10:00', '2026-01-05'), '2025-12-30');
  assert.equal(leftToEnd('残り 2日', Date.UTC(2026, 8, 27)).endsPrec, 'd');
  ok('paging: per-query end, page limit, partial brand page, dates');
}

// ── 후루츠패밀리 sitemap and listing pages ────────────────────────────────
{
  const xml = '<?xml version="1.0"?><urlset><url><loc>https://fruitsfamily.com/product/6qhy6/%EB%A1%9C%EC%96%B4</loc><lastmod>2026-09-26T19:58:54.000Z</lastmod></url>' +
    '<url><loc>https://fruitsfamily.com/product/64x3n/carol-christian-poell-combat-boots-7</loc><lastmod>2026-09-26T19:00:00.000Z</lastmod></url>' +
    '<url><loc>https://fruitsfamily.com/product/5z2jt/%5B50%5D%EC%BA%90%EB%A1%A4%ED%81%AC%EB%A6%AC%EC%8A%A4%EC%B0%AC%ED%8F%AC%EC%97%98-%EB%A0%88%EB%8D%94%EC%9E%90%EC%BC%93</loc><lastmod>2026-09-26T18:41:57.000Z</lastmod></url></urlset>';
  const e = parseSitemap(xml);
  assert.equal(e.length, 3); assert.equal(e[2].slug, '[50]캐롤크리스찬포엘-레더자켓');
  assert.deepEqual(e.filter((x) => SLUG_RE.test(x.slug)).map((x) => x.id), ['64x3n', '5z2jt']);
  const html = '<html><head><meta property="og:title" content="Carol Christian Poell combat boots 7 | 후루츠패밀리">' +
    '<meta property="og:image" content="https://image.production.fruitsfamily.com/public/product/resized%40width620/a.jpg">' +
    '<meta property="product:price:amount" content="3100000"><meta property="product:price:currency" content="KRW">' +
    '<meta property="product:availability" content="in stock"><meta property="product:condition" content="used">' +
    '<meta property="product:brand" content="Carol Christian Poell"></head><body>사이즈</span><span>7</span></body></html>';
  const p = productOf(html);
  assert.deepEqual([p.title, p.price, p.cur, p.forSale, p.brand, p.size], ['Carol Christian Poell combat boots 7', 3100000, 'KRW', true, 'Carol Christian Poell', '7']);
  assert.equal(productOf(html.replace('in stock', 'out of stock')).forSale, false);
  assert.equal(isCCP(p.brand), true); assert.equal(isCCP('Paul Harnden'), false);
  // reading stops at what the last run already saw
  const pagesSeen = [];
  const d = await discover({ since: '2026-09-26T18:50:00.000Z', fetchPage: async (u) => { pagesSeen.push(u); return xml; } });
  assert.equal(pagesSeen.length, 1); assert.equal(d.reached, true); assert.equal(d.newest, '2026-09-26T19:58:54.000Z');
  ok('fruitsfamily: sitemap slugs, listing meta, watermark');
}

// ── Grailed search hits, eBay API items ───────────────────────────────────
{
  // one hit from Grailed's search service, as it answered on 2026-09-29 (seller fields cut to a name)
  const g = hitOf({ id: 102614695, title: 'Drip  Rubber Tornado Boots ', price_i: 1850, size: '9', condition: 'is_gently_used', sold: false, deleted: false,
    category_path: 'footwear.boots', cover_photo: { url: 'https://media-assets.grailed.com/prd/listing/a' }, user: { username: 'someone' } });
  assert.deepEqual([g.id, g.url, g.title, g.price, g.cur, g.size, g.cat, g.img, g.brandTagged, g.cond],
    ['grailed:102614695', 'https://www.grailed.com/listings/102614695', 'Drip Rubber Tornado Boots', 1850, 'USD', '9', 'shoes', 'https://media-assets.grailed.com/prd/listing/a', true, undefined]);
  assert.equal(JSON.stringify(g).includes('someone'), false);                         // the seller is not kept
  assert.equal(hitOf({ id: 1, title: 'x', price_i: 100, sold: true }), null);          // sold: not for sale
  assert.equal(hitOf({ id: 1, title: 'x', price_i: 100, deleted: true }), null);
  assert.equal(hitOf({ id: 1, title: '', price_i: 100 }), null);                      // no title: not a listing
  assert.equal(hitOf({ id: 1, title: 'x', price_i: 0 }), null);                       // no price: not a listing
  const h = hitOf({ id: 2, title: 'x', price_i: 100, size: 'one size', condition: 'is_new', cover_photo: { url: 'data:x' } });
  assert.deepEqual([h.size, h.cond, h.img, h.cat], [undefined, 'new', null, undefined]);
  assert.deepEqual(['outerwear.leather_jackets', 'bottoms.denim', 'bottoms.casual_pants', 'tops.button_ups', 'tops.sweaters_knitwear',
    'tailoring.blazers', 'accessories.jewelry_watches', 'accessories.bags_luggage', 'accessories.belts', 'womens_dresses.mini', ''].map(catOf),
    ['jacket', 'jeans', 'pants', 'button up shirt', 't-shirt', 'suit', 'ring', 'bag', 'belt', 'dress', '']);
  // what Grailed filed it under decides only when the title says nothing
  assert.equal(classify({ title: 'Carol Christian Poell', cat: 'shoes' }).section, '신발');
  assert.equal(classify({ title: 'Carol Christian Poell leather jacket', cat: 'shoes' }).section, '아우터');
  const e = itemOf({ legacyItemId: '1234', itemWebUrl: 'https://www.ebay.com/itm/1234', title: 'Carol Christian Poell drip boots', price: { value: '900.00', currency: 'USD' },
    buyingOptions: ['AUCTION'], bidCount: 4, itemEndDate: '2026-10-01T10:00:00.000Z', seller: { username: 'someone' } });
  assert.deepEqual([e.id, e.price, e.cur, e.bids, e.endsPrec], ['ebay:1234', 900, 'USD', 4, 'm']);
  assert.equal(JSON.stringify(e).includes('someone'), false);                         // the seller is not kept
  ok('grailed search hits, ebay items');
}
{
  // a search answers 1,000 hits at most: the stock is read in price bands, each halved until
  // it fits (the open top band doubles first); complete only when every band came back whole
  const ask = (stock) => async (lo, hi) => { const m = stock.filter((x) => x.price_i >= lo && (hi == null || x.price_i < hi)); return { nbHits: m.length, hits: m.slice(0, 1000) }; };
  const L = (n, price, from) => Array.from({ length: n }, (_, i) => ({ id: from + i, title: 'Carol Christian Poell ' + (from + i), price_i: price(i) }));
  const stock = [...L(1500, (i) => 250 + (i % 50), 1), ...L(1100, (i) => 2500 + i, 5000), ...L(1100, (i) => 10000 + i * 10, 9000), ...L(3, () => 120, 20000)];
  let r = await collectGrailed(() => {}, ask(stock));
  assert.deepEqual([r.items.length, r.cards, r.total, r.complete], [3703, 3703, 3703, true]);
  assert.equal(new Set(r.items.map((x) => x.id)).size, 3703);
  // 1,200 at a single price cannot be split: what came is kept, the reading is not complete
  r = await collectGrailed(() => {}, ask([...L(1200, () => 500, 1), ...L(10, () => 700, 5000)]));
  assert.deepEqual([r.items.length, r.total, r.complete], [1010, 1210, false]);
  ok('grailed: price bands, split until each fits');
}

// ── reading titles: 354 real ones (2026-09-27) ────────────────────────────
{
  const corpus = JSON.parse(readFileSync(new URL('./test_corpus.json', import.meta.url), 'utf8')).items;
  const got = (t) => { const it = corpus.find((x) => x.title.includes(t)); assert.ok(it, 'not in corpus: ' + t); return classify(it, { brandPage: !!it.brandPage }); };
  const X = { // title fragment → expected reading ('x:reason' | 'A era' | 'B claim' | 'C'), section, size, first code
    '07SS ツイストシャツ': ['A SS07', '셔츠', '44', 'CM/2240'], '2006SS Carol': ['A SS06', '상의', '44'], 'OVERLOCK DEADEND JACKET 48': ['C', '아우터', '48'],
    'AW2002 Carol Christian Poell ATTRACTION': ['A AW02', '셔츠'], '極美品 2009': ['A 2009', '테일러링', '44/46'], '2005SS GM/2027': ['A SS05', '테일러링', null, 'GM/2027'],
    'size7 ccp carolchristianpoell': ['C', '신발', '7', 'AM/2759SP'], '96-97 CAROL': ['B 1996–97', '테일러링', '48'], '01AW レザー テーラードジャケット サイズ46': ['A AW01', '테일러링', '46'],
    'HANDLED PAPER DART OFFICER': ['C', '신발', '7'], '希少 90s CAROL': ['B 1990년대', '아우터', '44'], 'サイズ:44 98AW': ['A AW98', '아우터', '44'],
    'DEAD END OM/2655': ['C', '아우터', '44', 'OM/2655'], '06AW ラミー セットアップ': ['A AW06', '테일러링', '50/48'], '/2017 IN-BETWEEN': ['A 2017', '상의'],
    'GM/2656OD-IN BETWEEN-PTC2 2018': ['A 2018', '기타', null, 'GM/2656OD'], 'SS08 OFF-SCENE AM/2441': ['A SS08', '신발', '6', 'AM/2441'], 'S/S97 REF.N 0362': ['A SS97', '기타'],
    '長袖シャツ/46/コットン/WHT/CM/1716B': ['C', '셔츠', '46', 'CM/1716B'], 'LM 2699 カンガルーレザーコート': ['C', '아우터', '56', 'LM/2699'], 'P/E 2002 TM1622SIT': ['A SS02', '상의', null, 'TM/1622'],
    'カンガルーレザー 長袖シャツ 00-01 ベージュ アイボリー': ['B 2000–01', '셔츠', '46'], '2008‐9 釘 スパイラル': ['B 2008–09', '주얼리', null, 'MM/2145'],
    '00s アーカイブ Goodyear Derby': ['B 2000년대', '신발'], 'PM1602MOVE': ['C', '팬츠', '48', 'PM/1602'], '02SS CAROL CHRISTIAN POELL コットン タンクトップ': ['A SS02', '상의', '46', 'T/1644'],
    'ニットベスト(薄手)': ['C', '상의', '44'], 'トルネード ブーツ AM/2601L ROOMS-PTC 010 8': ['C', '신발', '8', 'AM/2601L'], 'GOODYEAR DERBYS 9 Dark Green': ['C', '신발', '9', 'AM/2600L'],
    'OBJECT DIAGONAL ZIP GOODYEAR BOOTSDYED': ['C', '신발', null], 'Spur-Biter Officer 10': ['C', '신발', '10'], '製品染め折りたたみシューズ': ['C', '신발', '8'],
    '２００１ＳＳ リバーシブルワッフルシャツ': ['A SS01', '셔츠'], '08SS コードバン ラバーバンド ブーツ 56': ['A SS08', '신발', null], 'ラバードリップ レザーシューズ 6': ['A 2009', '신발', '6'],
    'CCP 2687P BIAS-PTC/01 (9)': ['C', '기타', '9', '2687P'], '[50]캐롤크리스찬포엘 스카스티치': ['C', '아우터', '50'], 'CCP PM26680D-IN / BETWEEN 10': ['C', '팬츠', null, 'PM/2668'],
    '[52]캐롤크리스찬포엘 베스트백': ['C', '가방·소품', '52'], 'CCP 97-98 A/W 트라우저': ['A AW97', '팬츠'], '[260]carol christian poell 2685': ['C', '기타', '260'],
    'JM/2568-IN KIT-BW/101 데드엔드 데님 자켓': ['C', '아우터', null, 'JM/2568'], 'CHAIN SEAM ONE PIECE DEAD END 1 BUTTON JACKET': ['C', '테일러링'],
    '参考上代998800円 Carol Christian Poell 25AW': ['A AW25', '아우터'], 'コードバンオックスフォードシューズ5': ['C', '신발', '5'], 'オーバーネック スリーブレス リブ トップス': ['C', '상의', '48'],
    'Sleeveless Knit Top with holes': ['C', '상의'], 'レース ドレスシャツ 46': ['C', '셔츠', '46'], 'ハイネックライダースジャケット42': ['C', '아우터', '42'],
    '【銀週間割引】キャロルクリスチャンポエルJK(96〜97AW': ['A AW96', '아우터'], 'CAROL CHRISTIAN POELL 1998-1999 レザーコート48': ['B 1998–1999', '아우터', '48'],
    'Carol Christian Poell High Neck': ['C', '기타'], 'CCP O.D. "GOODYEAR" DERBYS': ['C', '신발'], 'キャロルクリスチャンポエル ブレスCAROL': ['C', '주얼리'],
    // not this label's, or not for sale
    'Paul Harnden TBVARD': ['x:other-brand'], 'A Diciannoveventitre ロングコート': ['x:other-brand'], '24aw oppose duality': ['x:not-brand'],
    'ISAAC SELLAM レザーダウン': ['x:other-brand'], 'PREMIATA Spiral Zip': ['x:other-brand'], 'Martin Margiela 本人期': ['x:other-brand'],
    'GUIDI グイディ ホースレザー 限定 バックパック': ['x:other-brand'], 'Atlier Inscrire Levinia': ['x:other-brand'], '元ネタ ビンテージ ベスト': ['x:not-brand'],
    'ブランド不明 キャロルクリスチャンポエル': ['x:not-brand'], '鬼レア ポエル期 プレミアータ': ['x:no-brand'], '○○くんさん専用': ['x:reserved'],
    '○○様専用': ['x:reserved'], '○○様へ': ['x:reserved'], '구매) carol christian poell 눈깔반지': ['x:wanted'], '(렌탈)ccp 티타늄': ['x:rental'],
    'RENATO ANGI レザー ショルダーバッグ': ['x:other-brand'], 'DEEPTI｜ディプティ': ['x:other-brand'], 'D&G Archive 2003 Leather Boots 42': ['x:no-brand'],
    'm.a+ by Maurizio Amadei': ['x:no-brand'], 'LOW CROTCH DEADEND FLY TROUSERS': ['x:no-brand'],
    // kept although a neighbour is named — this brand is named first
    'キャロルクリスチャンポエル カットソー デヴォア': ['C', '상의'], 'レア CAROL CHRISTIAN POELL マルチパース': ['C', '가방·소품'],
  };
  for (const [t, [e, sec, z, code]] of Object.entries(X)) {
    const r = got(t);
    const reading = r.exclude ? 'x:' + r.exclude : r.tier + (r.era ? ' ' + r.era : r.claim ? ' ' + r.claim : '');
    assert.equal(reading, e, 'reading of ' + t);
    if (r.exclude) continue;
    assert.equal(r.section, sec, 'section of ' + t);
    if (z !== undefined) assert.equal(r.size ?? null, z, 'size of ' + t);
    if (code !== undefined) assert.equal((r.codes || [])[0], code, 'code of ' + t);
  }
  // nothing in the corpus is ever given a year outside the label's seasons, or a year that is a model number
  for (const it of corpus) { const r = classify(it, { brandPage: !!it.brandPage }); if (r.era) {
    const y = /^\d{4}$/.test(r.era) ? +r.era : (+r.era.slice(2) >= 90 ? 1900 : 2000) + +r.era.slice(2);
    assert.ok(y >= 1995 && y <= new Date().getUTCFullYear() + 1, 'era out of range: ' + it.title); } }
  ok('titles: ' + Object.keys(X).length + ' readings pinned across the corpus');
}
{
  // English sellers write seasons their own way
  const E = [['Carol Christian Poell AW05 Object Dyed Leather Jacket', 'A AW05'], ['CCP FW04 drip rubber boots size 9', 'A FW04'],
    ['Carol Christian Poell SS 2003 Scalpel Cut Shirt', 'A SS03'], ['Carol Christian Poell 2004 AW Bias Cut Trousers IT 48', 'A AW04'],
    ['Vintage 90s Carol Christian Poell leather coat', 'B 1990년대'], ['Carol Christian Poell F/W 2006-07 Overlock Parka', 'A FW06'],
    ['Carol Christian Poell AW 99/00 coat 50', 'A AW99'], ['CCP a/w 2001-2002 leather jacket', 'A AW01'], ['Carol Christian Poell 2010s leather bag', 'B 2010년대'],
    ['CCP AM/2653 tendon boots size 10.5', 'C'], ['Carol Christian Poell 1994 coat', 'C'], ['Carol Christian Poell size 10-11 boots', 'C']];
  for (const [t, want] of E) { const r = era(t); assert.equal(r.tier + (r.era ? ' ' + r.era : r.claim ? ' ' + r.claim : ''), want, t); }
  assert.equal(size('Carol Christian Poell Prosthetic Zip Boot UK 8', '신발'), 'UK 8');
  assert.equal(size('Carol Christian Poell 2004 AW Bias Cut Trousers IT 48', '팬츠'), 'IT 48');
  assert.equal(section('Carol Christian Poell SS 2003 Scalpel Cut Shirt'), '셔츠');
  assert.equal(section('Carol Christian Poell S/S 2000 T-Shirt 48'), '상의');
  assert.deepEqual(codesOf('CCP GM/2621B WIM10, PM26680D-IN'), ['GM/2621B', 'PM/2668']);
  assert.equal(excludeReason('Carol Christian Poell style leather jacket'), 'style-of');
  assert.equal(excludeReason('Drip Vest Bag', { brandPage: true }), null);
  ok('titles: english seasons, scales, codes');
}

// ── the build: three days ────────────────────────────────────────────────
{
  const rates = { USD: 1370, GBP: 1852, EUR: 1587, JPY: 873 };
  const ok1 = (items, complete = true) => ({ ok: true, complete, kept: items.length });
  const mk = (id, t, p, cur = 'JPY', extra = {}) => ({ id, url: 'https://example.invalid/' + id, title: t, price: p, cur, ...extra });
  const y1 = [mk('yahoo:a1', 'CAROL CHRISTIAN POELL DIAGONAL ZIP BOOTS AM/2601L', 300000), mk('yahoo:a2', 'CCP drip sneakers 8', 200000),
              mk('yahoo:a3', 'Paul Harnden シャツ キャロルクリスチャンポエル', 50000)];
  for (let i = 0; i < 25; i++) y1.push(mk('yahoo:f' + i, 'CAROL CHRISTIAN POELL シャツ 4' + (i % 2 ? '6' : '8') + ' #' + i, 30000 + i));
  const r1 = [mk('rakuma:b1', 'CAROL CHRISTIAN POELL DIAGONAL ZIP BOOTS AM/2601L', 310000)];
  const f1 = [mk('ff:c1', 'Carol Christian Poell combat boots 7', 3100000, 'KRW')];
  const closed = [mk('yahoo:s1', 'CCP トルネード ブーツ AM/2601L 8', 171000, 'JPY', { sold: true, soldAt: '2026-08-20', soldKind: '낙찰' }),
                  mk('yahoo:s2', 'CAROL CHRISTIAN POELL DIAGONAL ZIP BOOTS RED AM/2601L', 221000, 'JPY', { sold: true, soldAt: '2026-09-21' })];
  const L = { v: 1, items: {}, state: {} }, SOLD = { v: 1, items: {} };
  const day = (d, raw, summary) => { const st = updateLedger(L, raw, summary, rates, d); updateSold(SOLD, raw, summary, rates, d); return st; };
  // day 1
  let st = day('2026-09-28', { yahoo_auctions: { items: y1 }, rakuma: { items: r1 }, ff_brand: { items: f1 }, yahoo_closed: { items: closed } },
    { sources: { yahoo_auctions: ok1(y1), rakuma: ok1(r1), ff_brand: ok1(f1, false), yahoo_closed: ok1(closed) } });
  assert.equal(st.added, 29); assert.equal(L.items['yahoo:a3'], undefined);                 // another label's listing never enters
  const first = Object.fromEntries(Object.values(L.items).map((x) => [x.id, x.first]));
  // day 2: yen cut on a1; a2 missing once; rakuma failed; the exchange rate moved (no price move follows from it)
  const y2 = y1.filter((x) => x.id !== 'yahoo:a2' && x.id !== 'yahoo:a3').map((x) => (x.id === 'yahoo:a1' ? { ...x, price: 280000 } : x));
  y2.push(mk('yahoo:a4', 'CAROL CHRISTIAN POELL 2004AW レザージャケット 48', 400000));
  const rates2 = { ...rates, JPY: 900 };
  st = updateLedger(L, { yahoo_auctions: { items: y2 }, ff_brand: { items: [] } },
    { sources: { yahoo_auctions: ok1(y2), rakuma: { ok: false, error: 'HTTP 500' }, ff_brand: ok1([], false) } }, rates2, '2026-09-29',
    { yahoo_auctions: '2026-09-28', rakuma: '2026-09-28' });
  assert.equal(st.changed, 1); assert.equal(st.drops, 1);
  assert.deepEqual(L.items['yahoo:a1'].h.map((p) => p[2]), [300000, 280000]);             // the seller's own numbers
  assert.equal(L.items['yahoo:a2'].gone, null); assert.equal(L.items['yahoo:a2'].miss, 1);  // once is not gone
  assert.equal(L.items['rakuma:b1'].last, '2026-09-28'); assert.equal(L.items['rakuma:b1'].gone, null);   // failed source: not observed
  assert.equal(L.items['ff:c1'].gone, null);                                                 // a partial reading never vanishes anything
  // day 3: a2 missing twice → gone; a1 shows a sold badge → gone
  const y3 = y2.map((x) => (x.id === 'yahoo:a1' ? { ...x, sold: true } : x));
  st = updateLedger(L, { yahoo_auctions: { items: y3 } }, { sources: { yahoo_auctions: ok1(y3) } }, rates2, '2026-09-30', { yahoo_auctions: '2026-09-29' });
  assert.equal(L.items['yahoo:a2'].gone, '2026-09-30'); assert.equal(L.items['yahoo:a2'].ls, '2026-09-28');
  assert.equal(L.items['yahoo:a1'].gone, '2026-09-30');
  for (const [id, f] of Object.entries(first)) assert.equal(L.items[id].first, f, 'first-seen moved: ' + id);
  // a reading that brings back far fewer of yesterday's listings says nothing vanished
  const thin = y3.slice(0, 5);
  st = updateLedger(L, { yahoo_auctions: { items: thin } }, { sources: { yahoo_auctions: ok1(thin) } }, rates2, '2026-10-01', { yahoo_auctions: '2026-09-30' });
  assert.deepEqual(st.held, ['yahoo_auctions']); assert.equal(Object.values(L.items).filter((x) => x.gone).length, 2);
  // the payload
  const fresh = new Set(['yahoo:a4']);
  const P = buildPayload(L, SOLD, rates2, { sources: { yahoo_auctions: ok1(thin) } }, { day: '2026-09-30', issue: 3, fresh });
  const a4 = P.items.find((o) => o.l.endsWith('yahoo:a4'));
  assert.equal(a4.n, 1); assert.equal(a4.e, 'AW04'); assert.equal(a4.s, '아우터'); assert.equal(a4.z, '48');
  assert.equal(P.counts.fresh, 1);
  const a1 = P.items.find((o) => o.l.endsWith('yahoo:a1'));
  assert.equal(a1.x, 1); assert.equal(a1.mc, 'AM/2601L');
  // the rakuma boots (same title as a1, which has gone) stand alone and carry the model's sale records
  const b1 = P.items.find((o) => o.l.endsWith('rakuma:b1'));
  assert.equal(b1.sc.n, 2); assert.equal(b1.sc.b, 'code'); assert.equal(b1.sc.u, 'JPY'); assert.equal(b1.sc.md, 196000);
  assert.equal(P.items.filter((o) => o.so).length, 2);
  assert.ok(P.items.every((o) => !('__id' in o) && !('__codes' in o)));
  // one page, and nothing in the data can close its script block
  const tpl = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
  L.items['yahoo:f0'].t = 'x</script><script>alert(1)</script>';
  const html = page(tpl, buildPayload(L, SOLD, rates2, { sources: {} }, { day: '2026-09-30', issue: 3 }));
  assert.equal(html.split('</script>').length, tpl.split('</script>').length);
  // the mail: what is new today, a cut once, nothing on a quiet day
  const m = mail(P, {}, {});
  assert.equal(m.meta.fresh, 1); assert.equal(m.meta.send, true); assert.match(m.meta.subject, /신규 1/);
  assert.equal(/<img/i.test(m.html), false);
  // Gmail strips every background, so the mail may not need one to be readable
  assert.equal(/background/i.test(m.html), false); assert.match(m.html, /border-top:3px solid #181715/);
  const quiet = mail({ ...P, items: P.items.map((o) => ({ ...o, n: 0 })) }, {}, {});
  assert.equal(quiet.meta.send, false);
  // 전체 보기 opens the combined site on this archive — on today's new listings when there are any
  assert.equal(MAIL_URL, 'https://rozykuzy.github.io/?archive=ccp'); assert.equal(m.meta.url, MAIL_URL);
  assert.ok(m.html.includes('href="https://rozykuzy.github.io/?archive=ccp&amp;show=new&amp;sort=new"'));
  assert.ok(quiet.html.includes('href="https://rozykuzy.github.io/?archive=ccp"'));
  assert.ok(mail(P, {}, { siteUrl: 'https://example.test/ccp/' }).html.includes('href="https://example.test/ccp/?show=new&amp;sort=new"'));
  // a heavy day still goes out whole: fewer rows, the rest counted, no line a reader would cut
  const many = { ...P, items: Array.from({ length: 120 }, (_, i) => ({ ...a4, l: a4.l + i, t: a4.t + ' ' + 'x'.repeat(90) + i, n: 1 })) };
  const big = mail(many, {}, {});
  assert.ok(big.html.length <= 24000, 'mail too long: ' + big.html.length);
  assert.match(big.html, /외 \d+건/); assert.equal(big.meta.fresh, 120);
  assert.ok(big.html.split('\n').every((l) => l.length < 2000));
  assert.ok(m.html.includes(P.issueLabel) && m.html.includes('Carol Christian Poell'));
  assert.equal(toKRW(100, 'JPY', { JPY: 873 }), 873); assert.equal(toKRW(10, 'USD', { USD: 1370 }), 13700);
  ok('build: ledger over four days, payload, page, mail');
}
{
  // same title on two platforms at about the same price is one card; three copies on one platform are three garments
  const rates = { USD: 1370, GBP: 1852, EUR: 1587, JPY: 873 };
  const L = { items: {}, state: {} };
  const put = (id, file, src, t, p) => { L.items[id] = { id, file, src, t, u: 'https://example.invalid/' + id, p, cur: 'JPY', k: toKRW(p, 'JPY', rates),
    first: '2026-09-28', last: '2026-09-28', gone: null, miss: 0, h: [['2026-09-28', 0, p]] }; };
  put('m1', 'mercari_jp', '메루카리', 'CAROL CHRISTIAN POELL COMBAT BOOTS', 330000); put('r1', 'rakuma', '라쿠마', 'CAROL CHRISTIAN POELL COMBAT BOOTS', 300000);
  put('m2', 'mercari_jp', '메루카리', 'Carol Christian Poell Prosthetic Boots', 280000); put('m3', 'mercari_jp', '메루카리', 'Carol Christian Poell Prosthetic Boots', 390000);
  put('r2', 'rakuma', '라쿠마', 'Carol Christian Poell Prosthetic Boots', 365000);
  put('m4', 'mercari_jp', '메루카리', 'carol christian poell ジャケット', 219000); put('y4', 'yahoo_auctions', '야후옥션', 'carol christian poell ジャケット', 520000);
  const P = buildPayload(L, { items: {} }, rates, { sources: {} }, { day: '2026-09-28' });
  const combat = P.items.filter((o) => /COMBAT/.test(o.t));
  assert.equal(combat.length, 1); assert.equal(combat[0].g, 2); assert.equal(combat[0].r, '라쿠마');   // the lower asking price leads
  assert.equal(P.items.filter((o) => /Prosthetic/.test(o.t)).length, 3);
  assert.equal(P.items.filter((o) => /ジャケット/.test(o.t)).length, 2);                     // a price over 1.25× is another garment
  assert.equal(P.counts.items, 7);
  ok('build: one listing on two platforms, three garments on one');
}


// ── the review's cases (2026-09-27) ──────────────────────────────────────
{
  // eBay: the seller's own currency, not the marketplace's conversion of it
  const e = itemOf({ legacyItemId: '9', itemWebUrl: 'https://www.ebay.com/itm/9', title: 'Carol Christian Poell coat',
    price: { value: '580.40', currency: 'USD', convertedFromValue: '500.00', convertedFromCurrency: 'EUR' } });
  assert.deepEqual([e.price, e.cur], [500, 'EUR']);
  // a full page followed by an empty one is not the end we can vouch for; a short page is
  const full = Array.from({ length: 50 }, (_, i) => '<a href="/jp/auction/x3' + String(i).padStart(6, '0') + '">CCP drip boots ' + i + '</a> 1,000円').join('');
  const short = Array.from({ length: 12 }, (_, i) => '<a href="/jp/auction/x4' + String(i).padStart(6, '0') + '">CCP drip boots s' + i + '</a> 1,000円').join('');
  const one = { ...S.yahoo_auctions, queries: ['carol christian poell'] };
  let r = await collect(one, () => {}, async (u) => (new URL(u).searchParams.get('b') ? '<html>challenge</html>' : full));
  assert.equal(r.complete, false);
  r = await collect(one, () => {}, async (u) => (new URL(u).searchParams.get('b') ? short : full));
  assert.equal(r.complete, true); assert.equal(r.items.length, 62);
  r = await collect(one, () => {}, async () => full);                    // the page parameter ignored
  assert.equal(r.complete, false);
  // numbers that are not years, and titles that are not exclusions
  const C = (t) => { const x = classify({ title: t }); return x.exclude ? 'x:' + x.exclude : x.tier + (x.era ? ' ' + x.era : ''); };
  for (const t of ['Carol Christian Poell GM-2027 jacket', 'CCP PM-2010 trousers', 'CCP PM.2004 pants', 'ccp pm_2003', 'CCP AM_2016 boots',
    'Carol Christian Poell 2004C shirt', 'Carol Christian Poell RRP £1995 coat', 'Carol Christian Poell retail €2000 jacket', 'CCP boots 2000€',
    'CCP boots 2000 EUR', 'CCP 2000$ boots', 'キャロルクリスチャンポエル ブーツ 送料込み 2000', 'キャロルクリスチャンポエル 20年物 レザー',
    'キャロルクリスチャンポエル 10年保管 ブーツ', '캐롤 크리스찬 포엘 10년된 자켓', '캐롤 크리스찬 포엘 10년 착용 부츠', 'CCP No.2003 jacket',
    'キャロルクリスチャンポエル 品番 2019 ブーツ']) assert.equal(C(t), 'C', t);
  for (const t of ['キャロルクリスチャンポエル リング 専用ケース付き', 'CAROL CHRISTIAN POELL ジャケット 保存袋 専用ハンガー付き', 'CCP 専用袋 箱付き ブーツ',
    'Carol Christian Poell Like New leather jacket', 'Carol Christian Poell Style AM/2601L boots', 'CCP type-2 boots',
    'Carol Christian Poell coat with fake fur collar', 'Carol Christian Poell boots not fake', '캐롤 크리스찬 포엘 부츠 정품 가품시 환불',
    '캐롤 크리스찬 포엘 가품 아님', '캐롤 크리스찬 포엘 부츠 (가품X)']) assert.equal(C(t), 'C', t);
  assert.equal(C('専用 CAROL CHRISTIAN POELL ブーツ'), 'x:reserved');
  assert.equal(C('Carol Christian Poell style leather jacket'), 'x:style-of');
  assert.equal(size("キャロルクリスチャンポエル ブーツ 04年製", '신발'), null);
  assert.equal(size('캐롤 크리스찬 포엘 부츠 5년 사용', '신발'), null);
  assert.equal(size("キャロルクリスチャンポエル ブーツ 9 04年製", '신발'), '9');
  // a page's shape keeps its route words, never a handle
  const d = diagOf('<a href="https://auctions.yahoo.co.jp/seller/tokyo_vintage_shop">x</a><a href="https://fril.jp/shop/kyoto-archive/items">y</a><a href="/user/kimjisoo">z</a>');
  const shapes = d.linkShapes.map((x) => x[0]).join(' ');
  assert.equal(/tokyo|kyoto|kimjisoo/.test(shapes), false, shapes);
  ok('review: ebay currency, completeness, numbers, exclusions, sizes, page shapes');
}
{
  // a redirect into a closed path is refused, like the closed path itself
  const srv = createServer((q, s) => {
    if (q.url === '/robots.txt') { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('User-agent: *\nDisallow: /search/\n'); return; }
    if (q.url.startsWith('/s?')) { s.writeHead(302, { location: '/search/carol' }); s.end(); return; }
    s.writeHead(200, { 'content-type': 'text/html' }); s.end('<html>open</html>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  await assert.rejects(get(base + '/search/carol'), Refused);
  await assert.rejects(get(base + '/s?query=carol'), Refused);
  assert.equal(await get(base + '/brand/x'), '<html>open</html>');
  srv.close();
  ok('robots: checked again at every redirect');
}
{
  // the build as the workflow runs it: first day, a second run the same day, a new source, a broken ledger
  const dir = mkdtempSync(join(tmpdir(), 'ccp-')), data = join(dir, 'data'), raw = join(data, 'raw');
  mkdirSync(raw, { recursive: true });
  writeFileSync(join(data, 'rates.json'), JSON.stringify({ USD: 1370, GBP: 1852, EUR: 1587, JPY: 873, more: { CAD: 1000 }, date: '2026-09-26' }));
  const run = (day) => JSON.parse(execFileSync(process.execPath, [new URL('./build.mjs', import.meta.url).pathname], {
    env: { ...process.env, CCP_OFFLINE: '1', CCP_TODAY: day, CCP_DATA: data, CCP_SITE: join(dir, 'site') }, encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').pop());
  const put = (files, sum) => { for (const [f, items] of Object.entries(files)) writeFileSync(join(raw, f + '.json'), JSON.stringify({ items }));
    writeFileSync(join(raw, '_summary.json'), JSON.stringify({ sources: sum })); };
  const Y = (n, extra = []) => [...Array.from({ length: n }, (_, i) => ({ id: 'yahoo:y' + i, url: 'https://auctions.yahoo.co.jp/jp/auction/y' + i,
    title: 'CAROL CHRISTIAN POELL シャツ 48 #' + i, price: 30000 + i, cur: 'JPY' })), ...extra];
  put({ yahoo_auctions: Y(10) }, { yahoo_auctions: { ok: true, complete: true } });
  let o = run('2026-10-01'); assert.equal(o.issue, 1);
  let meta = JSON.parse(readFileSync(join(data, 'mail_meta.json'), 'utf8'));
  assert.deepEqual([meta.first, meta.send], [true, true]);
  // the same day again (a re-run): the same issue, still the first mail
  o = run('2026-10-01'); assert.equal(o.issue, 1);
  meta = JSON.parse(readFileSync(join(data, 'mail_meta.json'), 'utf8')); assert.equal(meta.first, true);
  // next day, two runs that both miss y9: one miss, not two, and not gone
  put({ yahoo_auctions: Y(9) }, { yahoo_auctions: { ok: true, complete: true } });
  o = run('2026-10-02'); assert.equal(o.issue, 2); run('2026-10-02');
  let L = JSON.parse(readFileSync(join(data, 'ledger.json'), 'utf8'));
  assert.equal(L.items['yahoo:y9'].miss, 1); assert.equal(L.items['yahoo:y9'].gone, null);
  // the day after: Grailed answers for the first time with its whole stock (not 신규); a CAD price converts; sizes come through
  const G = Array.from({ length: 40 }, (_, i) => ({ id: 'grailed:' + (500 + i), url: 'https://www.grailed.com/listings/' + (500 + i),
    title: 'Drip Rubber Tornado Boots ' + i, price: 900, cur: i === 0 ? 'CAD' : 'USD', size: '9' }));
  put({ yahoo_auctions: Y(10, [{ id: 'yahoo:new1', url: 'https://auctions.yahoo.co.jp/jp/auction/new1', title: 'CAROL CHRISTIAN POELL 2004AW ブーツ 8', price: 90000, cur: 'JPY' }]),
        grailed: G }, { yahoo_auctions: { ok: true, complete: true }, grailed: { ok: true, complete: false } });
  o = run('2026-10-03'); assert.equal(o.issue, 3); assert.equal(o.fresh, 1);           // yahoo:new1 only
  L = JSON.parse(readFileSync(join(data, 'ledger.json'), 'utf8'));
  assert.equal(L.items['yahoo:y9'].miss, 0);                                            // seen again
  const P = JSON.parse(readFileSync(join(data, 'archive.json'), 'utf8'));
  const g0 = P.items.find((x) => x.l.endsWith('/500'));
  assert.deepEqual([g0.u, g0.p, g0.k, g0.z], ['CAD', 900, 900000, '9']);
  // a ledger that cannot be read stops the build and is left as it was
  writeFileSync(join(data, 'ledger.json'), '{"v":1,"items":{"yahoo:y1":');
  assert.throws(() => run('2026-10-04'));
  assert.equal(readFileSync(join(data, 'ledger.json'), 'utf8'), '{"v":1,"items":{"yahoo:y1":');
  ok('build: first mail, same-day re-run, first reading of a source, other currencies, a broken ledger');
}

// ── the second review's cases ────────────────────────────────────────────
{
  // results that fit on one page are a complete reading
  const one = Array.from({ length: 20 }, (_, i) => '<a href="https://item.fril.jp/' + String(i).padStart(32, 'a') + '">CCP drip boots ' + i + '</a> ¥1,000').join('');
  assert.equal((await collect(S.rakuma, () => {}, async () => one)).complete, true);
  // a small source that sold two of six: a market, not a reading — they go after two misses
  const rates = { USD: 1370, GBP: 1852, EUR: 1587, JPY: 873 };
  const R = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: 'rakuma:' + (from + i), url: 'https://item.fril.jp/' + (from + i), title: 'CAROL CHRISTIAN POELL シャツ ' + (from + i), price: 10000, cur: 'JPY' }));
  const ok = { sources: { rakuma: { ok: true, complete: true } } };
  let L = { items: {}, state: {} };
  updateLedger(L, { rakuma: { items: R(6) } }, ok, rates, '2026-10-01', {});
  let st = updateLedger(L, { rakuma: { items: R(4) } }, ok, rates, '2026-10-02', { rakuma: '2026-10-01' });
  assert.deepEqual(st.held, []); assert.equal(L.items['rakuma:5'].miss, 1);
  updateLedger(L, { rakuma: { items: R(4) } }, ok, rates, '2026-10-03', { rakuma: '2026-10-02' });
  assert.equal(L.items['rakuma:5'].gone, '2026-10-03'); assert.equal(L.items['rakuma:3'].gone, null);
  // half of thirty missing at once: held, with its baseline, for three days — then taken as it is
  L = { items: {}, state: {} };
  updateLedger(L, { rakuma: { items: R(30) } }, ok, rates, '2026-10-01', {});
  for (const d of ['2026-10-02', '2026-10-03', '2026-10-04']) {
    st = updateLedger(L, { rakuma: { items: R(15) } }, ok, rates, d, { rakuma: '2026-10-01' });
    assert.deepEqual(st.held, ['rakuma'], d); assert.equal(L.items['rakuma:20'].gone, null, d);
  }
  st = updateLedger(L, { rakuma: { items: R(15) } }, ok, rates, '2026-10-05', { rakuma: '2026-10-01' });
  assert.deepEqual(st.held, []); assert.equal(L.items['rakuma:20'].miss, 1);
  // a full page read badly is still a full page: its links say how long it was
  const bad = Array.from({ length: 50 }, (_, i) => '<a href="/jp/auction/x5' + String(i).padStart(6, '0') + '">CCP drip boots ' + i + '</a>' + (i < 37 ? ' 1,000円' : ' —')).join('');
  const more = await collect({ ...S.yahoo_auctions, queries: ['carol christian poell'] }, () => {}, async (u) => (new URL(u).searchParams.get('b') ? '<a href="/jp/auction/x6000001">CCP drip boots z</a> 1,000円' : bad));
  assert.equal(more.pagesRead.length, 2); assert.equal(more.complete, true);
  assert.equal(more.linked.length, 51); assert.ok(more.linked.includes('yahoo:x5000049'));
  {
    // and a listing whose card lost its price stays on the ledger as seen
    const rates = { USD: 1370, GBP: 1852, EUR: 1587, JPY: 873 }, L = { items: {}, state: {} };
    const Y = Array.from({ length: 10 }, (_, i) => ({ id: 'yahoo:u' + i, url: 'https://auctions.yahoo.co.jp/jp/auction/u' + i, title: 'CAROL CHRISTIAN POELL シャツ ' + i, price: 1000, cur: 'JPY' }));
    const ok = { sources: { yahoo_auctions: { ok: true, complete: true } } };
    updateLedger(L, { yahoo_auctions: { items: Y, linked: Y.map((x) => x.id) } }, ok, rates, '2026-10-01', {});
    for (const d of ['2026-10-02', '2026-10-03']) updateLedger(L, { yahoo_auctions: { items: Y.slice(0, 7), linked: Y.map((x) => x.id) } }, ok, rates, d, { yahoo_auctions: '2026-10-01' });
    assert.equal(L.items['yahoo:u9'].gone, null); assert.equal(L.items['yahoo:u9'].last, '2026-10-03');
  }
  assert.equal(classify({ title: 'Carol Christian Poell coat 2000 euros' }).tier, 'C');
  for (const t of ['キャロルクリスチャンポエル ブーツ 専用シューキーパー付き', 'CAROL CHRISTIAN POELL バッグ 専用ダストバッグ付き', 'キャロルクリスチャンポエル 専用紙袋']) assert.equal(classify({ title: t }).exclude, undefined, t);
  // 専用 is reserved unless it names an accessory; a negation covers only its own word; years survive the cleaning
  const C = (t) => { const x = classify({ title: t }); return x.exclude ? 'x:' + x.exclude : x.tier + (x.era ? ' ' + x.era : ''); };
  for (const t of ['【たろう専用】CAROL CHRISTIAN POELL ブーツ', 'CAROL CHRISTIAN POELL ブーツ たろう専用', 'CAROL CHRISTIAN POELL ブーツ 専用です']) assert.equal(C(t), 'x:reserved', t);
  assert.equal(C('CAROL CHRISTIAN POELL レプリカ ブーツ 本物ではありません'), 'x:fake');
  assert.equal(C('キャロルクリスチャンポエル ブーツ 偽物ではありません'), 'C');
  for (const [t, e] of [['CAROL CHRISTIAN POELL 送料無料 2004AW ジャケット', 'A AW04'], ['CAROL CHRISTIAN POELL MILANO 2004AW', 'A AW04'],
    ['CCP #2004AW coat', 'A AW04'], ['CAROL CHRISTIAN POELL 2004 ¥98,000', 'A 2004'], ['Carol Christian Poell 2003 $1,200', 'A 2003']]) assert.equal(C(t), e, t);
}
{
  // a ledger that parses but holds fewer than the last build kept is not overwritten
  const dir = mkdtempSync(join(tmpdir(), 'ccp-')), data = join(dir, 'data'), raw = join(data, 'raw');
  mkdirSync(raw, { recursive: true });
  writeFileSync(join(data, 'rates.json'), JSON.stringify({ USD: 1370, GBP: 1852, EUR: 1587, JPY: 873, date: '2026-09-26' }));
  const run = (day) => execFileSync(process.execPath, [new URL('./build.mjs', import.meta.url).pathname], {
    env: { ...process.env, CCP_OFFLINE: '1', CCP_TODAY: day, CCP_DATA: data, CCP_SITE: join(dir, 'site') }, encoding: 'utf8', stdio: 'pipe' });
  const Y = (n) => Array.from({ length: n }, (_, i) => ({ id: 'yahoo:z' + i, url: 'https://auctions.yahoo.co.jp/jp/auction/z' + i, title: 'CAROL CHRISTIAN POELL シャツ #' + i, price: 1000, cur: 'JPY' }));
  // day 1: every source failed — nothing to send, and the first mail waits for a day with listings
  writeFileSync(join(raw, '_summary.json'), JSON.stringify({ sources: { yahoo_auctions: { ok: false, error: 'HTTP 500' } } }));
  run('2026-10-01');
  let meta = JSON.parse(readFileSync(join(data, 'mail_meta.json'), 'utf8')); assert.deepEqual([meta.first, meta.send], [true, false]);
  writeFileSync(join(raw, 'yahoo_auctions.json'), JSON.stringify({ items: Y(6) }));
  writeFileSync(join(raw, '_summary.json'), JSON.stringify({ sources: { yahoo_auctions: { ok: true, complete: true } } }));
  run('2026-10-02');
  meta = JSON.parse(readFileSync(join(data, 'mail_meta.json'), 'utf8')); assert.deepEqual([meta.first, meta.send], [true, true]);
  writeFileSync(join(data, 'ledger.json'), JSON.stringify({ v: 1, items: {}, state: {} }));
  assert.throws(() => run('2026-10-03'));
  ok('second review: one-page results, small-source hold, 専用, negations, years, a short ledger, the first mail');
}

// ── the page and the pipeline agree ──────────────────────────────────────
{
  const tpl = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
  assert.ok(tpl.includes('/*__DATA__*/'));
  assert.equal(/'hlx\./.test(tpl), false, 'the Helmut Lang index keys are its own');
  const cats = /var CATORDER=\[([^\]]+)\]/.exec(tpl)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const { SECTIONS } = await import('./classify.mjs');
  assert.deepEqual([...cats].sort(), [...SECTIONS].sort(), 'categories: page and pipeline');
  for (const f of Object.keys(FILES)) assert.ok(FILES[f].name && FILES[f].kind);
  ok('template: slot, storage keys, categories');
}

// ── the first live reading (2026-09-28): Rakuma's cards, Mercari's cards, a same-day re-read ──
{
  // Rakuma's card, as its search page builds it (ids and figures made up here)
  const card = (id, name, label, price, sold) => '<div class="item"><div class="item-box"><div class="item-box__image-wrapper">' +
    '<a href="https://item.fril.jp/' + id + '" class="link_search_image" title="' + name + ' ' + label + '" ' +
    'data-rat-item_name="' + name + '" data-rat-brand="Carol Christian Poell" data-rat-price="' + price + '">' +
    '<img src="https://asset.fril.jp/assets/new_web/item_square_dummy-e093.png" data-original="https://img.fril.jp/img/' + price + '/m/1.jpg?1" class="img-responsive lazy" alt="キャロルクリスチャンポエル(Carol Christian Poell)の' + name + '">' +
    '<noscript><img src="https://img.fril.jp/img/' + price + '/m/1.jpg?1"></noscript>' + (sold ? '<div class="item-box__soldout_ribbon">SOLD OUT</div>' : '') +
    '</a></div><div class="item-box__text-wrapper"><div class="item-box__item-sub-name"><a href="/brand/2224" class="brand-name">Carol Christian Poell</a></div>' +
    '<div class="item-box__item-name"><a href="https://item.fril.jp/' + id + '"><span>' + name + '</span></a></div>' +
    '<div class="item-box__item-price"><span>¥</span><span>' + Number(price).toLocaleString('en-US') + '</span></div></div></div></div>';
  const shoes = 'キャロルクリスチャンポエル(Carol Christian Poell)のメンズの靴/シューズ(スニーカー)の商品詳細ページへのリンク';
  const jacket = 'キャロルクリスチャンポエル(Carol Christian Poell)のレディースのジャケット/アウター(レザージャケット)の商品詳細ページへのリンク';
  const html = card('0123456789abcdef0123456789abcdef', 'Carol Christian Poell スニーカー　サイズ10', shoes, 170000, true) +
               card('fedcba9876543210fedcba9876543210', '参考上代1082400円 Carol Christian Poell HIGH NECK 46（16394M）', jacket, 298000, false);
  const got = listingsFrom(html, S.rakuma.spec);
  assert.equal(got.length, 2);
  const [a, b] = got;
  assert.equal(a.title, 'Carol Christian Poell スニーカー サイズ10'); assert.equal(a.price, 170000);
  assert.equal(a.img, 'https://img.fril.jp/img/170000/m/1.jpg?1'); assert.equal(a.sold, true); assert.equal(a.brandTagged, true);
  assert.equal(a.cat, '靴/シューズ(スニーカー)');
  assert.equal(b.price, 298000, 'the retail figure in the title is not the price'); assert.equal(b.sold, undefined);
  assert.equal(b.title, '参考上代1082400円 Carol Christian Poell HIGH NECK 46（16394M）'); assert.equal(b.cat, 'ジャケット/アウター(レザージャケット)');
  // the screen-reader words come off a label that has no name beside it, and the size before them stays
  assert.equal(unlinked('Carol Christian Poell HIGH NECK 46（16394M）' + jacket), 'Carol Christian Poell HIGH NECK 46（16394M）');
  assert.equal(unlinked('CCP Prosthetic Boots ノーブランドのメンズの靴/シューズ(ブーツ)の商品詳細ページへのリンク'), 'CCP Prosthetic Boots');
  assert.equal(unlinked('Carol Christian Poell boots 9'), 'Carol Christian Poell boots 9');
  // the category the seller chose speaks only where the title says nothing
  assert.equal(classify({ title: 'Carol Christian Poell High Neck', cat: 'ジャケット/アウター(レザージャケット)' }).section, '아우터');
  assert.equal(classify({ title: 'Carol Christian Poell High Neck' }).section, '기타');
  assert.equal(classify({ title: 'Carol Christian Poell drip boots', cat: 'ジャケット/アウター(その他)' }).section, '신발');
  assert.equal(classify({ title: 'Carol Christian Poell 極上カットソー 44', cat: 'トップス(Tシャツ/カットソー(七分/長袖))' }).section, '상의');
  // Mercari's card, as the drawn page shows it
  const m1 = mercariCard({ href: '/item/m45109765100', name: 'carol christian poell ブーツ', price: '¥50,000', alt: 'carol christian poell ブーツのサムネイル',
                           img: 'https://static.mercdn.net/thumb/item/webp/m45109765100_1.jpg?1', text: '¥\n50,000\n\ncarol christian poell ブーツ' });
  assert.deepEqual(m1, { id: 'mercari:m45109765100', url: 'https://jp.mercari.com/item/m45109765100', title: 'carol christian poell ブーツ', price: 50000,
                         cur: 'JPY', img: 'https://static.mercdn.net/thumb/item/webp/m45109765100_1.jpg?1' });
  const m2 = mercariCard({ href: '/shops/product/AbCdEfGhIjKlMnOpQrSt', name: '', price: '', alt: 'CCP レザージャケット 48のサムネイル', img: '', text: '¥\n128,000\nCCP レザージャケット 48' });
  assert.equal(m2.url, 'https://jp.mercari.com/shops/product/AbCdEfGhIjKlMnOpQrSt'); assert.equal(m2.title, 'CCP レザージャケット 48'); assert.equal(m2.price, 128000);
  assert.equal(mercariCard({ href: '/item/m45109765100', name: 'CCP', price: '' , text: 'no price' }), null);
  assert.equal(mercariCard({ href: '/search?keyword=x', name: 'CCP boots', price: '¥1,000' }), null);
  assert.equal(mercariUrl('キャロルクリスチャンポエル', 2), 'https://jp.mercari.com/search?keyword=%E3%82%AD%E3%83%A3%E3%83%AD%E3%83%AB%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%81%E3%83%A3%E3%83%B3%E3%83%9D%E3%82%A8%E3%83%AB&status=on_sale&page_token=v1%3A2');
  // a second reading on the same day corrects that day's price; the day after is compared as usual
  const rates = { USD: 1370, JPY: 9.1 };
  const L = { v: 1, items: {}, state: {} };
  const r = (price) => ({ rakuma: { items: [{ id: 'rakuma:x1', url: 'https://item.fril.jp/x1', title: 'CAROL CHRISTIAN POELL HIGH NECK LEATHER JACKET 46', price, cur: 'JPY' }] } });
  const okR = { sources: { rakuma: { ok: true, complete: true, kept: 1 } } };
  updateLedger(L, r(1082400), okR, rates, '2026-09-28');
  let st = updateLedger(L, r(298000), okR, rates, '2026-09-28');
  assert.equal(st.drops, 0); assert.equal(L.items['rakuma:x1'].h.length, 1); assert.equal(L.items['rakuma:x1'].p, 298000);
  assert.equal(L.items['rakuma:x1'].h[0][2], 298000); assert.equal(L.items['rakuma:x1'].k, toKRW(298000, 'JPY', rates));
  st = updateLedger(L, r(280000), okR, rates, '2026-09-29', { rakuma: '2026-09-28' });
  assert.equal(st.drops, 1); assert.equal(L.items['rakuma:x1'].h.length, 2);
  const P = buildPayload(L, { v: 1, items: {} }, rates, okR, { day: '2026-09-29', issue: 2 });
  const o = P.items.find((x) => x.l.endsWith('x1'));
  assert.equal(o.w, toKRW(298000, 'JPY', rates), 'the cut is measured from the corrected figure');
  // filed under the label by a seller: another house named in the title, or nothing said at all
  for (const t of ['HED MAYNER ヘドメイナー 25SS SLEEVELESS T-SHIRT XS', 'ISHINN calf leather blouson jacket イシン', 'ルーメンエトウンブラ パンツ 春夏',
                   'VALENTINO ヴァレンティノ LOGO TEE L WHITE'])
    assert.equal(classify({ title: t, brandTagged: true }).exclude, 'other-brand', t);
  assert.equal(classify({ title: 'LP Chanson De Paris 35 EOS40010PROMO ODEON プロモ', brandTagged: true }).exclude, 'no-brand');
  for (const t of ['LOW CROTCH DEADEND FLY TROUSERS', 'Paper Dart Combat Boots', 'Object Dyed Drip Rubber', 'Unlined Meltlocked 1 Button Jacket',
                   'JM/2568-IN KIT-BW/101 데드엔드 데님 자켓', 'Wool wrap skirt 40'])
    assert.equal(classify({ title: t, brandTagged: true }).exclude, undefined, t);
  assert.equal(classify({ title: 'Wool 40', brandTagged: true, cat: 'パンツ(スラックス)' }).section, '팬츠');
  assert.equal(classify({ title: 'Carol Christian Poell like Helmut Lang coat' }).exclude, undefined);
  // the review of Issue 001: dress trousers are trousers, ブレーザー is a blazer, button-ups are shirts,
  // a high-neck leather is the jacket; PREAMITA and Caroll are other houses
  const sec = (t) => classify({ title: t, brandTagged: true });
  assert.equal(sec('CAROL CHRISTIAN POELL PM/2219 ASA/8 Dress Pants ドレスパンツ').section, '팬츠');
  assert.equal(sec('90年代 CAROL CHRISTIAN POELL A/W 96-97 ブレーザー').section, '테일러링');
  assert.equal(sec('S/S2007 Carol Chrstian Poell -Button Ups').section, '셔츠');
  assert.equal(sec('CAROL CHRISTIAN POELL ハイネックレザー').section, '아우터');
  assert.equal(sec('Carol Christian Poell High Neck knit').section, '상의');
  assert.equal(sec('Carol Christian Poell dress').section, '기타'); assert.equal(sec('Carol Christian Poell dress shoes').section, '신발');
  assert.equal(sec('PREAMITA WHITEのレザーブーツ キャロルクリスチャンポエル').exclude, 'other-brand');
  assert.equal(sec('【Caroll】フランス製テーラードジャケット').exclude, 'other-brand');
  // the workflow's browser step serves Mercari as well as Grailed
  assert.equal(S.mercari_jp.browser, true);
  ok('first live reading: Rakuma cards, Mercari cards, same-day correction');
}

console.log('test: ' + n + ' groups pass');
