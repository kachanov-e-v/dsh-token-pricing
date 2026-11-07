/**
 * Published DeepSeek token rates and exact regional cost arithmetic.
 *
 * Rates are integer nano-currency units per token. DeepSeek publishes one
 * international table in USD and a separate mainland-China table in CNY; the
 * two are not currency conversions of each other, so both are stored as
 * published and no exchange rate is involved.
 */

/** Provider routes whose usage these published API rates cover. */
export const OFFICIAL_PROVIDERS = Object.freeze([
  'deepseek-account',
  'deepseek-official',
]);

/** Model ids accepted by the current API and their published price class. */
export const MODEL_CLASS_BY_ID = Object.freeze({
  'deepseek-flash': 'flash',
  'deepseek-v4-flash': 'flash',
  'deepseek-v4-flash-vision-exp': 'flash',
  'deepseek-v4-pro': 'pro',
});

/** Every model id with a published rate. */
export const SUPPORTED_MODELS = Object.freeze(Object.keys(MODEL_CLASS_BY_ID));

/** Rates with the shape `{ missInput, cacheRead, output }` in nano per token. */
export const RATES = Object.freeze({
  intl: Object.freeze({
    currency: 'USD',
    symbol: '$',
    asOf: '2026-11-05',
    source: 'https://api-docs.deepseek.com/quick_start/pricing/',
    models: Object.freeze({
      flash: Object.freeze({
        peak: Object.freeze({ missInput: 300, cacheRead: 6, output: 1200 }),
        offPeak: Object.freeze({ missInput: 150, cacheRead: 3, output: 600 }),
      }),
      pro: Object.freeze({
        peak: Object.freeze({ missInput: 1320, cacheRead: 44, output: 3960 }),
        offPeak: Object.freeze({ missInput: 660, cacheRead: 22, output: 1980 }),
      }),
    }),
  }),
  cn: Object.freeze({
    currency: 'CNY',
    symbol: '¥',
    asOf: '2026-11-05',
    source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
    models: Object.freeze({
      flash: Object.freeze({
        peak: Object.freeze({ missInput: 2000, cacheRead: 40, output: 8000 }),
        offPeak: Object.freeze({ missInput: 1000, cacheRead: 20, output: 4000 }),
      }),
      pro: Object.freeze({
        peak: Object.freeze({ missInput: 9000, cacheRead: 300, output: 27000 }),
        offPeak: Object.freeze({ missInput: 4500, cacheRead: 150, output: 13500 }),
      }),
    }),
  }),
});

/** Zero-valued disjoint billing buckets. */
export function zeroBuckets() {
  return { missInput: 0, cacheRead: 0, output: 0 };
}

/**
 * Convert provider usage into disjoint billing buckets. The published table
 * has no separate cache-write column, so writes are folded into cache-miss
 * input; the normal DeepSeek API reports none.
 * @param {object} usage - provider TokenUsage.
 * @returns {{missInput:number,cacheRead:number,output:number}}
 */
export function usageToBuckets(usage) {
  const integer = (value) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
  return {
    missInput: integer(usage?.inputTokens) + integer(usage?.cacheWriteTokens),
    cacheRead: integer(usage?.cacheReadTokens),
    output: integer(usage?.outputTokens),
  };
}

/** Sum two bucket objects. */
export function addBuckets(left, right) {
  return {
    missInput: left.missInput + right.missInput,
    cacheRead: left.cacheRead + right.cacheRead,
    output: left.output + right.output,
  };
}

/** Subtract one bucket object from another, clamping at zero. */
export function subtractBuckets(left, right) {
  return {
    missInput: Math.max(0, left.missInput - right.missInput),
    cacheRead: Math.max(0, left.cacheRead - right.cacheRead),
    output: Math.max(0, left.output - right.output),
  };
}

/** Total billed tokens in one bucket object. */
export function bucketTotal(buckets) {
  return buckets.missInput + buckets.cacheRead + buckets.output;
}

/** Whether two bucket objects are equal. */
export function bucketsEqual(left, right) {
  return left.missInput === right.missInput
    && left.cacheRead === right.cacheRead
    && left.output === right.output;
}

/**
 * Resolve the price class for one provider/model pair.
 * @param {string|undefined} provider - request provider route.
 * @param {string|undefined} model - request model id.
 * @returns {'flash'|'pro'|null}
 */
export function priceClassFor(provider, model) {
  if (typeof provider !== 'string' || typeof model !== 'string') return null;
  if (!OFFICIAL_PROVIDERS.includes(provider)) return null;
  return MODEL_CLASS_BY_ID[model.trim().toLowerCase()] ?? null;
}

/** Cost in nano-currency for one price class and tier. */
function costOf(buckets, rates) {
  return buckets.missInput * rates.missInput
    + buckets.cacheRead * rates.cacheRead
    + buckets.output * rates.output;
}

/** One model's published cost figures and token totals. */
function modelCost(modelBuckets, rates) {
  const peakNano = costOf(modelBuckets.peak, rates.peak);
  const offPeakNano = costOf(modelBuckets.offPeak, rates.offPeak);
  const peakTokens = bucketTotal(modelBuckets.peak);
  const offPeakTokens = bucketTotal(modelBuckets.offPeak);
  return {
    peakNano,
    offPeakNano,
    peakTokens,
    offPeakTokens,
    tokens: peakTokens + offPeakTokens,
  };
}

/**
 * Build one region's complete cost view from state buckets.
 * @param {{flash:object,pro:object,unpriced:object}} state - projection state.
 * @param {'intl'|'cn'} regionKey - published regional table.
 * @returns {object} detached wire cost object.
 */
export function buildRegionCost(state, regionKey) {
  const published = RATES[regionKey];
  const flash = modelCost(state.flash, published.models.flash);
  const pro = modelCost(state.pro, published.models.pro);
  return {
    currency: published.currency,
    symbol: published.symbol,
    asOf: published.asOf,
    source: published.source,
    totalNano: flash.peakNano + flash.offPeakNano + pro.peakNano + pro.offPeakNano,
    peakNano: flash.peakNano + pro.peakNano,
    offPeakNano: flash.offPeakNano + pro.offPeakNano,
    flash,
    pro,
    unpricedTokens: bucketTotal(state.unpriced),
  };
}
