// Reading a Carol Christian Poell listing title — Japanese, Korean or English.
// Every decision rests on words that are in the title. Nothing is guessed.
//
//   tier A  one year or season is written        2009 · SS97 · 07SS · AW2002 · 02fw · P/E 2002 · 96〜97AW
//   tier B  the seller names a period, not one year
//           1990s · 90s · 00s · 1990年代 · 96-97 · 00-01 · 2008-9 · 初期 · 極初期 · archive · アーカイブ
//   tier C  nothing to go on
//
// Excluded — not a Carol Christian Poell listing, or not one you can buy:
//   no-brand     the title does not name the label (search pages also match
//                descriptions); a brand page, or a listing whose own page names
//                the brand, is exempt
//   other-brand  another label is named before this one: "Paul Harnden …
//                キャロルクリスチャンポエル guidi ziggy chen" is a Paul Harnden
//                listing with neighbours' names added for search
//   not-brand    ブランド不明 · 元ネタ · 元キャロル クリスチャン ポエル (a former
//                assistant's own label) · ポエル期 (another maker's shoes)
//   style-of     キャロルクリスチャンポエル風 · 系 · 好き · st · 스타일 · inspired
//   reserved     専用 · 様へ — held for one named buyer
//   wanted       구매) · 구해요 · WTB — someone asking to buy
//   rental       렌탈 · レンタル
//   fake         レプリカ · replica · 가품
//
// Before any number is read as a year, the title is cleared of the numbers
// that are not years: prices (定価612.700円 · 参考上代998800円 · ¥19,800),
// model codes (AM/2601L · PM1278 · MM 2145 · T/1644-REN · 2687P · GM/2656OD-IN),
// reference and shop numbers (REF.N 0362 · (16394M)), labelled sizes
// (size 10-11), durations, imperial dates.

const nk = (s) => { try { return String(s ?? '').normalize('NFKC'); } catch { return String(s ?? ''); } };
export const FIRST_YEAR = 1995;                        // the label's first season (Grailed: founded 1995, Milan)
export const lastYear = () => new Date().getUTCFullYear() + 1;   // next season can already be on sale
const inEra = (y) => y >= FIRST_YEAR && y <= lastYear();
const yy = (n) => (n >= 90 ? 1900 + n : 2000 + n);      // 90..99 → 19xx, 00..89 → 20xx
const full = (s) => (String(s).length === 4 ? Number(s) : yy(Number(s)));

// ── the brand ─────────────────────────────────────────────────────────────
// Carol Christian Poell and how it is misspelt (Chiristia · ChrisEan · Poel ·
// CAROL CHRISTIANPOELL · carolchristianpoell), キャロル(クリスチャン)ポエル,
// 캐롤 크리스찬/크리스챤 포엘, and CCP / C.C.P as a word of its own.
const B_EN = 'carol[\\s._\\-]*ch[a-z]{2,9}[\\s._\\-]*poel{1,2}(?![a-z])';
const B_JA = 'キャロル\\s*[・･]?\\s*(?:クリスチャン\\s*[・･]?\\s*)?ポエル';
const B_KO = '캐롤\\s*(?:크리스[찬챤]\\s*)?(?:포엘|포웰)';
const B_CCP = '(?<![a-z0-9])c\\.?c\\.?p(?![a-z0-9])';
const BRANDW = '(?:' + [B_EN, B_JA, B_KO, B_CCP].join('|') + ')';
const BRAND = new RegExp(BRANDW, 'i');
export const hasBrand = (title) => BRAND.test(nk(title));
const brandAt = (t) => { const m = BRAND.exec(t); return m ? m.index : -1; };

// the neighbours sellers add to a title for search, and labels that turn up in
// this brand's search results. Only a name written BEFORE the brand's decides.
const OTHER = new RegExp('(?:' + [
  'paul\\s*harnden', 'ポール\\s*ハーデン', 'guidi', 'グイディ', 'john\\s*alexander\\s*skelton', 'geoffrey\\s*b\\.?\\s*small',
  'ziggy\\s*chen', '(?<![a-z0-9])m\\s*\\.?\\s*a\\s*\\+', 'ma[\\s_]*julius', 'エムエークロス', 'maクロス', 'carpe\\s*diem',
  '(?<![a-z])c[\\s-]?diem', 'カルペディエム', 'label\\s*under\\s*construction', 'レーベルアンダー', 'boris\\s*bidjan', 'ボリス\\s*ビジャン',
  '11\\s*by\\s*bbs', 'rick\\s*owens', 'リック\\s*オウエンス', 'devoa', 'デヴォア', 'isaac\\s*sellam', 'アイザック\\s*セラム',
  'incarnation', 'インカネーション', 'a\\s*diciannoveventitre', '(?<![a-z0-9])a1923', 'premiata', 'プレミアータ', 'margiela',
  'マルジェラ', 'werkschwarz', 'ヴェルクシュヴァルツ', 'poeme\\s*bohemien', 'ポエムボヘミアン', 'ematyte', 'エマタイト',
  'gaultier', 'ゴルチエ', 'demeulemeester', 'ドゥムルメステール', 'renato\\s*angi', 'deepti', 'ディプティ', 'oppose\\s*duality',
  'layer[\\s-]*0', 'レイヤーゼロ', 'julius', 'ユリウス', 'christian\\s*peau', 'casey\\s*casey', 'toogood', 'archivio\\s*j',
  'm[_\\s]?moriabc', 'nostrasantissima', 'yohji', 'ヨウジ', 'individual\\s*sentiments', 'インディビジュアル', 'isabel\\s*benenato',
  'manamis', 'branquinho', 'yohan\\s*serfaty', 'nicolas\\s*&\\s*mark', 'd\\s*&\\s*g(?![a-z])', 'dolce\\s*&?\\s*gabbana',
  'atelier\\s*suppan', 'damir\\s*doma', 'van\\s*essche', 'masnada', 'officine\\s*creative', 'hadjab', 'hi\\s*tek\\s*designs',
  'greg\\s*lauren', 'sandrine\\s*philippe', 'rogosky', 'viridi[\\s-]*anne', 'ヴァリジアン', 'cinzia\\s*araia', 'gomme', 'shellac',
  'somar', 'ute\\s*ploier', 'morgan\\s*homme', 'ripvanwinkle', 'bajra', 'gabriela\\s*coll', 'parts\\s*of\\s*four', 'tacet',
  'morizane', 'nousan', 'christian\\s*roth', 'クリスチャンロス', 'at(?:e)?lier\\s*inscrire', 'taichi\\s*murakami',
  'leon\\s*emanuel\\s*blanck', 'jacquemyn', 'forme\\s*d.?expression', 'uma\\s*wang', 'portaille', 'giorgio\\s*brato',
  // found under Rakuma's Carol Christian Poell label on the first live reading (2026-09-28)
  'preamita', 'caroll(?![\\s._\\-]*ch)', 'hed\\s*mayner', 'ヘドメイナー', 'ishinn', 'イシン', 'lumen\\s*et\\s*umbra', 'ルーメン\\s*エト\\s*ウンブラ', 'valentino', 'ヴァレンティノ',
  'helmut\\s*lang', 'ヘルムート\\s*ラング', 'raf\\s*simons', 'ラフ\\s*シモンズ', 'haider\\s*ackermann', 'ハイダー\\s*アッカーマン',
].join('|') + ')', 'i');
// "like new" and "type-2" are not "in the style of"; "Style AM/2601L" is a style number
const STYLE_OF = new RegExp(BRANDW + '\\s*(?:の)?\\s*(?:風|系|っぽい|ライク|好き|スタイル|st\\b|스타일|느낌|풍(?!성)|[\\s-]*(?:inspired|esque)\\b' +
  '|[\\s-]*style\\b(?!\\s*(?:no\\.?|#|number|code|[A-Z]{1,2}\\s?[\\/\\-]?\\s?\\d{4})))' +
  '|(?:style|inspired)\\s+(?:of|by)\\s+' + BRANDW, 'i');
const NOT_BRAND = new RegExp('ブランド不明|ノーブランド|no\\s*brand|元ネタ|元\\s*' + BRANDW + '|(?<!キャロル\\s*(?:クリスチャン)?\\s*)ポエル期', 'i');
// held for a named buyer — not 専用ケース付き (comes with its own case)
const RESERVED = /(?:様|さま|さん|くん|ちゃん)\s*へ|専用(?!\s*(?:袋|紙袋|箱|ケース|ハンガー|バッグ|ダストバッグ|ポーチ|カバー|保存|シュー|ボックス|box|タグ|ソール|ツリー|ガーメント|キーパー|クリーナー|ケア|布|ショッパー))|取り置き/i;
const WANTED = /^\s*[\[(【]?\s*(?:구매|구함|구해요|삽니다|wtb)\s*[\])】:]|구해요|구합니다|삽니다|\bwtb\b|want\s*to\s*buy|求む|探しています/i;
const RENTAL = /렌탈|렌트(?![가-힣])|レンタル|\brental\b/i;
const FAKE = /レプリカ|replica|偽物|コピー品|(?<![a-z])fake(?![a-z])|가품|레플리카|이미테이션|짝퉁/i;
// "not fake", "가품 시 환불", "fake fur": a seller vouching, or a material
// removed from the title before FAKE is asked, so each negation covers only its own word
const NOT_FAKE = /not\s*(?:a\s*)?fake|no\s*fake|fake\s*(?:fur|leather|suede|pocket|layer|collar)|가품\s*(?:시|x|아님|일\s*(?:경우|시)|이면|판정|보장|절대)|\(\s*가품\s*x\s*\)|偽物\s*(?:では|じゃ)(?:ない|ありません)/gi;

export function excludeReason(title, { brandPage = false } = {}) {
  const t = nk(title);
  const at = brandAt(t);
  if (at < 0 && !brandPage) return 'no-brand';
  if (NOT_BRAND.test(t)) return 'not-brand';
  const o = OTHER.exec(t);
  if (o && (at < 0 || o.index < at)) return 'other-brand';
  if (STYLE_OF.test(t)) return 'style-of';
  if (RESERVED.test(t)) return 'reserved';
  if (WANTED.test(t)) return 'wanted';
  if (RENTAL.test(t)) return 'rental';
  if (FAKE.test(t.replace(NOT_FAKE, ' '))) return 'fake';
  return null;
}

// ── model codes ───────────────────────────────────────────────────────────
// AM/2601L · PM1278 · CM/1716B · GM/2656OD-IN · KM/2629-IN · MM 2145 · LM 2699 ·
// T/1644-REN · and a bare 2687P. Written short in one form (AM/2601L) so the
// same garment finds itself across spellings; never read as a year.
const CODE = /(?<![A-Za-z0-9])([A-Z]M|T(?=\s?\/))\s?[\/\-._]?\s?(\d{4})(OD|SP|[LPBC](?![A-Z]))?/gi;
const BARE = /(?<![A-Za-z0-9\/])(\d{4})(OD|SP|[LPBC])(?![A-Za-z0-9])/gi;
export function codesOf(title) {
  const t = nk(title), out = [];
  for (const m of t.matchAll(CODE)) out.push((m[1].toUpperCase()) + '/' + m[2] + (m[3] ? m[3].toUpperCase() : ''));
  for (const m of t.matchAll(BARE)) {
    const c = m[1] + m[2].toUpperCase();
    if (!out.some((x) => x.endsWith('/' + c) || x.split('/')[1] === m[1])) out.push(c);
  }
  return [...new Set(out)];
}
export const codeNum = (c) => ((/(\d{4})/.exec(c || '') || [])[1] || null);

// ── what the seller said instead of a year ────────────────────────────────
//  kind  label           rank (lower wins)
//  bought 2003년 구입      1   a purchase year dates the purchase, not the garment
//  about  1999년 무렵      1   頃 · ごろ · 前後 · 쯤 · circa · c. · early/late 2000
//  rng    1996–97         1   a span of years
//  multi  1998 · 1999     1   two different years in one title
//  dec    1990년대 (후반)   2   1990s · 90's · 00s · 90年代(後半) · 2010s
//  y2k    Y2K             2
//  early  초기             3   初期 · 極初期 · 초기
//  arch   아카이브          4   archive · archival · アーカイブ · 아카이브
const ARCH = /アーカイブ|archiv(?:e|al)|아카이브/i;
const EARLY = /初期|초기|\bearly\s+(?:piece|period|era|collection|work)/i;
const QUAL = { early: '초반', mid: '중반', late: '후반', '前半': '초반', '初頭': '초반', '中頃': '중반', '後半': '후반', '末': '후반' };
const AP = "['’‘]?";

// the numbers in a title that are not years, cut before anything is read
function clean(t) {
  return t
    .replace(/(?:定価|정가|retail|rrp|msrp|参考上代|上代|원가|送料込み?|送料無料)\s*[:：]?\s*[¥￥$₩£€]?\s*\d[\d,.]*(?![\d,.])(?!\s*(?:ss|aw|fw|a\/w|s\/s|年|년|'))\s*(?:円|원|엔)?/gi, ' ')
    .replace(/[¥￥$₩£€]\s*[\d,]+(?:\.\d+)?|[\d,.]+\s*(?:円|원|엔|yen|usd|krw|eur(?:os?)?|gbp|jpy|dollars?|pounds?|ドル|달러|유로)(?![a-z])|[\d,.]+[€$£¥￥₩]/gi, ' ')
    .replace(/(?:\bno\.?|品番|管理番号|商品番号)\s*\d+/gi, ' ')
    .replace(CODE, ' ').replace(BARE, ' ')
    .replace(/\bref\.?\s*n?[o°]?\.?\s*\d+/gi, ' ')
    .replace(/\(\s*\d{4,6}[A-Z]\s*\)|(?<![A-Za-z0-9])\d{5,}[A-Z]?(?![A-Za-z0-9])/g, ' ')
    .replace(/(?:size|サイズ|사이즈|sz)\s*[:：.]?\s*\d{1,3}(?:\.\d)?(?:\s*[-~〜\/]\s*\d{1,3}(?:\.\d)?)?/gi, ' ')
    .replace(/\d+\s*(?:年|년)\s*(?:以上|以前|ほど|程|くらい|ぐらい|間|近く|ぶり|前|物|保管|使用|着用|愛用|전|이상|정도|넘게|간|된|동안|착용|사용|보관)/g, ' ')
    .replace(/(?:平成|昭和|令和)\s*\d+\s*年/g, ' ')
    .replace(/(?<![a-z0-9])s\/s\s*[-.]?\s*(?:3\d|4\d|5\d)(?!\d)|(?<!\d)(?:3\d|4\d|5\d)\s*[-.]?\s*s\/s(?![a-z])/gi, ' ');
}

export function era(title) {
  let t = clean(nk(title));
  const claims = [];
  const say = (k, v, rank) => claims.push({ k, v, rank });
  if (EARLY.test(t)) say('early', '초기', 3);
  if (ARCH.test(t)) say('arch', '아카이브', 4);
  const cut = (re, fn) => { t = t.replace(re, (...m) => { if (fn) fn(...m); return ' '; }); };

  cut(/(?<!\d)((?:19|20)?\d{2})\s*(?:年|년)?\s*(?:[^\s\d]{0,6})?\s*(?:購入|구입)/g, (m, y) => { if (inEra(full(y))) say('bought', full(y) + '년 구입', 1); });
  cut(/\b(?:bought|purchased|acquired)\b[^0-9]{0,12}((?:19|20)\d{2})(?!\d)/gi, (m, y) => { if (inEra(+y)) say('bought', y + '년 구입', 1); });

  const years = new Set(), seasons = [];
  // a fall/winter season runs across two years: 05-06AW · AW 2000/2001 · 97-98 A/W · A/W '98-'99 · 96〜97AW
  const SAW = '(a\\/?w|f\\/?w|a\\/i|秋冬|fall|winter)';
  const Y2 = "'?((?:19|20)?\\d{2})";
  t = t.replace(new RegExp('(?<!\\d)' + Y2 + '\\s*[-‐‑〜~～–/]\\s*' + Y2 + '\\s*' + SAW + '|' + SAW + '\\s*' + Y2 + '\\s*[-‐‑〜~～–/]\\s*' + Y2 + '(?!\\d)', 'gi'),
    (m, a1, b1, s1, s2, a2, b2) => { const a = a1 || a2, b = b1 || b2, w = (s1 || s2).toLowerCase();
      if (full(b) !== full(a) + 1 || !inEra(full(a))) return m;
      seasons.push([/^f\/?w$/.test(w) ? 'FW' : 'AW', Number(String(a).slice(-2))]);
      return ' '; });
  // any other span: the seller does not say which year
  const span = (m, a, b) => {
    const y1 = full(a);
    let y2;
    if (b.length === 1) { y2 = Math.floor(y1 / 10) * 10 + Number(b); if (y2 <= y1) y2 += 10; }
    else y2 = full(b);
    if (inEra(y1) && inEra(y2) && y2 > y1 && y2 - y1 <= 12) {
      const tail = b.length === 4 ? b : String(y2).slice(-2);
      say('rng', y1 + '–' + tail, 1); return ' '; }
    return m; };
  t = t.replace(/(?<!\d)((?:19|20)?\d{2})\s*[〜~～\-‐‑–—]\s*((?:19|20)?\d{2})(?!\d)/g, span);
  t = t.replace(/(?<!\d)((?:19|20)\d{2})\s*[\-‐‑–—〜~～]\s*(\d)(?!\d)/g, span);            // 2008‐9
  t = t.replace(/(?<!\d)((?:19|20)\d{2})\s*\/\s*((?:19|20)?\d{2})(?!\d)/g, span);          // 1998/99

  // decades: an era, not a year. 1990s · 90's · 00s · 2000s · 2010s · 90年代後半
  cut(new RegExp('\\b(?:(early|mid|late)[\\s-]*)?(?<!\\d)((?:19)?90|(?:20)?00|2010)\\s*' + AP + '\\s*s\\b(?!\\s*\\/\\s*s)', 'gi'),
      (m, q, d) => say('dec', (d.length === 4 ? d : d === '00' ? '2000' : '1990') + '년대' + (q ? ' ' + QUAL[q.toLowerCase()] : ''), 2));
  cut(/(?<!\d)((?:19)?90|(?:20)?00|2010)\s*(?:年代|년대)\s*(前半|初頭|中頃|後半|末)?/g,
      (m, d, q) => say('dec', (d.length === 4 ? d : d === '00' ? '2000' : '1990') + '년대' + (q ? ' ' + QUAL[q] : ''), 2));
  cut(/\by2k\b/gi, () => say('y2k', 'Y2K', 2));
  cut(/(?<!\d)((?:19|20)?\d{2})\s*(?:年|년)?\s*(?:頃|ごろ|前後|쯤|경)(?![가-힣])/g, (m, y) => { if (inEra(full(y))) say('about', full(y) + '년 무렵', 1); });
  cut(/(?:\bcirca|\bca\.?|\bc\.)\s*((?:19|20)\d{2})(?!\d)/gi, (m, y) => { if (inEra(+y)) say('about', y + '년 무렵', 1); });
  cut(/\b(?:early|mid|late)[\s-]*((?:19|20)\d{2})(?!\d)/gi, (m, y) => { if (inEra(+y)) say('about', y + '년 무렵', 1); });

  // seasons, Latin: SS97 · S/S97 · FW 02 · AW'99 · P/E 2002 · 2006SS · 07SS · 02fw · 25AW
  const S = '(a\\/?w|f\\/?w|s\\/?s|p\\/e|a\\/i|sp|ss|aw|fw)';
  for (const m of t.matchAll(new RegExp('(?<![a-z0-9])' + S + "\\s*[-./]?\\s*'?(\\d{2})(?!\\d)", 'gi'))) seasons.push([m[1], Number(m[2])]);
  for (const m of t.matchAll(new RegExp('(?<![a-z0-9])' + S + '\\s*[-./]?\\s*((?:19|20)\\d{2})(?!\\d)', 'gi'))) seasons.push([m[1], Number(m[2].slice(2))]);
  for (const m of t.matchAll(new RegExp('(?<!\\d)((?:19|20)\\d{2})\\s*[-./]?\\s*' + S + '(?![a-z])', 'gi'))) seasons.push([m[2], Number(m[1].slice(2))]);
  for (const m of t.matchAll(new RegExp("(?<![\\d])'?(\\d{2})\\s*[-.]?\\s*" + S + '(?![a-z])', 'gi'))) seasons.push([m[2], Number(m[1])]);
  // seasons, Japanese: 99春夏 · 03秋冬 · 1999秋冬
  for (const m of t.matchAll(/(?<!\d)(?:19|20)?(\d{2})\s*(春夏|秋冬)/g)) seasons.push([m[2] === '春夏' ? 'SS' : 'AW', Number(m[1])]);
  // four-digit years, '99, 99年
  for (const m of t.matchAll(/(?<!\d)(199\d|20[0-3]\d)(?!\d)/g)) { const y = Number(m[1]); if (inEra(y)) years.add(y); }
  for (const m of t.matchAll(/(?<![\w'])'(\d{2})(?!\d)/g)) { const y = yy(Number(m[1])); if (inEra(y)) years.add(y); }
  for (const m of t.matchAll(/(?<!\d)(\d{2})\s*(?:年(?!代)|년(?!대))/g)) { const y = yy(Number(m[1])); if (inEra(y)) years.add(y); }

  const tags = new Map();   // year -> the seasons written for it, first-written form kept
  for (const [s, n] of seasons) {
    const y = yy(n); if (!inEra(y)) continue;
    const w = s.replace('/', '').toUpperCase();
    const tag = (w === 'PE' ? 'SS' : w === 'AI' ? 'AW' : w === 'SP' ? 'SS' : w) + String(n).padStart(2, '0');
    const same = tag.replace(/^FW/, 'AW');          // FW00 and AW00 are one season
    years.add(y); const m = tags.get(y) || tags.set(y, new Map()).get(y); if (!m.has(same)) m.set(same, tag);
  }
  if (years.size === 1) {
    const y = [...years][0], ts = tags.get(y);
    // one season named: say it the way the seller did. Two seasons of one year: the year.
    return { tier: 'A', era: ts && ts.size === 1 ? [...ts.values()][0] : String(y) };
  }
  if (years.size > 1 || claims.length) {
    if (years.size > 1) say('multi', [...years].sort().join(' · '), 1);
    const best = claims.sort((x, y) => x.rank - y.rank)[0];
    return { tier: 'B', era: null, ...(best ? { claim: best.v, claimKind: best.k } : {}) };
  }
  return { tier: 'C', era: null };
}

// ── what kind of thing it is ──────────────────────────────────────────────
// First match wins, so the order matters: a vest bag is a bag, boots are boots
// before anything else in the title, a shirt jacket is a jacket, a T-shirt is
// not a shirt, a knit vest is a knit.
export const SECTIONS = ['아우터', '테일러링', '셔츠', '상의', '팬츠', '데님', '신발', '가방·소품', '주얼리', '기타'];
const SECTION = [
  ['기타', /\bdress(?!\s*(?:shirt|pants?|trousers?|slacks|shoes?|boots?))(?:es)?\b|\bskirts?\b|ワンピース|スカート|ドレス(?!\s*(?:シャツ|パンツ|シューズ|ブーツ))|원피스|스커트|드레스(?!\s*(?:셔츠|팬츠|슈즈))/i],
  ['주얼리', /\brings?\b|necklace|pendant|bracelet|bangle|earrings?|dog\s*tag|リング|ネックレス|ペンダント|ブレスレット|(?<!ー)ブレス(?!ト|ス|レ)|バングル|指輪|ピアス|イヤリング|ドッグタグ|반지|목걸이|팔찌|펜던트|귀걸이|이어링/i],
  ['가방·소품', /\bbags?\b|backpack|rucksack|\btote\b|pouch|wallet|\bpurse\b|バッグ|バックパック|リュック|ポーチ|財布|ウォレット|パース|鞄|가방|백팩|지갑|파우치|(?:베스트|토트|숄더)\s*백/i],
  ['신발', /boot(?!\s*-?cut)|sneakers?|\bshoes?\b|derbys?|derbies|loafers?|sandals?|slippers?|creepers?|\bbrogues?\b|ブーツ(?!カット)|スニーカー|シューズ|短靴|革靴|靴(?!下)|ダービー|ローファー|サンダル|スリッポン|부츠(?!컷)|스니커즈|신발|구두|더비|로퍼|샌들|워커/i],
  ['상의', /knit\s*(?:vest|top)|sleeveless\s*knit|ニット\s*ベスト|スリーブレス\s*ニット|니트\s*(?:베스트|조끼)/i],
  ['테일러링', /blazer|tailored|\bsuit\b|set[\s-]?up|\b[12]\s*b\b|\b1\s*button\b|sport\s*coat|テーラード|(?<!ジャンプ)スーツ|ブレ[ー]?ザー|セットアップ|블레이저|(?<!점프)수트|정장|셋업|테일러드/i],
  ['아우터', /high[\s-]?neck(?=[\s\S]*(?:leather|レザー|레더))|ハイネック\s*レザー|하이넥\s*레더|jacket|(?<![a-z])jkt(?![a-z])|(?<![a-z])jk(?![a-z])|coat(?!ed|ing)|parka|blouson|bomber|\bvest\b|gilet|caban|trench|riders|\bbiker\b|anorak|\bcape\b|poncho|ジャケット|コート|ブルゾン|ライダース|ボンバー|ベスト|ジレ|マウンテンパーカ|ケープ|マント|자켓|재킷|코트|점퍼|파카|베스트|조끼|블루종|카반|라이더/i],
  ['데님', /denim|jeans|\bjean\b|デニム|ジーンズ|데님|청바지/i],
  ['팬츠', /pants|trousers|slacks|shorts|leggings|long[\s-]?johns|パンツ|スラックス|トラウザー|ショーツ|ボトム|レギンス|팬츠|바지|슬랙스|반바지|트라우저|레깅스/i],
  ['셔츠', /(?<!\bt[\s-]?)shirt(?!s?\s*jacket)|button[\s-]?(?:up|down)s?(?![a-z])|blouse|(?<![tTｔＴ])シャツ(?!\s*ジャケット)|ブラウス|(?<!티)셔츠|블라우스/i],
  ['상의', /\bt[\s-]?shirt|\btee\b|cut\s*(?:and\s*)?sew|knit|sweater|jumper|cardigan|hoodie|sweatshirt|\btanks?\b|\btops?\b|turtleneck|jersey|\bpolo\b|long[\s-]?sleeves?|tシャツ|カットソー|ニット|セーター|カーディガン|パーカー|フーディ|タンク|スウェット|トップス|티셔츠|니트|스웨터|가디건|후드|맨투맨|나시|반팔|긴팔/i],
  ['가방·소품', /\bbelts?\b|gloves?\b|mittens|scarf|stole|muffler|\bhats?\b|\bcaps?\b|beanie|socks|\btie\b|key\s*(?:ring|chain|holder)|metal\s*tag|ベルト|グローブ|手袋|マフラー|ストール|帽子|キャップ|ハット|ビーニー|ソックス|靴下|ネクタイ|キーリング|キーホルダー|メタルタグ|벨트|장갑|머플러|스카프|모자|비니|양말|넥타이|키링/i],
];
// A model code's letters say what the garment is only where every code seen so
// far agrees with the title's own word (2026-09-27, 354 titles): AM on boots and
// shoes, PM on trousers, CM on shirts, KM and TM on knits and tees.
const CODEKIND = { AM: '신발', PM: '팬츠', CM: '셔츠', KM: '상의', TM: '상의' };
// the house's own footwear names, when nothing else in the title says what it is
const SHOEWORDS = /prosthetic|u[\s-]*sole|paper[\s-]*dart|officer|spur[\s-]*biter|tornado|diagonal[\s-]*zip|good[\s-]*year|u[\s-]*jack|プロステティック|ペーパーダート|トルネード|ダイアゴナル|グッドイヤー|프로스테틱|토네이도|u\s*솔/i;
// the house's own techniques and lines, which name the maker without its name
const HOUSE = /object[\s-]*dy(?:e|ed)|(?<![a-z])o\.\s?d\.|drip|scar[\s-]*stitch|dead[\s-]*end|over[\s-]*lock|melt[\s-]*lock|ドリップ|オブジェクト\s*ダイ|デッド\s*エンド|スカー\s*ステッチ|드립|오브젝트\s*다이|데드\s*엔드/i;
const saysWhat = (t) => SECTION.some(([, re]) => re.test(t)) || SHOEWORDS.test(t) || HOUSE.test(t);
export function section(title, codes = codesOf(title)) {
  const t = nk(title);
  for (const [s, re] of SECTION) if (re.test(t)) return s;
  const kinds = [...new Set(codes.map((c) => CODEKIND[(/^([A-Z]{1,2})\//.exec(c) || [])[1]]))];
  if (kinds.length === 1 && kinds[0]) return kinds[0];
  if (SHOEWORDS.test(t)) return '신발';
  return '기타';
}

// ── size ─────────────────────────────────────────────────────────────────
// Only what reads as a size: a labelled size (サイズ48 · size 7 · Sz.46 · 7 size),
// fruitsfamily's bracket ([50] · 50) · (9)), an Italian size standing on its
// own in a garment's title (48 · 44/46 · 50/48), a shoe size standing on its own
// in a shoe's title (boots 7 · DERBYS 9), a length in cm on shoes.
export function size(title, sec = section(title)) {
  const raw = nk(title);
  let m = /(?:size|サイズ|사이즈|sz)\s*[:：.]?\s*((?:uk|us|eu|it|jp)\s*)?(\d{1,3}(?:\.5)?|xxs|xs|s|m|l|xl|xxl|free|f)(?![a-z0-9])/i.exec(raw);
  if (m) return ((m[1] ? m[1].trim().toUpperCase() + ' ' : '') + m[2]).toUpperCase();
  // a scale written with the number stays with it: UK 8 is not EU 8
  if ((m = /(?<![a-z])(uk|us|eu|it|jp)\s*(\d{1,2}(?:\.5)?)(?![\d.])/i.exec(raw))) return m[1].toUpperCase() + ' ' + m[2];
  if ((m = /(?<![\w.])(\d{1,2}(?:\.5)?)\s*size\b/i.exec(raw))) return m[1];
  if ((m = /^\s*\[(\d{1,3})\]/.exec(raw)) || (m = /^\s*(\d{2})\)/.exec(raw)) || (m = /\((\d{1,2}(?:\.5)?)\)\s*$/.exec(raw))) return m[1];
  // cleared of everything that is not a size
  let t = ' ' + clean(raw) + ' ';
  t = t.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ' ').replace(/['’‘]\d{2}(?!\d)/g, ' ').replace(/(?<!\d)\d{1,2}\s*(?:年|년)\S*/g, ' ')
       .replace(/(?<![a-z0-9])(?:a\/?w|f\/?w|s\/?s|p\/e|a\/i|ss|aw|fw)\s*'?\d{2}(?!\d)|(?<!\d)\d{2}\s*(?:ss|aw|fw|a\/w|s\/s)(?![a-z])/gi, ' ')
       .replace(/(?<!\d)\d{2}\s*[-〜~～]\s*\d{2}(?!\d)/g, ' ')
       .replace(/[A-Za-z]+[\-\/]\d+/g, ' ');                       // fabric codes: ASA/10 · PTC/33 · COFIFTY/7
  const B = '(?<![A-Za-z0-9.:%#°\\-])', E = '(?![A-Za-z0-9.%°\\-])';
  if (sec === '신발') {
    // UK/US numbers (4–13) or EU numbers (35–47), whichever the seller used
    const s = [...t.matchAll(new RegExp(B + '(\\d{1,2}(?:\\.5)?)' + E, 'g'))].map((x) => x[1])
      .filter((v) => (+v >= 4 && +v <= 13) || (+v >= 35 && +v <= 47 && Number.isInteger(+v)));
    if (s.length) return s[s.length - 1];
    const cm = new RegExp(B + '(2\\d(?:\\.\\d)?)\\s*cm(?![a-z])', 'i').exec(t); if (cm) return cm[1].replace(/\.0$/, '') + 'cm';
    return null;
  }
  const it = (v) => +v >= 40 && +v <= 58 && +v % 2 === 0;
  m = new RegExp(B + '(\\d{2})\\s*\\/\\s*(\\d{2})' + E).exec(t);
  if (m && it(m[1]) && it(m[2])) return m[1] + '/' + m[2];
  const one = [...t.matchAll(new RegExp(B + '(\\d{2})' + E, 'g'))].map((x) => x[1]).filter(it);
  if (one.length) return one[0];
  m = /(?<![a-z0-9])(xxs|xs|xxl|xl)(?![a-z0-9])/i.exec(t); if (m) return m[1].toUpperCase();
  return null;
}

// new, unworn — as the title says it (新品同様 "like new" is used)
export const NEW_RE = /新品(?!\s*同様|\s*に近い)|未使用(?!\s*に近い)|未着用|デッドストック|deadstock|\bbnwt\b|\bnwt\b|new\s*with\s*tags|unworn|새상품|새\s*상품|미착용/i;

export function classify(item, { brandPage = false } = {}) {
  const why = excludeReason(item.title, { brandPage: brandPage || !!item.brandTagged });
  if (why) return { exclude: why };
  const e = era(item.title);
  const codes = codesOf(item.title);
  // what the title does not say, the category the seller filed it under may
  // (Rakuma: 靴/シューズ(ブーツ) · ジャケット/アウター(レザージャケット)); the title comes first
  const own = section(item.title, codes);
  const sec = own === '기타' && item.cat ? section(item.cat, []) : own;
  // a brand label alone (the site's brand page, the seller's brand field) admits a
  // title that never names the house only when the title says what the thing is,
  // names one of the house's techniques or carries a model number: a record filed
  // under the label is not a garment
  const t = nk(item.title);
  if (brandAt(t) < 0 && !codes.length && !saysWhat(t) && !(item.cat && section(item.cat, []) !== '기타')) return { exclude: 'no-brand' };
  const z = item.size || size(item.title, sec);
  return { tier: e.tier, era: e.era, ...(e.claim ? { claim: e.claim, claimKind: e.claimKind } : {}),
           section: sec, ...(z ? { size: z } : {}), ...(codes.length ? { codes } : {}) };
}
