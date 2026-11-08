# Сопровождение

Практическое руководство по обновлению тарифов, календаря, релизам и диагностике.

## Когда требуется обновление

Плагин нужно обновлять, если:

- DeepSeek изменил цены или добавил/переименовал модели;
- изменились Peak/Off-Peak окна;
- опубликован новый календарь праздников КНР;
- изменился официальный список провайдеров;
- изменился контракт `sessionProjections` или `modelSelection` в Harness;
- найден дефект в UI, расчёте или документации.

## Источники

Всегда сверяться с первоисточниками:

1. **USD-тарифы:** <https://api-docs.deepseek.com/quick_start/pricing/>
2. **CNY-тарифы:** <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>
3. **Праздники КНР:** официальное уведомление Госсовета на `gov.cn` (для 2026: <https://www.gov.cn/zhengce/content/202511/content_7047090.htm>).
4. **Harness API:** `cordis_inspect_list` / `cordis_inspect_query` и исходники установленного пакета.

Нельзя брать цены из сторонних статей, калькуляторов или валютных API. Нельзя пересчитывать CNY из USD по курсу.

## Обновление тарифов

Файл: `lib/rates.js`.

1. Открыть обе страницы тарифов.
2. Для каждого региона обновить `RATES.intl` и `RATES.cn`.
3. Поля:
   - `missInput` — cache miss input;
   - `cacheRead` — cache hit input;
   - `output` — output.
4. Перевести цену за 1M токенов в nano-единицы за токен:

   ```text
   price_per_1M × 1000 = nano_per_token
   ```

   Примеры:
   - `$0.30 / 1M` → `300`;
   - `$0.006 / 1M` → `6`;
   - `¥2.00 / 1M` → `2000`;
   - `¥4.50 / 1M` → `4500`.

5. Обновить `asOf` у региона.
6. Проверить `currency`, `symbol`, `source`.
7. Убедиться, что Off-Peak = Peak / 2.
8. Обновить таблицу в `README.md` и запись в `CHANGELOG.md`.
9. Запустить `npm test`.

### Добавление модели

1. Проверить официальное имя и legacy-алиасы на странице тарифов.
2. Добавить id в `MODEL_CLASS_BY_ID` (`flash` или `pro`).
3. Убедиться, что модель есть в `SUPPORTED_MODELS` (формируется из ключей).
4. Обновить тесты aliases и gating.
5. Обновить README и `CHANGELOG.md`.

Не добавлять модель без опубликованной цены. Для неизвестной модели остаётся `unpriced`.

### Смена официальных провайдеров

Файл: `lib/rates.js`, `OFFICIAL_PROVIDERS`. Менять только при подтверждении в документации/коде Harness. Обновить тесты и README.

## Обновление окон Peak

Файл: `lib/schedule.js`, `PEAK_WINDOWS_UTC`.

1. Сверить окна в обеих страницах тарифов.
2. Обновить half-open интервалы в UTC (часы).
3. Обновить `README.md`, `docs/ARCHITECTURE.md` и тесты границ.
4. Запустить `npm test`.

Помнить: окна абсолютные UTC; локальная зона не меняет режим.

## Обновление праздников

Праздники КНР исключают Peak в полный день. Дата определяется по календарю Asia/Shanghai (UTC+8).

1. Найти официальное уведомление Госсовета на новый год.
2. Выписать **все** даты каждого праздничного периода.
3. В `lib/schedule.js` добавить, например, `HOLIDAYS_2027`.
4. Объединить массивы:

   ```js
   const ALL_HOLIDAYS = [...HOLIDAYS_2026, ...HOLIDAYS_2027];
   export const HOLIDAY_YEARS = [2026, 2027];
   const HOLIDAY_SET = new Set(ALL_HOLIDAYS);
   export const SCHEDULE = { ..., holidays: ALL_HOLIDAYS, holidayYears: HOLIDAY_YEARS };
   ```

5. Обновить импорт/имя, если добавляется отдельный массив.
6. Добавить тест на будний праздник нового года и `nextTransition`.
7. Проверить, что `holidayWarning` в UI больше не срабатывает для нового года.
8. Обновить README, `ROADMAP.md`, `CHANGELOG.md`.

Переносы рабочих суббот/воскресений не меняют режим: все выходные уже Off-Peak. Но их даты можно не добавлять.

## Изменение projection или wire-view

1. Обновить Zod-схемы и `apply`.
2. Поднять `stateVersion`, если изменились поля/семантика.
3. Обновить `wire.view` и `viewSchema`.
4. Обновить клиентский потребитель.
5. Обновить тесты и `docs/ARCHITECTURE.md`.
6. Переустановить bundle и проверить, что projection читается в live-сессии.

Нельзя добавлять новые session-события или писать в Session log. Использовать только существующие события.

## Релиз

1. Обновить `version` в `package.json` по SemVer.
2. Обновить `CHANGELOG.md` (дата, раздел).
3. Обновить README/ROADMAP, если изменилось поведение.
4. Выполнить проверки:

   ```powershell
   npm test
   node --check client.js
   node --check index.js
   node --check lib/projection.js
   node --check lib/rates.js
   node --check lib/schedule.js
   ```

5. Для локальной проверки переустановить bundle из каталога:

   ```text
   plugin_manager remove_bundle target=@local/dsh-token-pricing
   plugin_manager install_bundle target=<абсолютный путь>
   ```

6. Проверить:

   - `Config.listConfigs` → `@local/dsh-token-pricing`;
   - `Slots.listSubTree` → occupant `token-pricing-status`, `active: true`;
   - host fiber `active`;
   - внешний вид после обновления страницы.

7. Закоммитить и запушить:

   ```powershell
   git add .
   git commit -m "release: vX.Y.Z"
   git push origin main
   ```

8. Переустановить плагин по GitHub-ссылке на `main` и убедиться, что ставится новая версия:

   ```text
   plugin_manager remove_bundle target=@local/dsh-token-pricing
   plugin_manager install_bundle target=https://github.com/kachanov-e-v/dsh-token-pricing/archive/refs/heads/main.tar.gz
   ```

9. Создать GitHub Release:

   ```powershell
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "Краткие заметки на русском"
   ```

10. Переустановить пакет по ссылке на тег и проверить релизную установку:

    ```text
    plugin_manager remove_bundle target=@local/dsh-token-pricing
    plugin_manager install_bundle target=https://github.com/kachanov-e-v/dsh-token-pricing/archive/refs/tags/vX.Y.Z.tar.gz
    ```

## Откат

Если релиз сломан:

1. Найти предыдущий стабильный тег.
2. Переключиться на него в отдельной ветке/worktree.
3. Переустановить пакет из этого состояния.
4. Проверить occupant и расчёт.
5. Опубликовать исправляющий релиз с новым patch-номером.

Не переписывать историю `main` после публикации без необходимости.

## Проверка после установки

- Host-плагин в `active`.
- `tokenPricing` projection присутствует в snapshot сессии (косвенно — строка отображается при подходящей модели).
- `token-pricing-status` в `conversation.composer.dock` с `order: 2`.
- Popover открывается по клику, закрывается по `×`, клику вне и `Escape`.
- Стоимость в USD для `Europe/Moscow`.
- Стоимость в CNY для `Asia/Shanghai`.
- Строка скрыта для сторонней модели.
- Нет `$0` при отсутствии usage.

## Диагностика

### `already-installed`

Повторная установка той же версии или той же GitHub-ссылки запрещена. Сначала `remove_bundle`, затем `install_bundle`; версия должна измениться для нового релиза.

### Строка не видна

- Проверить `modelSelection.next`: выбрана ли официальная модель и провайдер.
- Проверить, что projection `tokenPricing` зарегистрирована (host active).
- Проверить, что сессия не subagent с недоступным выбором.
- После обновления клиентской части обновить страницу.

### Popover не появляется

- Проверить, что используется новая версия клиентского bundle.
- Обновить страницу.
- Проверить консоль браузера на ошибки `react-dom`/`createPortal`; при отсутствии `react-dom` должен работать fixed-фолбэк.
- Убедиться, что `popoverPosition` вернул координаты (есть trigger rect).

### Неверная валюта

- Проверить IANA-таймзону браузера.
- Для материкового Китая используется CNY только для перечисленных зон.
- Для остальных — USD. Ручного override пока нет; это в roadmap.
- Не «исправлять» это конвертацией по курсу.

### `EPERM` в тестах

`npm test` уже использует `--test-isolation=none`. Если запускается вручную без флага, вложенный `spawn` может быть запрещён Windows-sandbox. Использовать штатную команду.

### Нет `node_modules/zod`

Выполнить `npm install` в каталоге проекта. Зависимость нужна для локальных тестов; при установке bundle `zod` ставит Plugin Manager.

## Чек-лист изменений

- [ ] Источник обновлён и указан.
- [ ] Тарифы/праздники/окна обновлены.
- [ ] Off-Peak = ½ Peak.
- [ ] Тесты и syntax-check проходят.
- [ ] README/CHANGELOG/ROADMAP обновлены.
- [ ] Версия поднята.
- [ ] Bundle переустановлен.
- [ ] Occupant и host active проверены.
- [ ] Страница обновлена и UI проверен.
- [ ] Коммит и релиз опубликованы.
