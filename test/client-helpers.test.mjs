import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { SCHEDULE } from '../lib/schedule.js';
import { createProjectionDefinition } from '../lib/projection.js';

let captured;
globalThis.window = {
  __DSH_TOKEN_PRICING_TEST__: true,
  __ModuleLoader__: {
    load(definition) {
      captured = definition;
    },
  },
};

let stateCalls = 0;
const reactStub = {
  createElement(type, props, ...children) {
    return { type, props, children };
  },
  useState(initial) {
    stateCalls += 1;
    if (stateCalls === 2) return [true, () => {}];
    if (stateCalls === 3) {
      return [{ left: 10, top: 10, width: 300, maxHeight: 200 }, () => {}];
    }
    return [initial, () => {}];
  },
  useEffect() {},
  useMemo(fn) {
    return fn();
  },
  useRef(initial) {
    return { current: initial ?? null };
  },
};

await import(`${pathToFileURL(resolve('client.js')).href}?test=${Date.now()}`);
assert.ok(captured, 'client module must register through the module loader');
const client = captured.factory((id) => {
  if (id === 'react') return reactStub;
  throw new Error(`unexpected require: ${id}`);
});
assert.ok(client.__test, 'test hooks must be exposed under the test flag');
const helpers = client.__test;

test('Moscow locale and time zone select the international USD table', () => {
  const region = helpers.detectRegion({ timeZone: 'Europe/Moscow', locales: ['ru-RU'] });
  assert.equal(region.timeZone, 'Europe/Moscow');
  assert.equal(region.zoneAvailable, true);
  assert.equal(region.regionCode, 'RU');
  assert.equal(region.pricingKey, 'intl');
});

test('mainland China time zone selects the CNY table', () => {
  const region = helpers.detectRegion({ timeZone: 'Asia/Shanghai', locales: ['zh-CN'] });
  assert.equal(region.pricingKey, 'cn');
  assert.equal(region.regionCode, 'CN');
});

test('time zone takes precedence over a conflicting locale', () => {
  const region = helpers.detectRegion({ timeZone: 'Europe/Moscow', locales: ['zh-CN'] });
  assert.equal(region.pricingKey, 'intl');
});

test('locale CN is used only when no time zone is available', () => {
  const region = helpers.detectRegion({ timeZone: '', locales: ['zh-CN'] });
  assert.equal(region.zoneAvailable, false);
  assert.equal(region.timeZone, 'UTC');
  assert.equal(region.pricingKey, 'cn');
  const fallback = helpers.detectRegion({ timeZone: '', locales: ['ru-RU'] });
  assert.equal(fallback.pricingKey, 'intl');
});

test('region extraction handles script-qualified locale tags', () => {
  assert.equal(helpers.regionFromLocale('zh-Hans-CN'), 'CN');
  assert.equal(helpers.regionFromLocale('ru-RU'), 'RU');
  assert.equal(helpers.regionFromLocale('en'), null);
});

test('model gating accepts only official routes with published models', () => {
  const supported = {
    supportedProviders: ['deepseek-account', 'deepseek-official'],
    supportedModels: ['deepseek-flash', 'deepseek-v4-pro'],
  };
  assert.equal(helpers.isSuitable({ provider: 'deepseek-account', model: 'deepseek-flash' }, supported), true);
  assert.equal(helpers.isSuitable({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }, supported), true);
  assert.equal(helpers.isSuitable({ provider: 'kilo', model: 'deepseek-flash' }, supported), false);
  assert.equal(helpers.isSuitable({ provider: 'deepseek-account', model: 'other' }, supported), false);
  assert.equal(helpers.isSuitable(null, supported), false);
});

test('client mode and next transition agree with the published schedule', () => {
  assert.equal(helpers.modeAt(Date.UTC(2026, 10, 5, 2, 0), SCHEDULE), 'peak');
  assert.equal(helpers.modeAt(Date.UTC(2026, 10, 7, 2, 0), SCHEDULE), 'offPeak');
  assert.equal(helpers.modeAt(Date.UTC(2026, 9, 1, 2, 0), SCHEDULE), 'offPeak');
  assert.equal(
    helpers.nextTransition(Date.UTC(2026, 10, 6, 9, 59, 30), SCHEDULE),
    Date.UTC(2026, 10, 6, 10, 0),
  );
});

test('money formatting keeps tiny nonzero costs visible', () => {
  assert.equal(helpers.formatMoney(1_500_000_000, '$'), '$1.50');
  assert.equal(helpers.formatMoney(123_000, '$'), '$0.000123');
  assert.equal(helpers.formatMoney(100, '$'), '< $0.000001');
  assert.equal(helpers.formatMoney(0, '¥'), '¥0.000000');
});

test('local time is formatted in the detected time zone', () => {
  const text = helpers.formatLocalTime(Date.UTC(2026, 10, 5, 10, 39), 'Europe/Moscow', 'ru-RU');
  assert.match(text, /13:39/);
});

test('duration formatting uses localized units', () => {
  const t = (key, values) => `${key}:${JSON.stringify(values)}`;
  assert.match(helpers.formatDuration(3_600_000, t), /hoursMinutes/);
  assert.match(helpers.formatDuration(120_000, t), /minutesOnly/);
});

test('component hides for an unsuitable selection and renders for an official one', () => {
  const projection = createProjectionDefinition();
  const view = projection.wire.view(projection.init());
  const t = (key) => key;
  const render = (selection) => {
    stateCalls = 0;
    return helpers.TokenPricingStatus({
      t,
      useProjection(key) {
        return key === 'tokenPricing' ? view : { next: selection };
      },
    });
  };
  assert.equal(render({ provider: 'kilo', model: 'deepseek-flash' }), null);
  assert.equal(render(null), null);
  const tree = render({ provider: 'deepseek-account', model: 'deepseek-flash' });
  assert.ok(tree, 'official selection must render the dock row');
  const rendered = tree.children[0];
  assert.ok(rendered, 'the dock row must have children');
  assert.ok(rendered[0].children[0].length >= 6, 'the trigger must render the dock row content');
  assert.equal(rendered.length, 2, 'an open click state renders the popover');
});

