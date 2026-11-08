# AGENTS.md

Инструкции для AI-агентов и мейнтейнеров, которые меняют `dsh-token-pricing`.

## Назначение проекта

`dsh-token-pricing` — плагин DeepSeek Harness для Web GUI. Он показывает под композером текущий режим **Peak/Off-Peak**, определённое местное время и стоимость токенов текущей сессии по официальным региональным тарифам DeepSeek. По клику открывается всплывающая панель с расшифровкой.

Репозиторий: <https://github.com/kachanov-e-v/dsh-token-pricing>

## Сначала прочитать

1. [README.md](README.md) — пользовательское поведение, установка, тарифы и ограничения.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — projection, wire-контракт и поток данных.
3. [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — обновление цен, праздников, релиз и откат.
4. [ROADMAP.md](ROADMAP.md) — что запланировано и что не входит в цели.

## Источники истины

- Английская страница тарифов (USD): <https://api-docs.deepseek.com/quick_start/pricing/>
- Китайская страница тарифов (CNY): <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>
- Праздники КНР 2026: <https://www.gov.cn/zhengce/content/202511/content_7047090.htm>
- Установленный DeepSeek Harness: `app.asar/dsh/node_modules/@deepseek-ai/...` и `cordis_inspect_*`.

Нельзя придумывать цены, валютные курсы, модели, праздники или региональные правила. Если источник не найден, это нужно явно указать в документации/интерфейсе, а не заполнять догадкой.

## Быстрые команды

```powershell
npm install                 # один раз, для локального zod
npm test                    # обязательный набор тестов
node --check client.js
node --check index.js
node --check lib/projection.js
node --check lib/rates.js
node --check lib/schedule.js
```

Тестовая команда специально использует `--test-isolation=none`: в Windows-sandbox вложенный `spawn` может завершаться `EPERM`.

Установка в профиль — по GitHub-ссылке, без локальной копии:

```text
plugin_manager install_bundle target=https://github.com/kachanov-e-v/dsh-token-pricing/archive/refs/heads/main.tar.gz
```

Для воспроизводимой проверки используется релизный тег:

```text
plugin_manager install_bundle target=https://github.com/kachanov-e-v/dsh-token-pricing/archive/refs/tags/vX.Y.Z.tar.gz
```

Локальный путь допустим только для разработки:

```text
plugin_manager install_bundle target=<абсолютный путь к этому каталогу>
```

Проверка после установки:

```text
cordis_inspect_query Config.listConfigs -> name: @local/dsh-token-pricing
cordis_inspect_query Slots.listSubTree -> root: conversation.composer.dock
```

Ожидаемый occupant: `token-pricing-status` с `order: 2`, `active: true`. Host-плагин должен быть в фазе `active`. Визуальный рендер скриншотом проверяется отдельно; регистрация слота сама по себе не доказывает внешний вид.

## Карта репозитория

| Путь | Назначение |
|---|---|
| `index.js` | Host-entry: регистрирует `tokenPricing` projection. |
| `lib/projection.js` | Zod-схемы состояния/view, fold событий, wire-view. |
| `lib/rates.js` | Тарифы USD/CNY, aliases, integer-расчёт в nano-единицах. |
| `lib/schedule.js` | UTC-окна Peak, праздники КНР, tier и next transition. |
| `client.js` | Регион, gating по модели, локальное время, строка и popover. |
| `locale/ru.json`, `locale/en.json` | Метаданные Plugin Manager. |
| `test/` | Unit-тесты host- и client-логики. |
| `docs/` | Архитектура и сопровождение. |
| `CHANGELOG.md` | История версий. |
| `ROADMAP.md` | Планы и non-goals. |

## Обязательные инварианты

### Host projection

- Сворачиваются только уже существующие события сессии. **Нельзя** добавлять новый тип события или писать в Session log.
- `apply` синхронный и чистый; для неинтересных событий возвращается тот же reference.
- Состояние O(1) по числу usage-сэмплов: фиксированные бакеты, `last`, `stepStart`, `header`, `sampleCount`. Нельзя хранить per-step ledger.
- При изменении полей состояния или семантики fold нужно поднять `stateVersion`, иначе persisted projection cache может отдать старые данные.
- `wire.viewSchema` обязательна; после каждой симуляции в тестах проверять state и view через Zod.
- Тариф берётся по времени `step/start`; fallback — `event.time` (epoch milliseconds).
- Usage в одном `turn/step` заменяет предыдущий; после `llm/retry-started` новая попытка добавляется отдельно. Это повторяет семантику штатной `tokenUsage`.
- Cache writes отдельной колонки в документации не имеют: складываются в cache-miss input. Не добавлять несуществующий тариф.
- `assistant/attempt` берёт route из последнего `request/header`; `assistant/message` — из `message.source`, с fallback на header.

### Деньги и регионы

- Тарифы хранятся как целые **нано-единицы валюты за токен**. Нельзя накапливать float и затем округлять.
- USD и CNY — независимые опубликованные таблицы. **Никакой конвертации по курсу**, никакого RUB.
- Off-Peak должен оставаться ровно половиной Peak для обеих таблиц; это проверяется тестом.
- Host считает обе региональные стоимости заранее (`costs.intl`, `costs.cn`); клиент только выбирает нужную.
- Регион определяется в браузере. Москва и `Europe/Moscow` не должны быть зашиты в код.
- Pricing region: материковый Китай (`Asia/Shanghai`, `Asia/Chongqing`, `Asia/Harbin`, `Asia/Urumqi`, `PRC`) → `cn/CNY`; иначе `intl/USD`. Если таймзона недоступна, используется locale region `CN`.
- Peak/Off-Peak — абсолютные UTC-интервалы. Локальная таймзона не меняет режим, только отображение.
- Праздники КНР определяются по дате Asia/Shanghai (UTC+8), а не по локальной дате пользователя.

### Модели и UI

- Строка видна только если `modelSelection.next` указывает на официальный провайдер (`deepseek-account`, `deepseek-official`) и модель с опубликованным тарифом (`deepseek-flash`, legacy flash ids, `deepseek-v4-pro`).
- Нельзя показывать стоимость для стороннего провайдера или неизвестной модели: такие токены идут в `unpriced`, а строка скрывается, если выбранная модель не подходит.
- Не заменять штатный occupant `usage` в `conversation.composer.dock`; использовать собственный `id`.
- UI использует токены темы `--dsw-alias-*`. Нельзя хардкодить цвета интерфейса.
- Popover: `createPortal` при наличии `react-dom`, иначе fixed-фолбэк. Он должен закрываться по `×`, клику вне и `Escape`; фокус возвращается на trigger.
- Нет usage → «нет данных», не `$0`. Нет тарифа → «нет тарифа».
- Search/Fetch, дочерние сессии и другие продукты не входят в стоимость, пока это явно не реализовано и не задокументировано.

### Сеть и приватность

- Плагин не делает сетевых запросов, не читает credentials и не отправляет usage наружу.
- Все данные берутся из session projection и браузерных `Intl` API.

## Как менять тарифы

1. Открыть обе официальные страницы (USD и CNY).
2. Обновить `RATES` в `lib/rates.js`: `missInput`, `cacheRead`, `output`, `currency`, `symbol`, `asOf`, `source`.
3. Пересчитать в нано-единицы: `price_per_1M` → `nano_per_token` (для USD: `$0.30/M` → `300`; для CNY: `¥2/M` → `2000`).
4. Проверить, что Off-Peak = Peak / 2.
5. Обновить README-таблицу и `CHANGELOG.md`.
6. Запустить `npm test`.
7. При необходимости поднять версию и переустановить bundle.

Подробный чек-лист: [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## Как менять окна и праздники

1. Обновить `PEAK_WINDOWS_UTC` в `lib/schedule.js`, если изменилась документация.
2. Для праздников взять официальное уведомление Госсовета КНР, перечислить **все** даты периода, обновить `HOLIDAYS_2026` (или добавить новый массив) и `HOLIDAY_YEARS`.
3. Обновить тесты границ, выходных и праздников.
4. Обновить README, `CHANGELOG.md` и предупреждение в UI, если год не покрыт.

## Тестирование

Минимум перед коммитом:

```powershell
npm test
node --check client.js
node --check index.js
node --check lib/projection.js
node --check lib/rates.js
node --check lib/schedule.js
```

Тестами должны быть покрыты:

- границы 01:00/04:00/06:00/10:00 UTC;
- выходные и праздники КНР;
- USD и CNY таблицы, cache miss/hit/output, Off-Peak = ½ Peak;
- замена usage в одном step, retry, `assistant/attempt`;
- unpriced-модели и провайдеры;
- регион `Europe/Moscow` → USD, `Asia/Shanghai` → CNY, fallback locale;
- gating по `modelSelection.next`;
- рендер строки и popover-ветки без исключений.

## Релиз и публикация

1. Обновить `version` в `package.json`, `CHANGELOG.md` и дату.
2. Обновить документацию, если поведение изменилось.
3. Выполнить проверки из раздела «Тестирование».
4. Для локальной проверки переустановить плагин из каталога: `remove_bundle`, затем `install_bundle` (одинаковая версия повторно не устанавливается).
5. Проверить host active и occupant слота.
6. Закоммитить и запушить в `origin/main`.
7. Переустановить плагин по GitHub-ссылке на `main` и проверить, что ставится именно новая версия.
8. Создать GitHub Release с тегом `vX.Y.Z` и русскими заметками.
9. Для релизной проверки переустановить пакет по ссылке на тег `vX.Y.Z`.
10. Для клиентского изменения обновить страницу Web GUI.

Пример:

```powershell
git add .
git commit -m "release: vX.Y.Z"
git push origin main
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Краткие заметки на русском"
```

Не коммитить `node_modules/`, `.npm-cache/`, логи и локальные секреты. Они исключены через `.gitignore`.

## Стиль

- Документация — на русском. Код, имена API и ключи — на английском.
- Не переписывать чужие файлы вне этого репозитория без прямой необходимости.
- Не менять профиль `~/.dsh` вручную: установка и удаление только через `plugin_manager`.
- Предпочитать небольшие точечные изменения и существующие паттерны.
- Публичные поведения и ограничения должны быть отражены в README.

## Definition of done

- [ ] Изменение работает в Web GUI.
- [ ] `npm test` проходит.
- [ ] Синтаксис проверен.
- [ ] Host active, occupant слота на месте.
- [ ] README/CHANGELOG/при необходимости ROADMAP обновлены.
- [ ] Нет вымышленных цен, курсов, моделей и праздников.
- [ ] Нет сетевых запросов и утечек credentials.
- [ ] Версия и релизные заметки согласованы.
