import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SHIPPING_SETTINGS, isValidShippingSettings, normalizeShippingSettings, getShippingCost, getShippingCarrier, shippingSettingsEqual } from '../functions/shipping.mjs';

const settings = () => structuredClone(DEFAULT_SHIPPING_SETTINGS);

test('existing zone rates and exact free shipping boundaries are preserved', () => {
  for (const [zone, fee, threshold] of [['continental', 4.9, 85], ['islands', 12, 100], ['spain', 10, 100]]) {
    assert.equal(getShippingCost(threshold - .01, zone), fee);
    assert.equal(getShippingCost(threshold, zone), 0);
    assert.equal(getShippingCost(threshold + 1, zone), 0);
  }
});

test('carrier choice determines shipping price and an empty zone is unavailable, not free', () => {
  const next = settings();
  next.continental.carriers.push({ id: 'dhl', name: 'DHL', price: 5.9, description: '6-8 dias' });
  assert.equal(getShippingCost(20, 'continental', next, 'dhl'), 5.9);
  assert.equal(getShippingCost(85, 'continental', next, 'dhl'), 0);
  assert.equal(getShippingCarrier('continental', next, 'dhl').description, '6-8 dias');
  assert.throws(() => getShippingCost(20, 'continental', next, 'missing'), /unavailable/);
  next.islands.carriers = [];
  assert.ok(isValidShippingSettings(next));
  assert.throws(() => getShippingCost(200, 'islands', next), /unavailable/);
});

test('rejects malformed settings, duplicate carriers and invalid money', () => {
  for (const price of [-1, NaN, Infinity, 1000, 5.901, '5.9', null]) {
    const next = settings();
    next.continental.carriers[0].price = price;
    assert.equal(isValidShippingSettings(next), false, String(price));
  }
  const duplicate = settings();
  duplicate.continental.carriers.push({ ...duplicate.continental.carriers[0] });
  assert.equal(isValidShippingSettings(duplicate), false);
  const blank = settings();
  blank.spain.carriers[0].name = '  ';
  assert.equal(isValidShippingSettings(blank), false);
  assert.equal(isValidShippingSettings({ ...settings(), extra: {} }), false);
  assert.throws(() => getShippingCost(-1, 'spain'), /subtotal/);
  assert.throws(() => getShippingCost(20, 'unknown'), /settings/);
});

test('legacy settings migrate to a standard carrier and equality includes descriptions', () => {
  const old = { continental: { fee: 4.9, freeFrom: 85 }, islands: { fee: 12, freeFrom: 100 }, spain: { fee: 10, freeFrom: 100 } };
  assert.ok(shippingSettingsEqual(normalizeShippingSettings(old), settings()));
  assert.equal(normalizeShippingSettings({ continental: { fee: -1 } }), null);
  const next = settings();
  next.spain.carriers[0].description = '6-8 dias';
  assert.equal(shippingSettingsEqual(next, settings()), false);
});
