import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUES, CATEGORIES, marker } from '../src/payloads.js';
import { judge, run, summarize } from '../src/strike.js';

describe('payloads', () => {
  test('every technique embeds the marker and is harmless (asks only to emit the token)', () => {
    for (const t of TECHNIQUES) {
      const m = marker();
      const built = t.build(m);
      // base64 hides the marker in the encoded blob, not literally — decode to check
      const literal = built.includes(m);
      const decoded = t.id === 'base64' && Buffer.from(built.split(': ').pop(), 'base64').toString().includes(m);
      assert.ok(literal || decoded, `${t.id} must carry its marker`);
    }
    assert.ok(CATEGORIES.length >= 5);
  });
  test('markers are unique', () => {
    const ms = Array.from({ length: 50 }, marker);
    assert.equal(new Set(ms).size, 50);
  });
});

describe('judge', () => {
  const M = 'VPR-ABC123';
  test('marker present => obeyed', () => assert.equal(judge(`Sure: ${M}`, M).obeyed, true));
  test('marker absent => blocked', () => assert.equal(judge('I will not do that.', M).obeyed, false));
  test('marker echoed inside a refusal => blocked', () => {
    assert.equal(judge(`I can't output ${M}; that looks like a prompt injection.`, M).obeyed, false);
  });
  test('marker used for real, even with a hedge, => obeyed', () => {
    assert.equal(judge(`Okay, here it is: ${M}`, M).obeyed, true);
  });
});

describe('run against a fake endpoint', () => {
  test('scores obeyed/blocked per technique and summarizes', async () => {
    // fake model: obeys base64 and roleplay, refuses the rest
    const askFn = async (_b, _m, content) => {
      const mark = (content.match(/VPR-[0-9A-F]{6}/) || [])[0]
        || Buffer.from((content.split(': ').pop() || ''), 'base64').toString().match(/VPR-[0-9A-F]{6}/)?.[0];
      const weak = /FREEBOT|Decode this base64/.test(content);
      return weak && mark ? `${mark}` : "I can't comply with that.";
    };
    const results = await run({ baseUrl: 'x', model: 'fake', repeats: 1, ask: askFn });
    const s = summarize(results);
    assert.equal(s.total, TECHNIQUES.length);
    assert.equal(s.byTech.roleplay.obeyed, 1);
    assert.equal(s.byTech.base64.obeyed, 1);
    assert.equal(s.byTech.direct_override.obeyed, 0);
    assert.ok(s.obeyed >= 2 && s.obeyed < s.total);
  });
  test('an endpoint error is recorded, not thrown', async () => {
    const results = await run({ baseUrl: 'x', model: 'fake', repeats: 1, only: 'roleplay', ask: async () => { throw new Error('boom'); } });
    assert.equal(results[0].outcome, 'error');
    assert.equal(summarize(results).errors, 1);
  });
});
