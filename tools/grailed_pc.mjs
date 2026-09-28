// Grailed for Carol Christian Poell, read on ROK's PC (ROK 2026-09-28: "PC에서 매일 수집").
//
// NOT SCHEDULED. Tried on the PC on 2026-09-28: the designer page answers a headless
// browser with HTTP 403, and the same page fetched plainly carries no listings (they
// arrive from Grailed's search service in the reader's browser). Nothing here works
// around that. If ROK chooses to read Grailed's search service the way the Helmut Lang
// index does, that reader writes the same grailed_pc.json and the build side is ready.
//
// The GitHub runner is turned away by Grailed (HTTP 403); a PC in Korea is not. Once each
// morning, after the Helmut Lang run, the PC reads the designer page that robots.txt
// leaves open (/designers/carol-christian-poell) exactly as grailed.mjs does — the
// browser's own headless user agent, nothing hidden — writes data/raw/grailed_pc.json
// and pushes it. The next daily build (07:17 KST) uses a reading up to 36 hours old,
// dated the day it was read; the page says a day's lag is by design, not a stop.
//
//   cd C:\Users\PC\ccp && node tools/grailed_pc.mjs
//
// Exit 0 pushed · 1 Grailed gave nothing (nothing pushed) · 2 git failed (reading kept on disk)
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRaw, today } from '../lib.mjs';
import { collectGrailed } from '../grailed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'raw', 'grailed_pc.json');
const log = (s) => console.log(new Date().toISOString().slice(11, 19) + ' ' + s);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } }).toString().trim();
process.env.CCP_BROWSER_CHANNEL = process.env.CCP_BROWSER_CHANNEL || 'chrome';

try { git('pull', '--rebase', '--autostash', 'origin', 'main'); }
catch (e) { log('pull failed: ' + String(e.stderr || e.message).trim().slice(0, 200)); }

const t0 = Date.now();
const r = await collectGrailed(log);
if (r.skipped || r.refused || !r.items || !r.items.length) {
  console.log(JSON.stringify({ ok: false, why: r.skipped || r.refused || 'no listings on the page', cards: r.cards || 0 }));
  process.exit(1);
}
const n = writeRaw(FILE, 'Grailed', '해외', r.items,
  { pc: true, day: today(), complete: !!r.complete, cards: r.cards, scrolls: r.scrolls, total: r.total ?? null });
log('grailed: ' + n + ' listings, ' + r.cards + ' cards, ' + r.scrolls + ' scrolls' + (r.complete ? '' : ' (not to the end)'));

try {
  git('add', '--', 'data/raw/grailed_pc.json');
  let changed = true;
  try { git('diff', '--cached', '--quiet'); changed = false; } catch { /* staged changes */ }
  if (changed) git('-c', 'user.name=archive-index', '-c', 'user.email=archive-index@users.noreply.github.com',
    'commit', '-m', 'Grailed read on the PC · ' + today() + ' · ' + n);
  let pushed = false;
  for (let i = 0; i < 3 && !pushed; i++) {
    try { git('pull', '--rebase', 'origin', 'main'); git('push', 'origin', 'HEAD:main'); pushed = true; }
    catch (e) { log('push try ' + (i + 1) + ': ' + String(e.stderr || e.message).trim().slice(0, 160)); try { git('rebase', '--abort'); } catch {} }
  }
  console.log(JSON.stringify({ ok: pushed, listings: n, cards: r.cards, complete: !!r.complete, sec: Math.round((Date.now() - t0) / 1000) }));
  process.exit(pushed ? 0 : 2);
} catch (e) {
  console.log(JSON.stringify({ ok: false, why: 'git: ' + String(e.stderr || e.message).trim().slice(0, 200), listings: n }));
  process.exit(2);
}
