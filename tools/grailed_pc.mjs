// Grailed for Carol Christian Poell, read on ROK's PC: the stand-in, not the daily path.
//
// Since 2026-09-29 the daily build reads Grailed itself, through Grailed's own search
// service (grailed.mjs; ROK: "Grailed는 HL처럼 검색 백엔드로 읽어줘"). This stays for a day
// when that service turns the GitHub runner away: the same reader, run here, writes
// data/raw/grailed_pc.json and pushes it, and the next build (07:17 KST) uses a reading
// up to 36 hours old, dated the day it was read. NOT SCHEDULED; run it by hand.
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

try { git('pull', '--rebase', '--autostash', 'origin', 'main'); }
catch (e) { log('pull failed: ' + String(e.stderr || e.message).trim().slice(0, 200)); }

const t0 = Date.now();
let r;
try { r = await collectGrailed(log); }
catch (e) { console.log(JSON.stringify({ ok: false, why: String(e.message || e).slice(0, 200) })); process.exit(1); }
if (!r.items.length) { console.log(JSON.stringify({ ok: false, why: 'the search answered no listings', cards: r.cards })); process.exit(1); }
const n = writeRaw(FILE, 'Grailed', '해외', r.items,
  { pc: true, day: today(), complete: !!r.complete, cards: r.cards, total: r.total, calls: r.calls });
log('grailed: ' + n + ' listings from ' + r.cards + ' hits' + (r.complete ? '' : ' (not complete)'));

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
