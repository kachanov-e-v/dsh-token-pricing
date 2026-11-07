import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectionDefinition } from '../lib/projection.js';

const PEAK = Date.UTC(2026, 10, 5, 1, 30);

function definition() {
  return createProjectionDefinition();
}

function stepStart(turn, step, time) {
  return { type: 'step/start', data: { turn, step }, time };
}

function stepEnd(turn, step, time) {
  return { type: 'step/end', data: { turn, step }, time };
}

function header(provider, model, time) {
  return {
    type: 'request/header',
    data: { header: { config: { provider, model } }, reason: 'initial' },
    time,
  };
}

function message(turn, step, time, usage, provider = 'deepseek-account', model = 'deepseek-flash') {
  return {
    type: 'assistant/message',
    data: {
      turn,
      step,
      message: {
        role: 'assistant',
        content: [],
        source: { kind: 'model', provider, model },
      },
      stream: [],
      usage,
    },
    time,
  };
}

function attempt(turn, step, time, usage) {
  return {
    type: 'assistant/attempt',
    data: {
      turn,
      step,
      stream: [{ type: 'chunk', time, chunk: { type: 'usage', usage } }],
    },
    time,
  };
}

function apply(definition, state, event) {
  const next = definition.apply(state, event);
  definition.stateSchema.parse(next);
  return next;
}

test('initial view is valid, empty, and carries both regional tables', () => {
  const projection = definition();
  const state = projection.init();
  projection.stateSchema.parse(state);
  const view = projection.wire.view(state);
  projection.wire.viewSchema.parse(view);
  assert.equal(view.sampleCount, 0);
  assert.equal(view.costs.intl.totalNano, 0);
  assert.equal(view.costs.cn.totalNano, 0);
  assert.equal(view.costs.intl.currency, 'USD');
  assert.equal(view.costs.cn.currency, 'CNY');
  assert.deepEqual(view.supportedProviders, ['deepseek-account', 'deepseek-official']);
  assert.equal(view.supportedModels.includes('deepseek-flash'), true);
  assert.equal(view.schedule.holidayYears.includes(2026), true);
});

test('a peak sample is split into both published currencies', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, header('deepseek-account', 'deepseek-flash', PEAK));
  state = apply(projection, state, message(1, 1, Date.UTC(2026, 10, 5, 11, 0), {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }));
  const view = projection.wire.view(state);
  projection.wire.viewSchema.parse(view);
  assert.equal(view.sampleCount, 1);
  assert.equal(view.costs.intl.totalNano, 1_500_000_000);
  assert.equal(view.costs.cn.totalNano, 10_000_000_000);
  assert.equal(view.buckets.flash.peak.missInput, 1_000_000);
  assert.equal(view.buckets.flash.offPeak.missInput, 0);
});

test('tariff comes from step/start, not settlement time', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, Date.UTC(2026, 10, 5, 0, 30)));
  state = apply(projection, state, message(1, 1, Date.UTC(2026, 10, 5, 9, 0), {
    inputTokens: 100,
    outputTokens: 10,
  }));
  const view = projection.wire.view(state);
  assert.equal(view.buckets.flash.offPeak.missInput, 100);
  assert.equal(view.buckets.flash.peak.missInput, 0);
});

test('same-step usage replaces the previous sample cost', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, message(1, 1, PEAK, {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }));
  const full = projection.wire.view(state).costs.intl.totalNano;
  state = apply(projection, state, message(1, 1, PEAK + 1_000, {
    inputTokens: 500_000,
    outputTokens: 500_000,
  }));
  const view = projection.wire.view(state);
  assert.equal(view.sampleCount, 1);
  assert.equal(view.costs.intl.totalNano, full / 2);
  assert.equal(view.buckets.flash.peak.missInput, 500_000);
});

test('retry closes the replacement slot and a new attempt adds cost', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, message(1, 1, PEAK, {
    inputTokens: 100_000,
    outputTokens: 100_000,
  }));
  state = apply(projection, state, {
    type: 'llm/retry-started',
    data: { turn: 1, step: 1 },
    time: PEAK + 500,
  });
  state = apply(projection, state, message(1, 1, PEAK + 1_000, {
    inputTokens: 100_000,
    outputTokens: 100_000,
  }));
  const view = projection.wire.view(state);
  assert.equal(view.sampleCount, 2);
  assert.equal(view.buckets.flash.peak.missInput, 200_000);
});

test('assistant/attempt usage is priced through the latest header', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, header('deepseek-account', 'deepseek-v4-pro', PEAK));
  state = apply(projection, state, attempt(1, 1, PEAK + 100, {
    inputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    outputTokens: 1_000_000,
  }));
  const view = projection.wire.view(state);
  assert.equal(view.costs.intl.pro.peakTokens, 3_000_000);
  assert.equal(view.costs.intl.totalNano, 1_320_000_000 + 44_000_000 + 3_960_000_000);
});

test('unknown provider or model is unpriced and never enters a priced bucket', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, header('kilo', 'deepseek-flash', PEAK));
  state = apply(projection, state, attempt(1, 1, PEAK, {
    inputTokens: 500,
    outputTokens: 100,
  }));
  const view = projection.wire.view(state);
  assert.equal(view.costs.intl.totalNano, 0);
  assert.equal(view.costs.intl.unpricedTokens, 600);
  assert.equal(view.buckets.flash.peak.missInput, 0);
});

test('a settlement without usage does not invent a sample', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  state = apply(projection, state, message(1, 1, PEAK, undefined));
  const view = projection.wire.view(state);
  assert.equal(view.sampleCount, 0);
  assert.equal(view.costs.intl.totalNano, 0);
});

test('step/end clears the start boundary', () => {
  const projection = definition();
  let state = projection.init();
  state = apply(projection, state, stepStart(1, 1, PEAK));
  assert.notEqual(state.stepStart, null);
  state = apply(projection, state, stepEnd(1, 1, PEAK + 1_000));
  assert.equal(state.stepStart, null);
});
