import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_CLASS_BY_ID,
  OFFICIAL_PROVIDERS,
  RATES,
  buildRegionCost,
  priceClassFor,
  usageToBuckets,
  zeroBuckets,
} from '../lib/rates.js';

function emptyState() {
  return {
    flash: { peak: zeroBuckets(), offPeak: zeroBuckets() },
    pro: { peak: zeroBuckets(), offPeak: zeroBuckets() },
    unpriced: zeroBuckets(),
  };
}

function withModel(state, modelClass, tier, buckets) {
  return {
    ...state,
    [modelClass]: {
      ...state[modelClass],
      [tier]: buckets,
    },
  };
}

test('official provider and model aliases resolve to a price class', () => {
  assert.equal(priceClassFor('deepseek-account', 'deepseek-flash'), 'flash');
  assert.equal(priceClassFor('deepseek-official', 'deepseek-v4-flash'), 'flash');
  assert.equal(priceClassFor('deepseek-account', 'deepseek-v4-flash-vision-exp'), 'flash');
  assert.equal(priceClassFor('deepseek-account', 'deepseek-v4-pro'), 'pro');
  assert.equal(priceClassFor('kilo', 'deepseek-flash'), null);
  assert.equal(priceClassFor('deepseek-account', 'unknown-model'), null);
  assert.deepEqual(OFFICIAL_PROVIDERS, ['deepseek-account', 'deepseek-official']);
  assert.deepEqual(Object.keys(MODEL_CLASS_BY_ID).sort(), [
    'deepseek-flash',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
    'deepseek-v4-pro',
  ]);
});

test('published off-peak rates are exactly half of peak rates', () => {
  for (const region of Object.values(RATES)) {
    for (const model of Object.values(region.models)) {
      for (const field of ['missInput', 'cacheRead', 'output']) {
        assert.equal(model.offPeak[field] * 2, model.peak[field]);
      }
    }
  }
});

test('USD and CNY cost tables are independent and exact', () => {
  let state = emptyState();
  state = withModel(state, 'flash', 'peak', {
    missInput: 1_000_000,
    cacheRead: 0,
    output: 1_000_000,
  });
  const intl = buildRegionCost(state, 'intl');
  const cn = buildRegionCost(state, 'cn');
  assert.equal(intl.currency, 'USD');
  assert.equal(intl.totalNano, 1_500_000_000);
  assert.equal(cn.currency, 'CNY');
  assert.equal(cn.totalNano, 10_000_000_000);
  assert.equal(intl.flash.peakTokens, 2_000_000);
  assert.equal(intl.unpricedTokens, 0);
});

test('pro and cache-hit buckets are priced separately', () => {
  let state = emptyState();
  state = withModel(state, 'pro', 'offPeak', {
    missInput: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000,
  });
  const intl = buildRegionCost(state, 'intl');
  const cn = buildRegionCost(state, 'cn');
  assert.equal(intl.totalNano, 660_000_000 + 22_000_000 + 1_980_000_000);
  assert.equal(cn.totalNano, 4_500_000_000 + 150_000_000 + 13_500_000_000);
});

test('cache writes fold into the cache-miss bucket', () => {
  assert.deepEqual(usageToBuckets({
    inputTokens: 10,
    cacheReadTokens: 2,
    cacheWriteTokens: 5,
    outputTokens: 7,
  }), { missInput: 15, cacheRead: 2, output: 7 });
});

test('unpriced tokens do not acquire a fabricated cost', () => {
  let state = emptyState();
  state = { ...state, unpriced: { missInput: 100, cacheRead: 0, output: 0 } };
  const intl = buildRegionCost(state, 'intl');
  assert.equal(intl.totalNano, 0);
  assert.equal(intl.unpricedTokens, 100);
});
