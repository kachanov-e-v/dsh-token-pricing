import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOLIDAYS_2026,
  HOLIDAY_YEARS,
  SCHEDULE,
  billingTierAt,
  chinaDateKey,
  nextTransition,
} from '../lib/schedule.js';

const utc = (...parts) => Date.UTC(...parts);

test('peak boundaries use half-open UTC intervals', () => {
  assert.equal(billingTierAt(utc(2026, 10, 5, 0, 59)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 1, 0)), 'peak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 3, 59)), 'peak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 4, 0)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 5, 59)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 6, 0)), 'peak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 9, 59)), 'peak');
  assert.equal(billingTierAt(utc(2026, 10, 5, 10, 0)), 'offPeak');
});

test('weekends are off-peak in full', () => {
  assert.equal(billingTierAt(utc(2026, 10, 7, 2, 0)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 10, 8, 2, 0)), 'offPeak');
});

test('Chinese public holidays are off-peak by Asia/Shanghai date', () => {
  assert.equal(chinaDateKey(utc(2026, 8, 30, 16, 0)), '2026-10-01');
  assert.equal(billingTierAt(utc(2026, 8, 30, 2, 0)), 'peak');
  assert.equal(billingTierAt(utc(2026, 9, 1, 2, 0)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 9, 7, 2, 0)), 'offPeak');
  assert.equal(billingTierAt(utc(2026, 9, 8, 2, 0)), 'peak');
  assert.equal(HOLIDAY_YEARS.includes(2026), true);
  assert.equal(HOLIDAYS_2026.includes('2026-10-01'), true);
});

test('next transition crosses a peak boundary', () => {
  assert.equal(
    nextTransition(utc(2026, 10, 6, 9, 59, 30), SCHEDULE),
    utc(2026, 10, 6, 10, 0),
  );
});

test('next transition crosses the weekend', () => {
  assert.equal(
    nextTransition(utc(2026, 10, 6, 10, 0), SCHEDULE),
    utc(2026, 10, 9, 1, 0),
  );
});

test('next transition skips the full National Day holiday period', () => {
  assert.equal(
    nextTransition(utc(2026, 8, 30, 10, 0), SCHEDULE),
    utc(2026, 9, 8, 1, 0),
  );
});
