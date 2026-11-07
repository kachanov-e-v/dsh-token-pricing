/**
 * Client half: a compact composer-dock line showing the current published
 * DeepSeek billing window, the detected local time, and this session's token
 * cost in the user's regional currency.
 *
 * The component is hidden unless the session's current model is an official
 * DeepSeek route with a published rate. All cost arithmetic and both published
 * regional tables arrive from the host projection; this file only detects the
 * region, selects the matching table, and renders.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-token-pricing',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const NS = 'tokenPricing';
    let createPortal = null;
    try {
      const ReactDOM = require('react-dom');
      if (typeof ReactDOM?.createPortal === 'function') createPortal = ReactDOM.createPortal;
    } catch {
      // The host may expose only React to plain plugins; the dock fallback is still usable.
    }

    const CHINA_TIME_ZONES = new Set([
      'Asia/Shanghai',
      'Asia/Chongqing',
      'Asia/Harbin',
      'Asia/Urumqi',
      'PRC',
    ]);
    const CHINA_OFFSET_MS = 8 * 60 * 60_000;
    const MINUTE_MS = 60_000;
    const SEARCH_HORIZON_MS = 8 * 24 * 60 * 60_000;

    const ru = {
      modePeak: 'Peak',
      modeOffPeak: 'Off-Peak',
      peakHint: 'Пиковый тариф',
      offPeakHint: 'Вне пика',
      sessionCost: 'Расход сессии: {cost}',
      noUsage: 'Расход сессии: нет данных',
      unpricedOnly: 'Расход сессии: нет тарифа',
      unpricedShort: 'часть без тарифа',
      nextChange: 'Далее: {mode} в {time}',
      nextChangeUnknown: 'Следующая смена не определена',
      countdown: 'через {duration}',
      hoursMinutes: '{hours} ч {minutes} мин',
      minutesOnly: '{minutes} мин',
      peakRow: 'Peak: {tokens} ток. · {cost}',
      offPeakRow: 'Off-Peak: {tokens} ток. · {cost}',
      modelRow: '{model}: Peak {peakTokens} / Off-Peak {offPeakTokens} · {cost}',
      unpricedRow: 'Без тарифа: {tokens} ток. — модель или провайдер вне опубликованных тарифов DeepSeek',
      regionLine: 'Регион: {region} · {zone} · тариф {tariff}',
      intlTariff: 'International (USD)',
      chinaTariff: 'China (CNY)',
      scheduleNote: 'Peak: 01:00–04:00 и 06:00–10:00 UTC, Пн–Пт, кроме праздников КНР. Остальное — Off-Peak.',
      holidayNote: 'Календарь праздников КНР: {years}.',
      holidayWarning: 'Текущий год ({year}) не покрыт календарём праздников КНР; режим рассчитан только по будням.',
      estimateNote: 'Оценка по usage от API и опубликованным тарифам, не счёт DeepSeek. Search/Fetch и дочерние сессии не входят.',
      pricesAsOf: 'Тарифы на {date}.',
      docs: 'Тарифы DeepSeek',
      details: 'Подробнее',
      popupTitle: 'Стоимость токенов',
      close: 'Закрыть',
      collapse: 'Свернуть',
      regionUnknown: 'не определён',
      zoneFallback: 'Таймзона не определена, показано UTC.',
      summary: '{mode}, {time} {zone}. {cost}.',
    };

    const en = {
      modePeak: 'Peak',
      modeOffPeak: 'Off-Peak',
      peakHint: 'Peak tariff',
      offPeakHint: 'Off-peak tariff',
      sessionCost: 'Session cost: {cost}',
      noUsage: 'Session cost: no usage data',
      unpricedOnly: 'Session cost: no published rate',
      unpricedShort: 'part unpriced',
      nextChange: 'Next: {mode} at {time}',
      nextChangeUnknown: 'Next change not determined',
      countdown: 'in {duration}',
      hoursMinutes: '{hours} h {minutes} min',
      minutesOnly: '{minutes} min',
      peakRow: 'Peak: {tokens} tok. · {cost}',
      offPeakRow: 'Off-Peak: {tokens} tok. · {cost}',
      modelRow: '{model}: Peak {peakTokens} / Off-Peak {offPeakTokens} · {cost}',
      unpricedRow: 'Unpriced: {tokens} tok. — model or provider outside DeepSeek published rates',
      regionLine: 'Region: {region} · {zone} · tariff {tariff}',
      intlTariff: 'International (USD)',
      chinaTariff: 'China (CNY)',
      scheduleNote: 'Peak: 01:00–04:00 and 06:00–10:00 UTC, Mon–Fri, excluding Chinese public holidays. Everything else is Off-Peak.',
      holidayNote: 'Chinese public holiday calendar: {years}.',
      holidayWarning: 'The current year ({year}) is outside the embedded Chinese holiday calendar; only weekdays are applied.',
      estimateNote: 'An estimate from provider-reported usage and published rates, not a DeepSeek invoice. Search/Fetch and descendant sessions are excluded.',
      pricesAsOf: 'Rates as of {date}.',
      docs: 'DeepSeek pricing',
      details: 'Details',
      popupTitle: 'Token cost',
      close: 'Close',
      collapse: 'Collapse',
      regionUnknown: 'not determined',
      zoneFallback: 'The time zone could not be determined; UTC is shown.',
      summary: '{mode}, {time} {zone}. {cost}.',
    };

    const OUTER = {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '2px 8px 0',
      fontSize: 11,
      lineHeight: '16px',
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
    };
    const BUTTON = {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '100%',
      padding: 0,
      border: 0,
      background: 'none',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'center',
      cursor: 'pointer',
    };
    const POPOVER = {
      position: 'fixed',
      zIndex: 1300,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      padding: '10px 12px',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 12,
      background: 'var(--dsw-alias-bg-overlay)',
      boxShadow: 'var(--dsw-elevation-prominent, 0 10px 30px rgba(0, 0, 0, 0.22))',
      color: 'var(--dsw-alias-label-secondary)',
      lineHeight: 1.55,
      textAlign: 'left',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
    };
    const POPOVER_HEADER = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 2,
    };
    const CLOSE_BUTTON = {
      flex: 'none',
      width: 22,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      border: 0,
      borderRadius: 6,
      background: 'none',
      color: 'var(--dsw-alias-label-secondary)',
      font: 'inherit',
      fontSize: 16,
      lineHeight: 1,
      cursor: 'pointer',
    };
    const DOT = {
      width: 6,
      height: 6,
      borderRadius: '50%',
      flex: 'none',
    };
    const STRONG = {
      color: 'var(--dsw-alias-label-primary)',
      fontWeight: 600,
    };
    const NOTE = {
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: 10,
      lineHeight: 1.45,
    };
    const LINK = {
      color: 'var(--dsw-alias-brand-primary)',
      textDecoration: 'none',
    };

    /** Browser locale list, preferring the system preferences. */
    function browserLocales() {
      try {
        if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) && navigator.languages.length > 0) {
          return Array.from(navigator.languages);
        }
      } catch {
        // Fall through to the resolved Intl locale.
      }
      try {
        return [new Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'];
      } catch {
        return ['en-US'];
      }
    }

    /** Extract a region subtag from one BCP-47 locale. */
    function regionFromLocale(locale) {
      if (typeof locale !== 'string' || locale.length === 0) return null;
      try {
        const parsed = new Intl.Locale(locale);
        if (parsed.region) return parsed.region.toUpperCase();
      } catch {
        // Some older engines lack Intl.Locale; fall through to the tag regex.
      }
      const match = /^[a-z]{2,3}[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale);
      return match ? match[1].toUpperCase() : null;
    }

    /** Display name for a region code, when the engine supports it. */
    function regionDisplayName(code, locale) {
      if (code === null) return null;
      try {
        return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    }

    /**
     * Detect the user's region from the browser.
     *
     * The IANA time zone selects the published pricing table (mainland China
     * uses CNY, everywhere else the international USD table) and local time.
     * The locale region is a fallback when no time zone is available.
     * @param {{timeZone?:string, locales?:string[]}} [input] - test override.
     */
    function detectRegion(input = {}) {
      let timeZone = input.timeZone;
      if (timeZone === undefined) {
        try {
          timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          timeZone = undefined;
        }
      }
      const zoneAvailable = typeof timeZone === 'string' && timeZone.length > 0;
      const zone = zoneAvailable ? timeZone : 'UTC';
      const locales = Array.isArray(input.locales) && input.locales.length > 0
        ? input.locales
        : browserLocales();
      let regionCode = null;
      for (const locale of locales) {
        regionCode = regionFromLocale(locale);
        if (regionCode !== null) break;
      }
      const pricingKey = CHINA_TIME_ZONES.has(zone) || (!zoneAvailable && regionCode === 'CN')
        ? 'cn'
        : 'intl';
      const label = regionDisplayName(regionCode, locales[0] || 'en-US') || zone;
      return {
        timeZone: zone,
        zoneAvailable,
        regionCode,
        label,
        pricingKey,
      };
    }

    /** Whether the current selection is an official route with a published rate. */
    function isSuitable(selection, pricing) {
      if (!selection || !pricing) return false;
      return pricing.supportedProviders.includes(selection.provider)
        && pricing.supportedModels.includes(selection.model);
    }

    /** Asia/Shanghai calendar date for one instant. */
    function chinaDateKey(timeMs) {
      return new Date(timeMs + CHINA_OFFSET_MS).toISOString().slice(0, 10);
    }

    /** Current tier under the wire schedule. */
    function modeAt(timeMs, schedule) {
      if (!schedule || !Array.isArray(schedule.peakWindowsUtc)) return 'offPeak';
      const date = new Date(timeMs);
      if (!Number.isFinite(date.getTime())) return 'offPeak';
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) return 'offPeak';
      if (Array.isArray(schedule.holidays) && schedule.holidays.includes(chinaDateKey(timeMs))) {
        return 'offPeak';
      }
      const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
      for (const window of schedule.peakWindowsUtc) {
        if (!Array.isArray(window) || window.length < 2) continue;
        if (minutes >= window[0] * 60 && minutes < window[1] * 60) return 'peak';
      }
      return 'offPeak';
    }

    /** First later instant in the wire schedule whose tier differs. */
    function nextTransition(timeMs, schedule) {
      if (!Number.isFinite(timeMs)) return null;
      const current = modeAt(timeMs, schedule);
      let cursor = Math.ceil(timeMs / MINUTE_MS) * MINUTE_MS;
      if (cursor <= timeMs) cursor += MINUTE_MS;
      const horizon = timeMs + SEARCH_HORIZON_MS;
      for (; cursor <= horizon; cursor += MINUTE_MS) {
        if (modeAt(cursor, schedule) !== current) return cursor;
      }
      return null;
    }

    /** Format a nano-currency amount without hiding a tiny nonzero cost. */
    function formatMoney(nano, symbol) {
      const value = (Number.isFinite(nano) ? Math.max(0, nano) : 0) / 1e9;
      const mark = typeof symbol === 'string' ? symbol : '';
      if (!(value > 0)) return `${mark}0.000000`;
      if (value < 0.0000005) return `< ${mark}0.000001`;
      const digits = value < 0.01 ? 6 : value < 1 ? 4 : 2;
      return `${mark}${value.toFixed(digits)}`;
    }

    /** Group an integer token count in the active locale. */
    function formatTokens(value, locale) {
      try {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
      } catch {
        return String(value);
      }
    }

    /** Local clock for one instant. */
    function formatLocalTime(timeMs, timeZone, locale) {
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(timeMs));
      } catch {
        return new Date(timeMs).toISOString().slice(11, 16);
      }
    }

    /** Local clock plus date for the next transition. */
    function formatLocalDateTime(timeMs, timeZone, locale) {
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone,
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(timeMs));
      } catch {
        return new Date(timeMs).toISOString().slice(5, 16).replace('T', ' ');
      }
    }

    /** Short time-zone name, such as MSK or GMT+3. */
    function formatZoneName(timeMs, timeZone, locale) {
      try {
        const parts = new Intl.DateTimeFormat(locale, {
          timeZone,
          timeZoneName: 'short',
        }).formatToParts(new Date(timeMs));
        return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
      } catch {
        return 'UTC';
      }
    }

    /** Duration as hours/minutes through the active dictionary. */
    function formatDuration(ms, t) {
      const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0
        ? t('hoursMinutes', { hours, minutes })
        : t('minutesOnly', { minutes });
    }

    /** Place a fixed popover over or below the dock trigger. */
    function popoverPosition(trigger) {
      if (trigger === null || typeof window === 'undefined') return null;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const width = Math.min(380, Math.max(220, window.innerWidth - margin * 2));
      const centered = rect.left + rect.width / 2 - width / 2;
      const left = Math.min(
        Math.max(margin, centered),
        Math.max(margin, window.innerWidth - width - margin),
      );
      if (rect.top >= 260) {
        return {
          left,
          width,
          bottom: Math.max(margin, window.innerHeight - rect.top + gap),
          maxHeight: Math.max(160, rect.top - margin - gap),
        };
      }
      const top = Math.min(rect.bottom + gap, window.innerHeight - margin - 160);
      return {
        left,
        width,
        top: Math.max(margin, top),
        maxHeight: Math.max(160, window.innerHeight - top - margin),
      };
    }

    /** One compact composer-dock status row with a click-opened popover. */
    function TokenPricingStatus({ useProjection, t }) {
      const pricing = useProjection('tokenPricing');
      const modelSelection = useProjection('modelSelection');
      const [now, setNow] = React.useState(Date.now());
      const [open, setOpen] = React.useState(false);
      const [popover, setPopover] = React.useState(null);
      const triggerRef = React.useRef(null);
      const popoverRef = React.useRef(null);
      const closeRef = React.useRef(null);
      const region = React.useMemo(() => detectRegion(), []);

      const closePopover = (restoreFocus) => {
        setOpen(false);
        setPopover(null);
        if (restoreFocus) triggerRef.current?.focus();
      };
      const togglePopover = () => {
        if (open) {
          closePopover(false);
          return;
        }
        const position = popoverPosition(triggerRef.current);
        if (position === null) return;
        setPopover(position);
        setOpen(true);
      };

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
      }, []);

      React.useEffect(() => {
        if (!open) return undefined;
        closeRef.current?.focus({ preventScroll: true });
        const reposition = () => {
          const position = popoverPosition(triggerRef.current);
          if (position !== null) setPopover(position);
        };
        const onPointerDown = (event) => {
          if (triggerRef.current?.contains(event.target)) return;
          if (popoverRef.current?.contains(event.target)) return;
          closePopover(false);
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          closePopover(true);
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          window.removeEventListener('resize', reposition);
          window.removeEventListener('scroll', reposition, true);
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      if (!pricing) return null;
      const selection = modelSelection && modelSelection.next ? modelSelection.next : null;
      if (!isSuitable(selection, pricing)) return null;

      const costs = pricing.costs[region.pricingKey] ?? pricing.costs.intl;
      const locale = browserLocales()[0] || 'en-US';
      const mode = modeAt(now, pricing.schedule);
      const modeLabel = t(mode === 'peak' ? 'modePeak' : 'modeOffPeak');
      const timeText = formatLocalTime(now, region.timeZone, locale);
      const zoneText = formatZoneName(now, region.timeZone, locale);
      const next = nextTransition(now, pricing.schedule);
      const nextModeLabel = next === null
        ? null
        : t(modeAt(next, pricing.schedule) === 'peak' ? 'modePeak' : 'modeOffPeak');
      const nextTimeText = next === null
        ? null
        : formatLocalDateTime(next, region.timeZone, locale);
      const countdown = next === null
        ? null
        : formatDuration(next - now, t);

      let costText;
      if (pricing.sampleCount === 0) {
        costText = t('noUsage');
      } else if (costs.totalNano === 0 && costs.unpricedTokens > 0) {
        costText = t('unpricedOnly');
      } else {
        costText = t('sessionCost', { cost: formatMoney(costs.totalNano, costs.symbol) });
      }
      const hasUnpriced = costs.unpricedTokens > 0;
      const summary = t('summary', {
        mode: modeLabel,
        time: timeText,
        zone: zoneText,
        cost: costText,
      });

      const details = [];
      if (next !== null) {
        details.push(h('div', { key: 'next' }, `${t('nextChange', { mode: nextModeLabel, time: nextTimeText })} · ${t('countdown', { duration: countdown })}`));
      } else {
        details.push(h('div', { key: 'next' }, t('nextChangeUnknown')));
      }
      details.push(h('div', { key: 'region' }, t('regionLine', {
        region: region.label,
        zone: region.timeZone,
        tariff: t(region.pricingKey === 'cn' ? 'chinaTariff' : 'intlTariff'),
      })));
      if (!region.zoneAvailable) {
        details.push(h('div', { key: 'zoneFallback', style: NOTE }, t('zoneFallback')));
      }
      if (pricing.sampleCount > 0) {
        const peakTokens = costs.flash.peakTokens + costs.pro.peakTokens;
        const offPeakTokens = costs.flash.offPeakTokens + costs.pro.offPeakTokens;
        details.push(h('div', { key: 'peak' }, t('peakRow', {
          tokens: formatTokens(peakTokens, locale),
          cost: formatMoney(costs.peakNano, costs.symbol),
        })));
        details.push(h('div', { key: 'offPeak' }, t('offPeakRow', {
          tokens: formatTokens(offPeakTokens, locale),
          cost: formatMoney(costs.offPeakNano, costs.symbol),
        })));
        if (costs.flash.tokens > 0) {
          details.push(h('div', { key: 'flash' }, t('modelRow', {
            model: 'Flash',
            peakTokens: formatTokens(costs.flash.peakTokens, locale),
            offPeakTokens: formatTokens(costs.flash.offPeakTokens, locale),
            cost: formatMoney(costs.flash.peakNano + costs.flash.offPeakNano, costs.symbol),
          })));
        }
        if (costs.pro.tokens > 0) {
          details.push(h('div', { key: 'pro' }, t('modelRow', {
            model: 'Pro',
            peakTokens: formatTokens(costs.pro.peakTokens, locale),
            offPeakTokens: formatTokens(costs.pro.offPeakTokens, locale),
            cost: formatMoney(costs.pro.peakNano + costs.pro.offPeakNano, costs.symbol),
          })));
        }
        if (hasUnpriced) {
          details.push(h('div', {
            key: 'unpriced',
            style: { color: 'var(--dsw-alias-state-warn-primary)' },
          }, t('unpricedRow', { tokens: formatTokens(costs.unpricedTokens, locale) })));
        }
      }
      details.push(h('div', { key: 'schedule', style: NOTE }, t('scheduleNote')));
      const chinaYear = new Date(now + CHINA_OFFSET_MS).getUTCFullYear();
      details.push(h('div', { key: 'holiday', style: NOTE }, pricing.schedule.holidayYears.includes(chinaYear)
        ? t('holidayNote', { years: pricing.schedule.holidayYears.join(', ') })
        : t('holidayWarning', { year: chinaYear })));
      details.push(h('div', { key: 'estimate', style: NOTE }, t('estimateNote')));
      details.push(h('div', { key: 'source', style: NOTE },
        `${t('pricesAsOf', { date: costs.asOf })} `,
        h('a', {
          href: costs.source,
          target: '_blank',
          rel: 'noreferrer',
          style: LINK,
        }, t('docs')),
      ));

      const popupNode = open && popover !== null
        ? h('div', {
          key: 'popover',
          ref: popoverRef,
          id: 'token-pricing-popover',
          role: 'dialog',
          'aria-label': t('popupTitle'),
          tabIndex: -1,
          style: { ...POPOVER, ...popover },
        }, [
          h('div', { key: 'popoverHeader', style: POPOVER_HEADER }, [
            h('span', { key: 'title', style: STRONG }, t('popupTitle')),
            h('button', {
              key: 'close',
              ref: closeRef,
              type: 'button',
              style: CLOSE_BUTTON,
              'aria-label': t('close'),
              title: t('close'),
              onClick: () => closePopover(true),
            }, '×'),
          ]),
          ...details,
        ])
        : null;
      const mountedPopover = popupNode !== null && createPortal !== null && typeof document !== 'undefined'
        ? createPortal(popupNode, document.body)
        : popupNode;

      return h('div', { style: OUTER }, [
        h('button', {
          key: 'trigger',
          ref: triggerRef,
          type: 'button',
          style: BUTTON,
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          'aria-controls': 'token-pricing-popover',
          'aria-label': summary,
          title: summary,
          onClick: togglePopover,
        }, [
          h('span', {
            key: 'dot',
            'aria-hidden': true,
            style: {
              ...DOT,
              background: mode === 'peak'
                ? 'var(--dsw-alias-state-warn-primary)'
                : 'var(--dsw-alias-state-success-primary)',
            },
          }),
          h('span', { key: 'mode', style: STRONG }, modeLabel),
          h('span', { key: 'sep1', 'aria-hidden': true }, '·'),
          h('span', { key: 'time' }, `${timeText} ${zoneText}`),
          h('span', { key: 'sep2', 'aria-hidden': true }, '·'),
          h('span', { key: 'cost' }, costText),
          hasUnpriced
            ? h('span', {
              key: 'warning',
              title: t('unpricedShort'),
              style: { color: 'var(--dsw-alias-state-warn-primary)' },
            }, '!')
            : null,
          h('span', { key: 'chevron', 'aria-hidden': true }, open ? '▴' : '▾'),
        ]),
        mountedPopover,
      ]);
    }

    const api = {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { ru, en }),
          'token-pricing: dictionaries',
        );
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'token-pricing-status',
          order: 2,
          locale: NS,
        }, TokenPricingStatus));
      },
    };

    if (typeof window !== 'undefined' && window.__DSH_TOKEN_PRICING_TEST__ === true) {
      api.__test = {
        browserLocales,
        regionFromLocale,
        detectRegion,
        isSuitable,
        modeAt,
        nextTransition,
        formatMoney,
        formatTokens,
        formatLocalTime,
        formatLocalDateTime,
        formatZoneName,
        formatDuration,
        TokenPricingStatus,
      };
    }

    return api;
  },
});
