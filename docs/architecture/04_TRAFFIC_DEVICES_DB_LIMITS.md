# 04_TRAFFIC_DEVICES_DB_LIMITS.md

# Учёт трафика, устройства, лимиты и база данных

Дата фиксации: 27.06.2026

---

## 1. Цель документа

Этот документ фиксирует, как считать трафик, как хранить устройства, как ограничить максимум 5 устройств, как не допустить дублирования устройств и как сделать так, чтобы устройства не отключались сами со временем.

Главный принцип: трафик и доступ считаются не по пользователю в целом, а по конкретному устройству и конкретному протоколу.

---

## 2. Главные правила

1. Максимум 5 активных устройств на одного пользователя.
2. Каждое устройство имеет отдельные VLESS credentials.
3. Каждое устройство имеет отдельные Hysteria credentials.
4. Устройство не удаляется автоматически из-за офлайна.
5. Устройство не дублируется при обновлении подписки.
6. Удалить устройство может только пользователь в боте или админ в админке.
7. Трафик считается по `user + device + protocol + node + mode`.
8. Источник правды — PostgreSQL, а не конфиги серверов.
9. Xray/Hysteria — исполняющий слой, но не главная база пользователей.
10. Все операции создания/удаления устройств должны быть идемпотентными.

---

## 3. Сущности базы данных

### 3.1. `users`

```sql
users
- id uuid primary key
- telegram_id bigint unique not null
- username text null
- first_name text null
- language_code text null
- status text not null -- active, blocked
- created_at timestamptz not null
- updated_at timestamptz not null
```

### 3.2. `plans`

```sql
plans
- id uuid primary key
- code text unique not null
- title text not null
- stars_price integer not null
- duration_days integer not null
- traffic_limit_bytes bigint not null -- 0 = unlimited, если бизнес решит разрешить
- device_limit integer not null default 5
- is_active boolean not null default true
- created_at timestamptz not null
- updated_at timestamptz not null
```

Для текущей архитектуры `device_limit` должен быть 5. Если в будущем появятся другие тарифы, лимит всё равно должен идти из плана, но дефолт и основной сценарий — 5.

### 3.3. `subscriptions`

```sql
subscriptions
- id uuid primary key
- user_id uuid not null references users(id)
- plan_id uuid not null references plans(id)
- status text not null -- active, trial, expired, traffic_limited, payment_pending, blocked, refunded
- starts_at timestamptz not null
- expires_at timestamptz not null
- traffic_limit_bytes bigint not null
- traffic_used_bytes bigint not null default 0
- device_limit integer not null default 5
- public_page_token_hash text unique not null
- created_at timestamptz not null
- updated_at timestamptz not null
```

### 3.4. `devices`

```sql
devices
- id uuid primary key
- user_id uuid not null references users(id)
- subscription_id uuid not null references subscriptions(id)
- public_device_id text unique not null
- display_name text not null
- platform text not null -- ios, android, windows, macos, linux, android_tv, unknown
- status text not null -- active, disabled, revoked
- install_id_hash text null
- happ_install_id_hash text null
- hwid_hash text null
- user_agent_hash text null
- first_ip_hash text null
- last_ip_hash text null
- first_seen_at timestamptz not null
- last_seen_at timestamptz null
- disabled_at timestamptz null
- disabled_by text null -- user, admin, system
- created_at timestamptz not null
- updated_at timestamptz not null
```

Уникальные ограничения:

```sql
unique(user_id, install_id_hash) where install_id_hash is not null
unique(user_id, happ_install_id_hash) where happ_install_id_hash is not null
unique(user_id, hwid_hash) where hwid_hash is not null
```

### 3.5. `device_credentials`

```sql
device_credentials
- id uuid primary key
- user_id uuid not null references users(id)
- subscription_id uuid not null references subscriptions(id)
- device_id uuid not null references devices(id)
- protocol text not null -- vless, hysteria
- mode text not null -- regular, whitelist
- node_id uuid not null references nodes(id)
- exit_node_id uuid null references nodes(id)
- credential_public_id text unique not null
- credential_secret_hash text not null
- credential_material_encrypted text not null
- xray_email text null
- vless_uuid_encrypted text null
- hysteria_auth_token_encrypted text null
- status text not null -- active, disabled, revoked
- created_at timestamptz not null
- updated_at timestamptz not null
```

Уникальность:

```sql
unique(device_id, protocol, mode, node_id, exit_node_id)
```

Это защищает от дублирования credentials при повторном импорте.

### 3.6. `nodes`

```sql
nodes
- id uuid primary key
- code text unique not null -- fi-01, de-01, wl-01
- title text not null
- country_code text not null
- role text not null -- control, exit, whitelist_ingress, mixed
- public_ipv4 inet null
- public_ipv6 inet null
- vless_domain text null
- hysteria_domain text null
- vless_port integer null
- hysteria_port integer null
- is_active boolean not null default true
- created_at timestamptz not null
- updated_at timestamptz not null
```

### 3.7. `traffic_usage_events`

```sql
traffic_usage_events
- id uuid primary key
- user_id uuid not null references users(id)
- subscription_id uuid not null references subscriptions(id)
- device_id uuid not null references devices(id)
- credential_id uuid not null references device_credentials(id)
- node_id uuid not null references nodes(id)
- protocol text not null -- vless, hysteria
- mode text not null -- regular, whitelist
- uplink_bytes bigint not null default 0
- downlink_bytes bigint not null default 0
- total_bytes bigint generated always as (uplink_bytes + downlink_bytes) stored
- source text not null -- xray_stats, hysteria_stats
- stat_window_start timestamptz not null
- stat_window_end timestamptz not null
- created_at timestamptz not null
```

### 3.8. `traffic_counters`

```sql
traffic_counters
- id uuid primary key
- user_id uuid not null
- subscription_id uuid not null
- device_id uuid not null
- credential_id uuid not null
- node_id uuid not null
- protocol text not null
- mode text not null
- uplink_bytes bigint not null default 0
- downlink_bytes bigint not null default 0
- total_bytes bigint not null default 0
- last_synced_at timestamptz null
- unique(credential_id)
```

`traffic_usage_events` — история.  
`traffic_counters` — быстрые текущие суммы.

---

## 4. Алгоритм лимита 5 устройств

### 4.1. Создание устройства

Псевдологика:

```text
start transaction

subscription = find active subscription by public page token
existing_device = find by install_id/happ_install_id/hwid for this user

if existing_device exists:
    return existing_device

active_count = count devices where user_id = user.id and status = active

if active_count >= subscription.device_limit:
    reject with DEVICE_LIMIT_REACHED

create device
create credentials for all required profile combinations
commit
```

Обязательно использовать транзакцию и lock, иначе два параллельных импорта смогут создать 6-е устройство.

Рекомендуемый lock:

```sql
select * from subscriptions where id = $1 for update;
```

### 4.2. Повторный импорт

Если пользователь повторно открывает ссылку на том же устройстве, backend должен найти существующий device record и вернуть те же credentials.

Нельзя каждый раз создавать новый `device_id`.

### 4.3. Отключение устройства

При отключении устройства:

1. `devices.status = disabled`.
2. Все `device_credentials.status = disabled`.
3. Xray user удаляется или отключается.
4. Hysteria auth начинает возвращать `ok=false`.
5. Активные Hysteria-сессии kick через `/kick`.
6. Событие пишется в audit log.

Устройство не удаляется физически из базы, чтобы сохранить историю трафика.

---

## 5. Учёт трафика VLESS

### 5.1. Идентификатор

Для каждого VLESS credential должен быть `xray_email`:

```text
u:{user_id}:d:{device_id}:p:vless:n:{node_id}:m:{mode}
```

### 5.2. Сбор

Node-agent регулярно вызывает Xray Stats API и получает:

```text
user>>>{xray_email}>>>traffic>>>uplink
user>>>{xray_email}>>>traffic>>>downlink
```

Далее node-agent отправляет delta в backend.

### 5.3. Delta model

Нужно хранить last seen counter по каждому credential.

```sql
stats_offsets
- credential_id uuid
- source text -- xray_stats, hysteria_stats
- last_uplink_counter bigint
- last_downlink_counter bigint
- updated_at timestamptz
```

Если счётчик уменьшился, значит был restart/reset. Тогда:

```text
if current < previous:
    delta = current
else:
    delta = current - previous
```

---

## 6. Учёт трафика Hysteria

### 6.1. Идентификатор

Hysteria auth должен возвращать стабильный `id`:

```text
u:{user_id}:d:{device_id}:p:hysteria:n:{node_id}:m:{mode}
```

Именно этот `id` должен появляться в `/traffic` и `/online`.

### 6.2. Сбор

Node-agent вызывает:

```text
GET http://127.0.0.1:9999/traffic
Authorization: {secret}
```

И получает map client id → tx/rx.

Node-agent обязан сопоставить client id с `device_credentials`.

### 6.3. Online devices

Для онлайн-статуса Hysteria используется:

```text
GET /online
```

Там число означает количество Hysteria client instances по client id, а не количество TCP/UDP потоков. Это удобно для проверки реальных активных устройств.

---

## 7. Квота трафика

Каждая подписка имеет:

```text
traffic_limit_bytes
traffic_used_bytes
```

При каждом sync:

1. backend добавляет delta в `traffic_usage_events`;
2. обновляет `traffic_counters`;
3. пересчитывает `subscriptions.traffic_used_bytes`;
4. если лимит превышен — переводит подписку в `traffic_limited`;
5. отключает credentials или заставляет auth отказывать.

Нельзя ждать окончания периода, если лимит уже превышен.

---

## 8. Enforcement доступа

Проверка доступа должна быть в нескольких местах.

### 8.1. Subscription endpoint

Не отдаёт рабочие ссылки, если доступа нет.

### 8.2. Hysteria auth

Возвращает `ok=false`, если доступа нет.

### 8.3. VLESS sync

Отключает/удаляет user из Xray, если доступа нет.

### 8.4. Node-agent reconciliation

Регулярно проверяет, что на ноде нет credentials, которые в базе уже disabled/revoked.

---

## 9. Почему одного subscription endpoint недостаточно

Если пользователь уже импортировал подписку, Happ может продолжать использовать старые credentials даже после того, как subscription endpoint перестал их отдавать.

Поэтому нужно реальное enforcement на протоколах:

- для Hysteria — auth backend;
- для VLESS — удалить/отключить пользователя в Xray config/HandlerService.

---

## 10. Антидублирование

Дубли возникают, когда система считает каждое открытие страницы новым устройством.

Защита:

1. `install_id` выдаётся один раз на import session и закрепляется за устройством.
2. Happ limited link/InstallID используется как дополнительный фактор.
3. `unique(device_id, protocol, mode, node_id, exit_node_id)` не даёт создать лишние credentials.
4. Все операции `createDeviceAndCredentials` идемпотентны.
5. Повторный import возвращает существующий набор профилей.

---

## 11. Анти-самоотключение

Устройство не должно отключаться само из-за:

- отсутствия трафика;
- смены IP;
- смены User-Agent;
- временной ошибки node-agent;
- временного отсутствия `/online`.

Автоматическое отключение разрешено только при явных бизнес-событиях:

- подписка истекла;
- превышен трафик;
- пользователь заблокирован;
- оплата возвращена;
- админ отключил;
- пользователь сам отключил устройство.

---

## 12. Audit log

Нужна таблица:

```sql
audit_log
- id uuid primary key
- actor_type text -- user, admin, system, worker
- actor_id text null
- action text not null
- entity_type text not null
- entity_id text not null
- before_json jsonb null
- after_json jsonb null
- ip_hash text null
- created_at timestamptz not null
```

Писать события:

- покупка;
- успешная оплата;
- создание подписки;
- создание устройства;
- отключение устройства;
- превышение трафика;
- блокировка пользователя;
- ручное изменение тарифа;
- reset credentials;
- изменение сервера;
- авария node-agent.

---

## 13. Админские отчёты по трафику

Админка должна уметь показать:

1. Общий трафик за день/неделю/месяц.
2. Трафик по серверу.
3. Трафик по протоколу: VLESS/Hysteria.
4. Трафик по режиму: regular/whitelist.
5. Трафик по пользователю.
6. Трафик по устройству.
7. Топ пользователей по трафику.
8. Пользователей около лимита.
9. Пользователей с подозрительным количеством online-сессий.
10. Серверы с резким падением трафика.

---

## 14. Acceptance criteria

Реализация считается правильной, если:

1. Один пользователь не может добавить 6-е устройство.
2. Повторный импорт на том же устройстве не создаёт дубликат.
3. Отключение устройства в боте реально отключает VLESS и Hysteria.
4. Hysteria `/online` показывает online по client id.
5. Hysteria `/traffic` попадает в статистику пользователя.
6. Xray user stats попадают в статистику пользователя.
7. После restart Xray/Hysteria статистика не начинает считаться отрицательно.
8. Истекшая подписка не получает рабочие ссылки.
9. Истекшая подписка не проходит Hysteria auth.
10. Истекшая подписка удаляется/отключается в VLESS.
11. Админ видит трафик по пользователю, устройству, серверу, протоколу и режиму.

---

## 15. Источники

- Xray stats: https://xtls.github.io/en/config/stats.html
- Xray API: https://xtls.github.io/en/config/api.html
- Hysteria Traffic Stats API: https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/
- Hysteria full server config / HTTP auth: https://v2.hysteria.network/docs/advanced/Full-Server-Config/
- Happ limited links: https://www.happ.su/main/dev-docs/limited-links
