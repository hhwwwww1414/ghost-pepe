# 05_BOT_ADMIN_PAYMENTS_INFRA.md

# Telegram-бот, Telegram Stars, админка и инфраструктура

Дата фиксации: 27.06.2026

---

## 1. Цель документа

Этот документ фиксирует архитектуру Telegram-бота, оплат через Telegram Stars, пользовательского кабинета в боте, админки, API, деплоя, мониторинга и резервных копий.

---

## 2. Telegram-бот для пользователей

Бот — главный пользовательский интерфейс покупки и управления подпиской.

Обязательные разделы:

```text
/start
├── Купить подписку
├── Моя подписка
├── Устройства
├── Инструкция подключения
├── Поддержка
└── Правила /terms
```

---

## 3. Покупка подписки за Telegram Stars

Для цифровой услуги используется Telegram Stars с валютой `XTR`.

Поток оплаты:

```text
1. Пользователь нажимает Купить подписку.
2. Бот показывает тарифы.
3. Пользователь выбирает тариф.
4. Backend создаёт invoice.
5. Бот отправляет invoice пользователю.
6. Telegram присылает pre_checkout_query.
7. Backend проверяет payload и отвечает approve/cancel.
8. Telegram присылает successful_payment.
9. Только после successful_payment backend создаёт или продлевает подписку.
10. Бот отправляет ссылку на страницу импорта.
```

Запрещено выдавать VPN-доступ после одного только `pre_checkout_query`. Это ещё не успешная оплата.

Обязательно сохранять:

```text
telegram_payment_charge_id
provider_payment_charge_id, если есть
invoice_payload
telegram_id
plan_id
stars_amount
currency = XTR
raw_successful_payment_json
```

---

## 4. Таблицы платежей

### 4.1. `payments`

```sql
payments
- id uuid primary key
- user_id uuid not null references users(id)
- subscription_id uuid null references subscriptions(id)
- plan_id uuid not null references plans(id)
- status text not null -- pending, pre_checkout_approved, paid, failed, refunded, canceled
- currency text not null default 'XTR'
- stars_amount integer not null
- invoice_payload text unique not null
- telegram_payment_charge_id text null
- provider_payment_charge_id text null
- raw_update jsonb null
- created_at timestamptz not null
- paid_at timestamptz null
- updated_at timestamptz not null
```

### 4.2. `payment_events`

```sql
payment_events
- id uuid primary key
- payment_id uuid null references payments(id)
- telegram_id bigint null
- event_type text not null -- invoice_created, pre_checkout, successful_payment, refund, error
- payload jsonb not null
- created_at timestamptz not null
```

Все webhook/update события должны быть идемпотентными. Повторный `successful_payment` не должен продлить подписку второй раз.

---

## 5. Подписки Telegram Stars: разовая оплата или автосписание

Для первой стабильной версии можно использовать разовые invoices за Stars и продлевать подписку на выбранный период после успешной оплаты.

Если нужна автоподписка, Telegram Star subscriptions поддерживают ежемесячное списание Stars, но этот сценарий должен быть отдельной задачей, потому что там нужно хранить subscription id, charge id, статус отмены и корректно показывать пользователю автопродление.

Базовая версия:

```text
Stars invoice → successful_payment → +30 дней доступа
```

Расширенная версия:

```text
Stars recurring subscription → monthly renewal → sync status → access management
```

---

## 6. Раздел `Моя подписка`

Бот должен показывать:

```text
Статус: активна
Тариф: 100 ГБ / 30 дней
Действует до: 27.07.2026
Использовано: 18.4 ГБ из 100 ГБ
Устройства: 2 из 5

[Открыть страницу подключения]
[Устройства]
[Продлить]
[Инструкция]
[Поддержка]
```

Если подписка истекла:

```text
Статус: закончилась
[Продлить подписку]
```

Если трафик закончился:

```text
Статус: лимит трафика исчерпан
[Продлить / купить новый пакет]
```

---

## 7. Раздел `Устройства`

Бот должен показывать список устройств:

```text
Устройства: 2 из 5

1. iPhone • активен • последний раз сегодня
2. Windows • активен • последний раз вчера

[Отключить iPhone]
[Отключить Windows]
[Назад]
```

При отключении:

```text
Вы точно хотите отключить iPhone?
После отключения на этом устройстве VPN перестанет работать.

[Да, отключить]
[Отмена]
```

После подтверждения backend отключает device и credentials.

---

## 8. Админка

Админка нужна не как украшение, а как рабочий центр управления сервисом.

Обязательные страницы:

1. Dashboard.
2. Пользователи.
3. Подписки.
4. Устройства.
5. Платежи Stars.
6. Серверы.
7. Трафик.
8. Ошибки и события.
9. Routing rules.
10. Настройки тарифов.
11. Администраторы и роли.

---

## 9. Dashboard админки

Dashboard показывает:

- активные пользователи;
- активные подписки;
- новые оплаты за сегодня;
- выручка в Stars за день/неделю/месяц;
- общий трафик за день;
- трафик по FI/DE/WL;
- доля VLESS и Hysteria;
- доля regular и whitelist;
- сервера online/offline;
- пользователи около лимита;
- ошибки node-agent;
- платежные ошибки.

---

## 10. Пользователь в админке

Карточка пользователя должна показывать:

```text
Telegram ID
Username
Статус
Текущая подписка
Срок действия
Трафик
Устройства
Платежи
Последняя активность
Audit log
```

Действия админа:

- заблокировать пользователя;
- разблокировать пользователя;
- продлить подписку вручную;
- изменить тариф;
- сбросить устройство;
- отключить устройство;
- перевыпустить ссылку подключения;
- посмотреть raw stats по устройству;
- добавить комментарий.

---

## 11. Серверы в админке

По каждому серверу показывать:

```text
node_id
роль
страна
публичный IP
домены VLESS/Hysteria
Xray status
Hysteria status
node-agent status
CPU/RAM/Disk
traffic rx/tx
active devices
last heartbeat
errors
```

Для whitelist-сервера отдельно показывать:

```text
whitelist IP
какие профили используют WL
сколько трафика прошло через WL
какие exit-регионы использовались после WL
```

---

## 12. API endpoints

Минимальные backend endpoints:

### 12.1. Bot API

```text
POST /bot/webhook
POST /bot/payments/pre-checkout
POST /bot/payments/successful
GET  /bot/user/subscription
GET  /bot/user/devices
POST /bot/user/devices/{device_id}/disable
```

### 12.2. Subscription API

```text
GET  /s/{public_subscription_token}              -- HTML page
POST /api/subscription/import/start              -- create/find device and import session
GET  /sub/{device_subscription_token}            -- Happ subscription body
POST /api/subscription/tv/send                    -- Android TV import
POST /api/subscription/revoke-token               -- internal/admin
```

### 12.3. Node-agent API

```text
POST /api/node/heartbeat
POST /api/node/traffic/batch
GET  /api/node/{node_id}/desired-state
POST /api/node/{node_id}/sync-result
```

### 12.4. Admin API

```text
GET  /admin/api/dashboard
GET  /admin/api/users
GET  /admin/api/users/{id}
POST /admin/api/users/{id}/block
POST /admin/api/users/{id}/unblock
GET  /admin/api/subscriptions
POST /admin/api/subscriptions/{id}/extend
GET  /admin/api/devices
POST /admin/api/devices/{id}/disable
GET  /admin/api/nodes
GET  /admin/api/traffic
GET  /admin/api/payments
GET  /admin/api/audit-log
```

---

## 13. Node-agent

Node-agent стоит на каждом сервере.

Его задачи:

1. Проверять Xray и Hysteria.
2. Собирать Xray stats.
3. Собирать Hysteria stats.
4. Собирать Hysteria online.
5. Применять desired state credentials.
6. Отключать revoked credentials.
7. Делать Hysteria kick при блокировке.
8. Отправлять heartbeat.
9. Передавать системные метрики.
10. Логировать ошибки.

Node-agent должен иметь локальный кеш доступа, чтобы краткая недоступность control-plane не отключила всех пользователей мгновенно.

Рекомендуемое поведение:

- если control-plane недоступен меньше 10 минут — использовать последний known-good state;
- если пользователь уже был явно disabled/revoked — не включать его обратно из кеша;
- все рассинхронизации отправлять в админку после восстановления связи.

---

## 14. Деплой

Рекомендуемый стек:

```text
Backend: Node.js/NestJS или Python/FastAPI
Bot: тот же backend module или отдельный worker
Admin: React/Next.js
DB: PostgreSQL
Queue/cache: Redis
Reverse proxy: Caddy или Nginx
Containers: Docker Compose для первой версии
Monitoring: Prometheus + Grafana или lightweight exporter + админка
Logs: journald/docker logs + structured JSON logs
```

Не нужно усложнять Kubernetes для первой версии. Важнее стабильная схема, понятные backup и быстрый restart.

---

## 15. Секреты и .env

Секреты нельзя хранить в репозитории.

Обязательные переменные:

```env
APP_NAME=Ghost Pepe VPN
PUBLIC_BASE_URL=https://sub.example.com
API_BASE_URL=https://api.example.com
ADMIN_BASE_URL=https://admin.example.com

POSTGRES_URL=postgres://...
REDIS_URL=redis://...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...

HAPP_PROVIDER_CODE=...
HAPP_AUTH_KEY=...

XRAY_API_SECRET=...
HYSTERIA_STATS_SECRET=...
NODE_AGENT_SECRET=...

ENCRYPTION_MASTER_KEY=...
TOKEN_HASH_SECRET=...
```

Credentials VLESS/Hysteria хранить в базе только в encrypted form. В логах нельзя печатать raw UUID/token полностью.

---

## 16. Backups

Обязательные backup:

1. PostgreSQL daily backup.
2. PostgreSQL before migration backup.
3. Encrypted backup копируется на отдельное хранилище.
4. Хранить минимум 14 ежедневных backup.
5. Раз в неделю делать test restore.

Без test restore backup считается ненадёжным.

---

## 17. Мониторинг и алерты

Алерты:

- backend down;
- bot webhook errors;
- PostgreSQL down;
- Redis down;
- node-agent не отвечает больше 2 минут;
- Xray down;
- Hysteria down;
- traffic stats не собираются больше 10 минут;
- disk > 85%;
- CPU/load высокий больше 10 минут;
- ошибки Telegram payments;
- резкое падение успешных подключений;
- много DEVICE_LIMIT_REACHED за короткое время;
- много auth failed по одному пользователю.

---

## 18. Безопасность админки

Админка должна иметь:

- отдельные admin users;
- роли `owner`, `admin`, `support`, `readonly`;
- 2FA или хотя бы Telegram login confirmation для owner/admin;
- audit log всех действий;
- rate limit;
- session expiration;
- запрет показывать полные secrets;
- CSRF protection, если используются cookie sessions;
- secure cookies;
- IP allowlist по возможности.

---

## 19. Команды для Codex

Codex должен реализовывать проект так, чтобы архитектура была не размазана по коду, а выражена в понятных модулях:

```text
/apps/api
/apps/admin-web
/apps/telegram-bot
/apps/subscription-web
/apps/node-agent
/packages/db
/packages/shared
/packages/protocols
/packages/subscription-renderer
/packages/routing-rules
/packages/billing
/infra/docker-compose.yml
/infra/nginx-or-caddy
/infra/migrations
```

Запрещено делать монолитный файл, где одновременно Telegram payments, Xray config, админка и SQL.

---

## 20. Acceptance criteria

Бот и админка считаются готовыми, если:

1. Пользователь покупает подписку за Stars.
2. Доступ выдаётся только после `successful_payment`.
3. Пользователь получает страницу импорта Happ.
4. Пользователь видит подписку, срок, трафик и устройства.
5. Пользователь может отключить устройство.
6. Админ видит платежи, пользователей, устройства, серверы и трафик.
7. Админ может заблокировать пользователя.
8. Блокировка реально отключает VLESS и Hysteria.
9. Node-agent передаёт health и stats.
10. Backup PostgreSQL создаётся и проверяется.
11. В пользовательской подписке нет лишних протоколов.
12. На каждый exit есть 4 профиля.

---

## 21. Источники

- Telegram Stars payments: https://core.telegram.org/bots/payments-stars
- Telegram Star subscriptions: https://core.telegram.org/api/subscriptions
- Xray API: https://xtls.github.io/en/config/api.html
- Xray stats: https://xtls.github.io/en/config/stats.html
- Hysteria Traffic Stats API: https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/
- Hysteria full server config: https://v2.hysteria.network/docs/advanced/Full-Server-Config/
- Happ app management: https://www.happ.su/main/dev-docs/app-management
