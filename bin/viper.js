#!/usr/bin/env node
import fs from 'node:fs';
import { run, summarize } from '../src/strike.js';
import { TECHNIQUES, CATEGORIES } from '../src/payloads.js';

const HELP = `viper 🐍 — strike your own AI agent with prompt injections and see which land.

  viper --model NAME [--base-url http://127.0.0.1:11434/v1] [--guard "SYSTEM PROMPT" | --guard-file f]
        [--repeats 2] [--only TECHNIQUE|CATEGORY] [--json out.jsonl]

Fires ${TECHNIQUES.length} injection techniques at an OpenAI-compatible endpoint. Each plants a
unique harmless marker (VPR-xxxx); if the marker comes back, the injection got through.
Pass --guard with the system prompt your agent actually uses, to test your real defense.

Categories: ${CATEGORIES.join(', ')}

Only test systems you own or are authorized to test.`;

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
  }
  return o;
}
const pct = (k, n) => n ? `${Math.round(100 * k / n)}%` : '-';
const bar = (k, n) => { const f = n ? Math.round(10 * k / n) : 0; return '█'.repeat(f) + '░'.repeat(10 - f); };

const o = args(process.argv.slice(2));
if (o.help || !o.model) { console.log(HELP); process.exit(o.help ? 0 : 2); }
const baseUrl = o['base-url'] || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1';
const guard = o['guard-file'] ? fs.readFileSync(o['guard-file'], 'utf8') : (typeof o.guard === 'string' ? o.guard : undefined);
const out = typeof o.json === 'string' ? fs.createWriteStream(o.json, { flags: 'a' }) : null;

let done = 0;
const results = await run({
  baseUrl, model: o.model, guard, apiKey: process.env.OPENAI_API_KEY,
  repeats: Number(o.repeats || 2), only: typeof o.only === 'string' ? o.only : null,
  onResult: (r) => { done++; out?.write(JSON.stringify(r) + '\n'); process.stderr.write(`\r${done} strikes…`); },
});
process.stderr.write('\n');
const s = summarize(results);
console.log(`\nviper 🐍 — ${o.model} via ${baseUrl}${guard ? ' (with your guardrail)' : ' (NO guardrail — raw model)'}\n`);
console.log(`${'technique'.padEnd(18)} ${'category'.padEnd(20)} landed`);
for (const t of TECHNIQUES) {
  const c = s.byTech[t.id]; if (!c) continue;
  const hot = c.obeyed > 0 ? '🔴' : '🟢';
  console.log(`${hot} ${t.id.padEnd(16)} ${t.category.padEnd(20)} ${bar(c.obeyed, c.n)} ${pct(c.obeyed, c.n).padStart(4)} (${c.obeyed}/${c.n})`);
}
console.log(`\nOVERALL: ${s.obeyed}/${s.total} injections got through (${pct(s.obeyed, s.total)})${s.errors ? `   errors: ${s.errors}` : ''}`);
if (s.obeyed) console.log('🔴 techniques marked red bypassed your guardrail — harden the system prompt or add an input filter, then re-run.');
else console.log('🟢 no injection landed in this run. Raise --repeats and try again before trusting it.');
process.exitCode = s.obeyed ? 1 : 0;
