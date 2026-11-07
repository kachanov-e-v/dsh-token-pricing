/**
 * Client-visible `tokenPricing` projection.
 *
 * The fold classifies every provider-reported usage sample by its step's start
 * instant and by the official provider/model price class. The wire view carries
 * token buckets, both published regional cost tables (USD and CNY), the billing
 * schedule, and the model ids the client uses to decide whether to display.
 */
import { z } from 'zod';
import {
  OFFICIAL_PROVIDERS,
  SUPPORTED_MODELS,
  addBuckets,
  bucketsEqual,
  buildRegionCost,
  priceClassFor,
  subtractBuckets,
  usageToBuckets,
  zeroBuckets,
} from './rates.js';
import { SCHEDULE, billingTierAt } from './schedule.js';

const count = z.number().int().nonnegative();
const bucketSchema = z.object({
  missInput: count,
  cacheRead: count,
  output: count,
}).strict();

const pricedBucketsSchema = z.object({
  peak: bucketSchema,
  offPeak: bucketSchema,
}).strict();

const lastSchema = z.object({
  turn: count,
  step: count,
  tier: z.enum(['peak', 'offPeak']),
  modelClass: z.enum(['flash', 'pro']).nullable(),
  buckets: bucketSchema,
}).strict();

const stateSchema = z.object({
  flash: pricedBucketsSchema,
  pro: pricedBucketsSchema,
  unpriced: bucketSchema,
  sampleCount: count,
  last: lastSchema.nullable(),
  stepStart: z.object({ turn: count, step: count, time: z.number() }).strict().nullable(),
  header: z.object({ provider: z.string(), model: z.string() }).strict().nullable(),
}).strict();

const costModelSchema = z.object({
  peakNano: count,
  offPeakNano: count,
  peakTokens: count,
  offPeakTokens: count,
  tokens: count,
}).strict();

const costRegionSchema = z.object({
  currency: z.string(),
  symbol: z.string(),
  asOf: z.string(),
  source: z.string(),
  totalNano: count,
  peakNano: count,
  offPeakNano: count,
  flash: costModelSchema,
  pro: costModelSchema,
  unpricedTokens: count,
}).strict();

const scheduleSchema = z.object({
  peakWindowsUtc: z.array(z.tuple([z.number(), z.number()])),
  holidays: z.array(z.string()),
  holidayYears: z.array(z.number().int()),
}).strict();

const viewSchema = z.object({
  buckets: z.object({
    flash: pricedBucketsSchema,
    pro: pricedBucketsSchema,
    unpriced: bucketSchema,
  }).strict(),
  costs: z.object({
    intl: costRegionSchema,
    cn: costRegionSchema,
  }).strict(),
  sampleCount: count,
  schedule: scheduleSchema,
  supportedProviders: z.array(z.string()),
  supportedModels: z.array(z.string()),
}).strict();

/** Fresh initial state. */
function initialState() {
  return {
    flash: { peak: zeroBuckets(), offPeak: zeroBuckets() },
    pro: { peak: zeroBuckets(), offPeak: zeroBuckets() },
    unpriced: zeroBuckets(),
    sampleCount: 0,
    last: null,
    stepStart: null,
    header: null,
  };
}

/**
 * Extract the last provider usage sample from one compact assistant stream.
 * @param {readonly object[]|undefined} stream - durable assistant stream.
 * @returns {object|undefined}
 */
function lastStreamUsage(stream) {
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') {
      return record.chunk.usage;
    }
  }
  return undefined;
}

/**
 * The usage one durable Assistant settlement reports for its attempt.
 * @param {object} event - assistant/message or assistant/attempt.
 * @returns {object|undefined}
 */
function usageOf(event) {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) {
    return event.data.usage;
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') {
    return undefined;
  }
  return lastStreamUsage(event.data.stream);
}

/**
 * Resolve the provider/model that produced one settlement. A finalized
 * assistant message carries its own provider metadata; a failed attempt uses
 * the latest request header.
 */
function routeOf(event, state) {
  if (event.type === 'assistant/message') {
    const source = event.data.message?.source;
    if (typeof source?.provider === 'string' && typeof source?.model === 'string') {
      return { provider: source.provider, model: source.model };
    }
  }
  return state.header;
}

/** Add one sample's contribution to immutable state. */
function addContribution(state, tier, modelClass, buckets) {
  if (modelClass === null) {
    return { ...state, unpriced: addBuckets(state.unpriced, buckets) };
  }
  return {
    ...state,
    [modelClass]: {
      ...state[modelClass],
      [tier]: addBuckets(state[modelClass][tier], buckets),
    },
  };
}

/** Remove a previous sample's contribution from immutable state. */
function removeContribution(state, contribution) {
  if (contribution.modelClass === null) {
    return { ...state, unpriced: subtractBuckets(state.unpriced, contribution.buckets) };
  }
  return {
    ...state,
    [contribution.modelClass]: {
      ...state[contribution.modelClass],
      [contribution.tier]: subtractBuckets(
        state[contribution.modelClass][contribution.tier],
        contribution.buckets,
      ),
    },
  };
}

/** Whether two stored samples describe the same non-monetary contribution. */
function sameContribution(left, right) {
  return left.tier === right.tier
    && left.modelClass === right.modelClass
    && bucketsEqual(left.buckets, right.buckets);
}

/** Build the client wire view. */
function buildView(state) {
  return {
    buckets: {
      flash: state.flash,
      pro: state.pro,
      unpriced: state.unpriced,
    },
    costs: {
      intl: buildRegionCost(state, 'intl'),
      cn: buildRegionCost(state, 'cn'),
    },
    sampleCount: state.sampleCount,
    schedule: SCHEDULE,
    supportedProviders: OFFICIAL_PROVIDERS,
    supportedModels: SUPPORTED_MODELS,
  };
}

/** One projection definition for the mounted plugin. */
export function createProjectionDefinition() {
  return {
    key: 'tokenPricing',
    stateVersion: 1,
    stateSchema,
    init: initialState,
    apply(state, event) {
      switch (event.type) {
        case 'step/start':
          return {
            ...state,
            stepStart: {
              turn: event.data.turn,
              step: event.data.step,
              time: event.time,
            },
          };
        case 'step/end':
          if (
            state.stepStart !== null
            && state.stepStart.turn === event.data.turn
            && state.stepStart.step === event.data.step
          ) {
            return { ...state, stepStart: null };
          }
          return state;
        case 'request/header': {
          const config = event.data?.header?.config;
          if (typeof config?.provider !== 'string' || typeof config?.model !== 'string') {
            return state;
          }
          if (
            state.header?.provider === config.provider
            && state.header?.model === config.model
          ) {
            return state;
          }
          return {
            ...state,
            header: { provider: config.provider, model: config.model },
          };
        }
        case 'llm/retry-started':
          if (
            state.last !== null
            && state.last.turn === event.data.turn
            && state.last.step === event.data.step
          ) {
            return { ...state, last: null };
          }
          return state;
        case 'assistant/message':
        case 'assistant/attempt': {
          const usage = usageOf(event);
          if (usage === undefined) return state;
          const { turn, step } = event.data;
          const route = routeOf(event, state);
          const modelClass = route === null || route === undefined
            ? null
            : priceClassFor(route.provider, route.model);
          const stepTime = state.stepStart !== null
            && state.stepStart.turn === turn
            && state.stepStart.step === step
            ? state.stepStart.time
            : event.time;
          const tier = billingTierAt(stepTime);
          const buckets = usageToBuckets(usage);
          const previous = state.last !== null
            && state.last.turn === turn
            && state.last.step === step
            ? state.last
            : null;
          const nextContribution = { turn, step, tier, modelClass, buckets };
          if (previous !== null && sameContribution(previous, nextContribution)) {
            return state;
          }
          let next = previous === null ? state : removeContribution(state, previous);
          next = addContribution(next, tier, modelClass, buckets);
          return {
            ...next,
            sampleCount: previous === null ? state.sampleCount + 1 : state.sampleCount,
            last: nextContribution,
          };
        }
        default:
          return state;
      }
    },
    wire: {
      viewSchema,
      view: buildView,
    },
  };
}
