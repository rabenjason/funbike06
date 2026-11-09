import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, countdown;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ promotionCountdown: countdown } = await server.ssrLoadModule('/src/lib/promotions.ts'));
});
after(async () => { await server.close(); });

test('compte à rebours : dernières 24 h jusqu’à minuit à Madagascar, fin incluse', () => {
  const at = (value) => Date.parse(value);
  assert.equal(countdown('2026-12-12', at('2026-12-11T20:59:59.999Z')), null);
  assert.equal(countdown('2026-12-12', at('2026-12-11T21:00:00.000Z')), '24:00:00');
  assert.equal(countdown('2026-12-12', at('2026-12-12T09:30:15.000Z')), '11:29:45');
  assert.equal(countdown('2026-12-12', at('2026-12-12T20:59:59.999Z')), '00:00:01');
  assert.equal(countdown('2026-12-12', at('2026-12-12T21:00:00.000Z')), null);
  assert.equal(countdown('2024-02-29', at('2024-02-29T20:00:00Z')), '01:00:00');
  assert.equal(countdown('2023-02-29', at('2023-02-28T20:00:00Z')), null);
  assert.equal(countdown('2026-13-12', at('2026-12-12T20:00:00Z')), null);
  assert.equal(countdown('2026-12-12', NaN), null);
});
