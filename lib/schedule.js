/**
 * The published DeepSeek billing window.
 *
 * Peak hours are absolute UTC intervals. China's official holidays are keyed
 * by the Asia/Shanghai calendar date, so a request at any instant is classified
 * independently of the browser's local time zone.
 */

/** Half-open peak intervals, in UTC hours. */
export const PEAK_WINDOWS_UTC = Object.freeze([
  Object.freeze([1, 4]),
  Object.freeze([6, 10]),
]);

/**
 * Chinese public holidays in 2026, from the State Council notice:
 * https://www.gov.cn/zhengce/content/202511/content_7047090.htm
 *
 * Every date in each holiday period is listed. Adjusted working weekends stay
 * off-peak because all Saturdays and Sundays are off-peak.
 */
export const HOLIDAYS_2026 = Object.freeze([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
]);

/** Calendar years covered by the embedded holiday table. */
export const HOLIDAY_YEARS = Object.freeze([2026]);

const HOLIDAY_SET = new Set(HOLIDAYS_2026);
const MINUTE_MS = 60_000;
const CHINA_OFFSET_MS = 8 * 60 * 60_000;
const SEARCH_HORIZON_MS = 8 * 24 * 60 * 60_000;

/** Stable wire copy of the schedule. */
export const SCHEDULE = Object.freeze({
  peakWindowsUtc: PEAK_WINDOWS_UTC,
  holidays: HOLIDAYS_2026,
  holidayYears: HOLIDAY_YEARS,
});

/**
 * The Asia/Shanghai calendar date (UTC+8, no daylight saving) for an instant.
 * @param {number} timeMs - epoch milliseconds.
 * @returns {string} ISO `YYYY-MM-DD`.
 */
export function chinaDateKey(timeMs) {
  return new Date(timeMs + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Classify one instant under the published schedule.
 * @param {number} timeMs - epoch milliseconds.
 * @returns {'peak'|'offPeak'}
 */
export function billingTierAt(timeMs) {
  if (!Number.isFinite(timeMs)) return 'offPeak';
  const date = new Date(timeMs);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return 'offPeak';
  if (HOLIDAY_SET.has(chinaDateKey(timeMs))) return 'offPeak';
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  for (const [startHour, endHour] of PEAK_WINDOWS_UTC) {
    if (minutes >= startHour * 60 && minutes < endHour * 60) return 'peak';
  }
  return 'offPeak';
}

/**
 * Find the first later minute whose tier differs from the tier at `timeMs`.
 * Scanning per minute also crosses holiday midnights correctly.
 * @param {number} timeMs - epoch milliseconds.
 * @returns {number|null} transition instant, or null when none is found.
 */
export function nextTransition(timeMs) {
  if (!Number.isFinite(timeMs)) return null;
  const current = billingTierAt(timeMs);
  let cursor = Math.ceil(timeMs / MINUTE_MS) * MINUTE_MS;
  if (cursor <= timeMs) cursor += MINUTE_MS;
  const horizon = timeMs + SEARCH_HORIZON_MS;
  for (; cursor <= horizon; cursor += MINUTE_MS) {
    if (billingTierAt(cursor) !== current) return cursor;
  }
  return null;
}
