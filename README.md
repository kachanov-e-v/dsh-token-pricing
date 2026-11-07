# dsh-token-pricing

Плагин для **DeepSeek Harness Web GUI**: показывает под композером текущий режим **Peak / Off-Peak**, определённое местное время и стоимость токенов текущей сессии по официальным тарифам DeepSeek. По клику открывается всплывающая панель с расшифровкой.

- Репозиторий: <https://github.com/kachanov-e-v/dsh-token-pricing>
- Версия: **1.0.2**
- Лицензия: MIT

## Что показывает

Свёрнутая строка выглядит примерно так:

```text
● OFF-PEAK · 19:44 GMT+3 · Расход сессии: $0.0123 · ▾
```

- цвет и текст показывают текущий режим;
- время и таймзона определяются браузером;
- стоимость считается по provider-reported usage текущей сессии;
- по клику открывается popover: следующая смена режима, регион/валюта, разбивка Peak/Off-Peak, Flash/Pro, нетарифицированные токены, ссылка на документацию.

Popover закрывается по `×`, клику вне панели и `Escape`. После закрытия фокус возвращается на строку.

## Возможности

- Текущий режим **Peak** или **Off-Peak** с учётом UTC-окон, выходных и праздников КНР.
- Местное время и таймзона пользователя без жёсткой привязки к Москве.
- Региональные тарифы **USD** и **CNY** из двух официальных страниц DeepSeek.
- Стоимость по каждому usage-сэмплу отдельно, с привязкой к времени начала шага.
- Раздельный учёт cache miss / cache hit / output.
- Flash, Pro и нетарифицированные токены не смешиваются.
- Строка автоматически скрывается для моделей и провайдеров без опубликованного тарифа.
- Нет сетевых запросов, чтения credentials или отправки usage наружу.
- Тесты на тарифы, расписание, проекцию, регион и клиентский рендер.

## Требования и совместимость

- DeepSeek Harness с Web GUI. Проверено на `0.2.1-rc.5`.
- Профиль, в котором доступны `sessionProjections`, `conversation.composer.dock` и стандартная projection `modelSelection`.
- Node.js — только для локальных тестов и разработки.
- Сборка не требуется: host- и client-части — обычные ESM/JS-файлы.

Плагин не заменяет штатную строку `usage` и не вмешивается в её работу.

## Установка

Установка выполняется через Plugin Manager Harness, а не копированием файлов в профиль:

```text
plugin_manager install_bundle target=<абсолютный путь к этому каталогу>
```

`install_bundle` сам устанавливает зависимость `zod` и подключает bundle.

### Обновление

Если версия пакета изменилась:

```text
plugin_manager remove_bundle target=@local/dsh-token-pricing
plugin_manager install_bundle target=<абсолютный путь к этому каталогу>
```

После обновления клиентской части обновите страницу Web GUI. Повторная установка той же версии отклоняется как `already-installed`.

## Использование

1. Выберите официальную модель DeepSeek в композере:
   - `deepseek-flash`;
   - legacy `deepseek-v4-flash`;
   - legacy `deepseek-v4-flash-vision-exp`;
   - `deepseek-v4-pro`.
2. Провайдер должен быть `deepseek-account` или `deepseek-official`.
3. Под композером появится строка с текущим режимом и стоимостью.
4. Нажмите на строку, чтобы открыть панель с деталями.

### Когда строка скрыта

Плагин намеренно не показывается, если:

- в сессии ещё нет зафиксированного выбора модели (`modelSelection.next` пуст);
- выбрана другая модель или сторонний провайдер;
- у модели нет официально опубликованного тарифа.

Стоимость для неподдерживаемой модели не подставляется и не угадывается.

## Регион и валюта

Регион определяется автоматически в браузере:

- IANA-таймзона (`Intl.DateTimeFormat().resolvedOptions().timeZone`) задаёт местное время и выбор региональной таблицы;
- материковый Китай (`Asia/Shanghai`, `Asia/Chongqing`, `Asia/Harbin`, `Asia/Urumqi`, `PRC`) использует **CNY**;
- остальные таймзоны используют международную **USD**-таблицу;
- если таймзона недоступна, регион locale `CN` выбирает CNY, иначе USD;
- в панели явно показаны регион, таймзона и выбранный тариф.

Курс валют **не применяется**: USD и CNY — независимые опубликованные таблицы. Плагин не пересчитывает стоимость в RUB и не использует сторонние курсы.

Название региона берётся из locale через `Intl.DisplayNames`. Местное время всегда форматируется в определённой IANA-таймзоне.

## Тарифы

Источники:

- [Models & Pricing, USD](https://api-docs.deepseek.com/quick_start/pricing/)
- [模型 & 价格, CNY](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

Тарифы зафиксированы на **2026-11-05**.

| Модель | Peak: cache miss / cache hit / output | Off-Peak: cache miss / cache hit / output |
|---|---:|---:|
| `deepseek-flash` (USD) | $0.30 / $0.006 / $1.20 за 1M | $0.15 / $0.003 / $0.60 за 1M |
| `deepseek-v4-pro` (USD) | $1.32 / $0.044 / $3.96 за 1M | $0.66 / $0.022 / $1.98 за 1M |
| `deepseek-flash` (CNY) | 2.00 / 0.04 / 8.00 за 1M | 1.00 / 0.02 / 4.00 за 1M |
| `deepseek-v4-pro` (CNY) | 9.00 / 0.30 / 27.00 за 1M | 4.50 / 0.15 / 13.50 за 1M |

Off-Peak равен половине Peak. Это проверяется тестом для обеих региональных таблиц.

## Расчёт

- **Cache-miss input:** `inputTokens` + `cacheWriteTokens` (если провайдер их сообщает).
  В официальной таблице отдельной колонки cache write нет; такие токены относятся к cache miss.
- **Cache-hit input:** `cacheReadTokens`.
- **Output:** `outputTokens`. Reasoning tokens отдельно не тарифицируются, потому что уже входят в output.
- Стоимость хранится и суммируется в целых **нано-единицах валюты за токен**, без float-накопления. Округление — только при выводе.
- Тариф usage-сэмпла определяется по времени `step/start`; если шаг не найден (например, обрезанный лог), используется `event.time`.
- Более поздний usage в том же `turn/step` заменяет предыдущий. После `llm/retry-started` новая попытка добавляется отдельно.
- `assistant/message` берёт route из `message.source`; `assistant/attempt` — из последнего `request/header`.

Если usage ещё не было, строка показывает «нет данных», а не `$0`. Если все токены нетарифицированы — «нет тарифа». Если нетарифицирована только часть, показывается сумма и предупреждение.

Учитывается **только текущая сессия** и provider-reported usage. Search/Fetch, дочерние сессии и другие продукты не входят. Это оценка, а не счёт DeepSeek.

## Тарифное окно

Peak: **01:00–04:00 и 06:00–10:00 UTC, понедельник–пятница, кроме государственных праздников КНР**. Всё остальное, включая выходные и праздники, — Off-Peak.

Праздники КНР 2026: 1–3 января; 15–23 февраля; 4–6 апреля; 1–5 мая; 19–21 июня; 25–27 сентября; 1–7 октября. Источник: [уведомление Госсовета КНР](https://www.gov.cn/zhengce/content/202511/content_7047090.htm). Праздничная дата определяется по календарю Asia/Shanghai (UTC+8).

Это абсолютные UTC-интервалы. Местная таймзона не меняет режим и используется только для отображения времени и следующей смены.

## Архитектура

```text
Session log
   │  existing events only
   ▼
tokenPricing projection (Host)
   │  buckets + costs.intl + costs.cn + schedule + supportedModels
   ▼
Client dock row
   │  modelSelection.next → gating
   │  timezone/locale → region + local time
   ▼
Row + click popover
```

- Host: `ctx.sessionProjections.register()` в `index.js`.
- Projection: `lib/projection.js` — чистый синхронный fold, O(1) состояние.
- Тарифы: `lib/rates.js` — обе региональные таблицы и integer-расчёт.
- Расписание: `lib/schedule.js` — UTC-окна и праздники.
- Client: `client.js` — регион, gating, локальное время, строка и popover.

Подробно: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура проекта

```text
.
├── index.js                 # Host-entry
├── client.js                # Web UI
├── lib/
│   ├── projection.js        # Zod-схемы, fold, wire-view
│   ├── rates.js             # USD/CNY, nano-расчёт
│   └── schedule.js          # Peak-окна, праздники
├── locale/
│   ├── en.json
│   └── ru.json
├── test/
│   ├── client-helpers.test.mjs
│   ├── projection.test.mjs
│   ├── rates.test.mjs
│   └── schedule.test.mjs
├── docs/
│   ├── ARCHITECTURE.md
│   └── MAINTENANCE.md
├── package.json
├── cordis.patch.yml
├── icon.svg
├── README.md
├── AGENTS.md
├── ROADMAP.md
└── CHANGELOG.md
```

## Разработка и тесты

```powershell
npm install
npm test
node --check client.js
node --check index.js
node --check lib/projection.js
node --check lib/rates.js
node --check lib/schedule.js
```

`npm test` использует `--test-isolation=none`, чтобы избежать `EPERM` при вложенном `spawn` в Windows-sandbox.

Проверка установленного плагина:

```text
cordis_inspect_query Config.listConfigs → name: @local/dsh-token-pricing
cordis_inspect_query Slots.listSubTree → root: conversation.composer.dock
```

Ожидаемый occupant: `token-pricing-status`, `order: 2`, `active: true`. Host-плагин должен быть в фазе `active`.

Правила для агентов и мейнтейнеров: [AGENTS.md](AGENTS.md). Обновление тарифов/праздников и релиз: [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## Ограничения

- Календарь праздников КНР встроен только для 2026 года. Для 2027 его нужно обновить вместе с версией плагина; интерфейс предупреждает, если текущий год не покрыт.
- Тарифы не загружаются из сети. При изменении документации плагин нужно обновить вручную.
- Регион определяется по браузерной таймзоне и locale, без геолокации. Если эти данные не соответствуют аккаунту, региональная таблица может не совпасть с фактическим счётом; интерфейс явно показывает выбранный регион и валюту.
- Стоимость не включает Search/Fetch, дочерние сессии, налоги и скидки.
- Это оценка по usage, которую вернул провайдер, а не бухгалтерский счёт.
- Плагин не заменяет штатную строку usage.

## Документация

- [AGENTS.md](AGENTS.md) — инструкции для AI-агентов и мейнтейнеров.
- [ROADMAP.md](ROADMAP.md) — планы и non-goals.
- [CHANGELOG.md](CHANGELOG.md) — история версий.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — архитектура и контракты.
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — обновление тарифов, праздников, релиз.

## Лицензия

[MIT](LICENSE). Copyright (c) 2026 Evgeniy.
