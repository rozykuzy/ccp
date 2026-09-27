// eBay through its official Browse API — the route eBay offers for this, in
// place of the /sch/ search pages its robots.txt closes.
//
// Needs an application key from https://developer.ebay.com (free), as two
// repository secrets: EBAY_CLIENT_ID and EBAY_CLIENT_SECRET. Without them this
// step is skipped and nothing fails. This file never prints them.
// Seller names come back in the response; they are not kept.

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const CATEGORY = '11450';   // Clothing, Shoes & Accessories
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the brand's name as sellers write it, and as they misspell it
export const TERMS = ['carol christian poell', 'carol christian poel', 'ccp poell'];
const PAGE = 200, CAP = 3000;

async function token(id, secret) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
               'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error('eBay token: HTTP ' + res.status + ' — check the two keys');
  return (await res.json()).access_token;
}

export function itemOf(s) {
  const pr = s.currentBidPrice || s.price || {};
  // asked through the US marketplace, a price set in euros or yen comes back
  // converted to dollars; the seller's own figure is in convertedFrom*. That is
  // the price — the dollar figure moves with the exchange rate every day.
  const value = pr.convertedFromValue != null ? pr.convertedFromValue : pr.value;
  const cur = pr.convertedFromCurrency || pr.currency;
  const it = { id: 'ebay:' + (s.legacyItemId || s.itemId), url: s.itemWebUrl, title: s.title, price: Number(value), cur,
               img: (s.image && s.image.imageUrl) || (s.thumbnailImages && s.thumbnailImages[0] && s.thumbnailImages[0].imageUrl) || null };
  if (Array.isArray(s.buyingOptions) && s.buyingOptions.includes('AUCTION')) {
    if (Number.isFinite(s.bidCount)) it.bids = s.bidCount;
    if (s.itemEndDate) { it.endsAt = s.itemEndDate; it.endsPrec = 'm'; }
  }
  return it.url && it.title && it.price > 0 ? it : null;
}

export async function collectEbay(log = () => {}) {
  const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return { skipped: 'EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set', items: [] };
  const tok = await token(id, secret);
  const all = new Map(); const calls = []; let complete = true;
  for (const q of TERMS) {
    for (let offset = 0; ; offset += PAGE) {
      if (offset >= CAP) { complete = false; break; }
      const u = SEARCH_URL + '?q=' + encodeURIComponent(q) + '&category_ids=' + CATEGORY + '&limit=' + PAGE + '&offset=' + offset;
      const res = await fetch(u, { headers: { authorization: 'Bearer ' + tok, 'x-ebay-c-marketplace-id': 'EBAY_US' } });
      if (res.status === 429) throw new Error('eBay rate limit reached');
      if (!res.ok) { calls.push({ q, offset, status: res.status }); complete = false; break; }
      const j = await res.json(); const list = j.itemSummaries || [];
      let fresh = 0;
      for (const s of list) { const it = itemOf(s); if (it && !all.has(it.id)) { all.set(it.id, it); fresh++; } }
      calls.push({ q, offset, got: list.length, fresh, total: j.total });
      log('ebay "' + q + '" +' + offset + ': ' + list.length + ' (' + fresh + ' new, total ' + j.total + ')');
      if (list.length < PAGE || offset + PAGE >= (j.total || 0)) break;
      await sleep(400);
    }
  }
  return { items: [...all.values()], calls, complete };
}
