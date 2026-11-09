import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, rules;
before(async () => { server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' }); rules = await server.ssrLoadModule('/src/lib/promotions.ts'); });
after(async () => { await server?.close(); });
test('calcul en ariary, arrondi et validation', () => {
  assert.deepEqual(rules.calculatePromotionPrice(1000000, 20), { reduction: 200000, finalPrice: 800000 });
  assert.deepEqual(rules.calculatePromotionPrice(1000, 0.29), { reduction: 3, finalPrice: 997 });
  assert.deepEqual(rules.calculatePromotionPrice(3, 50), { reduction: 2, finalPrice: 1 });
  for (const [price, percent] of [[-1,20], [0,20], [100,0], [1.5,20], [100,-1], [100,101], [100,1.001], [NaN,10]]) assert.throws(() => rules.calculatePromotionPrice(price, percent), RangeError);
});
test('dates valides et période inclusive à Madagascar', () => {
  assert.equal(rules.isValidPromotionDate('2028-02-29'), true);
  assert.equal(rules.isValidPromotionDate('2027-02-29'), false);
  assert.equal(rules.isValidPromotionDate('2026-11-31'), false);
  const p = { id:'x', name:'Noël', description:'', startDate:'2026-11-12', endDate:'2026-12-25', enabled:true, published:true, products:[] };
  assert.equal(rules.isPromotionActive(p, new Date('2026-11-11T20:59:59Z')), false);
  assert.equal(rules.isPromotionActive(p, new Date('2026-11-11T21:00:00Z')), true);
  assert.equal(rules.isPromotionActive(p, new Date('2026-12-25T20:59:59Z')), true);
  assert.equal(rules.isPromotionActive(p, new Date('2026-12-25T21:00:00Z')), false);
  assert.equal(rules.isPromotionActive({ ...p, enabled:false }, new Date('2026-12-01T12:00:00Z')), false);
  assert.equal(rules.isPromotionActive({ ...p, published:false }, new Date('2026-12-01T12:00:00Z')), false);
});
