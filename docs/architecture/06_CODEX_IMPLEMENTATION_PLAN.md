# 06_CODEX_IMPLEMENTATION_PLAN.md

# ТЗ для Codex: построить репозиторий, локальную инфраструктуру, Git-пуш и деплой VPN-сервиса

Дата фиксации: 27.06.2026  
Проект: коммерческий VPN-сервис с Telegram-ботом, Happ-подписками, админкой, контролем трафика и быстрым добавлением новых нод.  
Документ предназначен для Codex. Codex должен использовать этот файл как главный план реализации.

---

## 0. Исходные архитектурные документы

Перед реализацией Codex обязан прочитать и учитывать 5 базовых документов проекта:

1. `01_MAIN_ARCHITECTURE.md`
2. `02_PROTOCOLS_NODES_ROUTING.md`
3. `03_SUBSCRIPTION_IMPORT_HAPP.md`
4. `04_TRAFFIC_DEVICES_DB_LIMITS.md`
5. `05_BOT_ADMIN_PAYMENTS_INFRA.md`

Этот файл не отменяет предыдущие документы, а превращает их в практический план построения репозитория, локального окружения и деплоя.

Главное правило: если в одном из 5 документов есть более строгое ограничение, чем в этом плане, использовать более строгое ограничение.

---

## 1. Конечная цель Codex

Codex должен построить полный Git-репозиторий проекта, в котором есть:

1. весь backend control-plane;
2. Telegram-бот для пользователей;
3. админ-панель;
4. страница импорта подписки;
5. PostgreSQL-схема и миграции;
6. Redis-интеграция;
7. node-agent для серверов;
8. шаблоны конфигов Xray/VLESS+Reality;
9. шаблоны конфигов Hysteria2;
10. HAProxy/Caddy reverse-proxy конфиги;
11. Docker Compose для локального запуска;
12. Docker Compose для production-серверов;
13. Ansible или SSH-deploy скрипты;
14. Makefile с понятными командами;
15. `.env.example` и шаблоны секретов;
16. тесты;
17. инструкцию по быстрому добавлению новой ноды;
18. скрипты, которые позволяют после заполнения секретов выполнить деплой на FI, DE и Yandex Cloud.

Codex должен не просто написать отдельные куски кода, а собрать репозиторий так, чтобы проект можно было:

```bash
cp .env.example .env.local
make bootstrap
make dev
make test
make build
make deploy-all
```

---

## 2. Жёсткие ограничения проекта

### 2.1. Разрешённые протоколы

В пользовательских VPN-профилях разрешены только:

1. `VLESS + Reality` через `Xray-core`.
2. `Hysteria2`.

Запрещено добавлять в пользовательскую подписку:

- WireGuard;
- OpenVPN;
- Shadowsocks;
- Trojan;
- VMess;
- TUIC;
- SOCKS/HTTP как самостоятельные пользовательские профили.

Технические внутренние сервисы могут использовать HTTP API, gRPC, SSH, PostgreSQL protocol, Redis protocol, Docker network и другие служебные протоколы, но они не должны появляться как продаваемые VPN-варианты для пользователя.

### 2.2. Четыре профиля на каждый exit-сервер

На каждый exit-сервер Codex обязан реализовать 4 варианта подключения:

1. `VPN VLESS` — обычный VLESS+Reality, RU-ресурсы идут напрямую с устройства пользователя.
2. `VPN Hysteria` — обычный Hysteria2, RU-ресурсы идут напрямую с устройства пользователя.
3. `Whitelist VLESS` — VLESS+Reality через whitelisted bridge в Yandex Cloud.
4. `Whitelist Hysteria` — Hysteria2 через whitelisted bridge в Yandex Cloud.

Для обычных профилей:

```text
Happ -> FI/DE exit -> internet
RU domains/IP -> direct from device
```

Для whitelist-профилей:

```text
Happ -> Yandex Cloud Bridge -> selected FI/DE exit -> internet
RU direct на устройстве отключён
```

Главное правило whitelist-режима: клиент не должен подключаться напрямую к FI/DE endpoint. Клиент видит endpoint Yandex Cloud Bridge, потому что именно его IP находится в белом списке.

### 2.3. Безопасность секретов

Codex не должен коммитить реальные секреты в Git.

Разрешено создать:

```text
.env.example
infra/secrets/README.md
infra/secrets/*.env.example
infra/secrets/*.local.example
```

Запрещено коммитить:

```text
.env
.env.local
*.secret
*.private
infra/secrets/*.env
infra/secrets/*.local
id_rsa
id_ed25519
*.pem
*.key
```

В `.gitignore` обязательно добавить все файлы с реальными ключами и тестовыми доступами.

Если пользователь передаст Codex тестовые ключи прямо в этом `.md` или в отдельном файле, Codex может использовать их для деплоя, но не должен пушить их в репозиторий.

---

## 3. Текущая топология серверов

### 3.1. Сервер FI

Роль: главный control-plane и exit-node Финляндии.

На сервере FI должны работать:

```text
Panel / api-backend
PostgreSQL
Redis
Subscription page
Telegram bot
Admin web
Reverse-proxy
Node-agent
Xray-core для VLESS+Reality
Hysteria2 для Hysteria-профилей
Stats worker
Billing worker
Geo rules worker
```

Логическое имя:

```text
fi-control-01
```

Роли:

```text
control-plane = true
exit-node = true
whitelist-bridge = false
```

### 3.2. Сервер DE

Роль: exit-node Германии.

На сервере DE должны работать:

```text
Node-agent
Xray-core для VLESS+Reality
Hysteria2 для Hysteria-профилей
минимальный reverse-proxy только если нужен health endpoint через HTTPS
```

Логическое имя:

```text
de-exit-01
```

Роли:

```text
control-plane = false
exit-node = true
whitelist-bridge = false
```

### 3.3. Yandex Cloud

Роль: whitelisted bridge.

На сервере Yandex Cloud должны работать:

```text
Node-agent
Xray-core для VLESS whitelist bridge
Hysteria2 или Xray Hysteria2-compatible bridge для Hysteria whitelist bridge
HAProxy/Caddy только если нужен SNI/HTTPS маршрутизатор
```

Логическое имя:

```text
yc-bridge-01
```

Роли:

```text
control-plane = false
exit-node = false
whitelist-bridge = true
```

Yandex Cloud не должен хранить основную PostgreSQL-базу. Он должен быть максимально простым ingress/bridge-сервером.

---

## 4. Доменная схема

Codex должен заложить домены через переменные окружения, а не хардкодить их.

Пример переменных:

```env
ROOT_DOMAIN=example.com
API_DOMAIN=api.example.com
ADMIN_DOMAIN=admin.example.com
SUB_DOMAIN=sub.example.com
FI_VLESS_DOMAIN=fi-vless.example.com
FI_HYSTERIA_DOMAIN=fi-hy.example.com
DE_VLESS_DOMAIN=de-vless.example.com
DE_HYSTERIA_DOMAIN=de-hy.example.com
WL_VLESS_DOMAIN=wl-vless.example.com
WL_HYSTERIA_DOMAIN=wl-hy.example.com
```

DNS должен указывать так:

```text
api.example.com        -> FI IP
admin.example.com      -> FI IP
sub.example.com        -> FI IP
fi-vless.example.com   -> FI IP
fi-hy.example.com      -> FI IP
de-vless.example.com   -> DE IP
de-hy.example.com      -> DE IP
wl-vless.example.com   -> Yandex Cloud IP
wl-hy.example.com      -> Yandex Cloud IP
```

---

## 5. Важное правило по портам

На одном IP нельзя просто так одновременно держать обычный HTTPS reverse-proxy и VLESS+Reality на одном TCP-порту `443` без L4/SNI-маршрутизации.

Поэтому Codex должен реализовать один из двух вариантов.

### Вариант A, предпочтительный для production

Использовать `HAProxy` как L4 TCP 443 SNI-router:

```text
public TCP 443
  -> api/admin/sub SNI -> Caddy/Nginx на 127.0.0.1:8443
  -> fi-vless SNI     -> Xray VLESS Reality на 127.0.0.1:1443
```

Для Hysteria2 использовать UDP 443 отдельно:

```text
public UDP 443 -> Hysteria2
```

TCP 443 и UDP 443 не конфликтуют, потому что это разные транспортные протоколы.

### Вариант B, простой fallback

Если Codex не успеет корректно собрать SNI-router, то для первой тестовой версии разрешено:

```text
web HTTPS       -> TCP 443
VLESS Reality   -> TCP 8443
Hysteria2       -> UDP 443
```

Но в таком случае в документации Codex обязан явно написать, что production-цель — перейти на Вариант A.

По умолчанию строить Вариант A.

---

## 6. Матрица подключений

Codex должен заложить в базе и генераторе подписок такую матрицу.

### FI profiles

| Код профиля | Название для пользователя | Endpoint пользователя | Реальный маршрут | RU direct |
|---|---|---|---|---|
| `fi_vless_regular` | Finland VLESS | `fi-vless.${ROOT_DOMAIN}` | user -> FI -> internet | yes |
| `fi_hysteria_regular` | Finland Hysteria | `fi-hy.${ROOT_DOMAIN}` | user -> FI -> internet | yes |
| `fi_vless_whitelist` | Finland Whitelist VLESS | `wl-vless.${ROOT_DOMAIN}` | user -> YC -> FI -> internet | no |
| `fi_hysteria_whitelist` | Finland Whitelist Hysteria | `wl-hy.${ROOT_DOMAIN}` | user -> YC -> FI -> internet | no |

### DE profiles

| Код профиля | Название для пользователя | Endpoint пользователя | Реальный маршрут | RU direct |
|---|---|---|---|---|
| `de_vless_regular` | Germany VLESS | `de-vless.${ROOT_DOMAIN}` | user -> DE -> internet | yes |
| `de_hysteria_regular` | Germany Hysteria | `de-hy.${ROOT_DOMAIN}` | user -> DE -> internet | yes |
| `de_vless_whitelist` | Germany Whitelist VLESS | `wl-vless.${ROOT_DOMAIN}` | user -> YC -> DE -> internet | no |
| `de_hysteria_whitelist` | Germany Whitelist Hysteria | `wl-hy.${ROOT_DOMAIN}` | user -> YC -> DE -> internet | no |

---

## 7. Архитектура репозитория

Codex должен создать monorepo.

Обязательная структура:

```text
vpn-service/
  README.md
  CODEX_IMPLEMENTATION_PLAN.md
  .gitignore
  .env.example
  docker-compose.dev.yml
  docker-compose.prod.fi.yml
  docker-compose.prod.exit.yml
  docker-compose.prod.bridge.yml
  Makefile

  docs/
    architecture/
      01_MAIN_ARCHITECTURE.md
      02_PROTOCOLS_NODES_ROUTING.md
      03_SUBSCRIPTION_IMPORT_HAPP.md
      04_TRAFFIC_DEVICES_DB_LIMITS.md
      05_BOT_ADMIN_PAYMENTS_INFRA.md
      06_CODEX_IMPLEMENTATION_PLAN.md
    runbooks/
      add-node.md
      deploy.md
      backup-restore.md
      incident-response.md
      rotate-secrets.md

  apps/
    api-backend/
      src/
      prisma/
      tests/
      Dockerfile
      package.json
    telegram-bot/
      src/
      tests/
      Dockerfile
      package.json
    admin-web/
      src/
      Dockerfile
      package.json
    subscription-web/
      src/
      Dockerfile
      package.json
    node-agent/
      src/
      templates/
      tests/
      Dockerfile
      package.json

  packages/
    shared/
      src/
      package.json
    config/
      src/
      package.json

  infra/
    nodes/
      nodes.example.yml
      nodes.local.example.yml
    haproxy/
      haproxy.fi.cfg.tpl
      haproxy.bridge.cfg.tpl
    caddy/
      Caddyfile.tpl
    xray/
      xray-exit.json.tpl
      xray-bridge.json.tpl
      reality-keygen.md
    hysteria/
      hysteria-exit.yaml.tpl
      hysteria-bridge.yaml.tpl
    systemd/
      xray.service.tpl
      hysteria.service.tpl
      node-agent.service.tpl
    ansible/
      inventory.example.yml
      playbooks/
        bootstrap.yml
        deploy-control.yml
        deploy-exit.yml
        deploy-bridge.yml
        add-node.yml
    scripts/
      bootstrap-local.sh
      check-prerequisites.sh
      render-configs.sh
      deploy-fi.sh
      deploy-de.sh
      deploy-yc-bridge.sh
      deploy-all.sh
      add-node.sh
      backup-postgres.sh
      restore-postgres.sh
      rotate-hysteria-secret.sh
      rotate-reality-keys.sh

  .github/
    workflows/
      ci.yml
      deploy-manual.yml
```

---

## 8. Рекомендуемый стек

Codex должен использовать один стек, без хаоса из разных технологий.

### Backend

```text
Node.js 22 LTS
TypeScript
Fastify или NestJS
Prisma ORM
PostgreSQL
Redis
BullMQ для очередей
Zod для валидации
JWT/session для админки
```

Предпочтительно использовать `Fastify`, потому что проекту нужен быстрый REST API без лишней магии.

### Telegram bot

```text
Node.js 22 LTS
TypeScript
grammY или Telegraf
```

Предпочтительно использовать `grammY`.

### Frontend

```text
React
Vite
TypeScript
```

Отдельно:

```text
admin-web
subscription-web
```

### Node-agent

```text
Node.js 22 LTS
TypeScript
```

Node-agent должен уметь:

- принимать команды от backend;
- рендерить Xray/Hysteria конфиги;
- безопасно перезапускать сервисы;
- отдавать health;
- отправлять traffic deltas;
- применять изменения пользователей;
- не требовать ручного редактирования конфигов после каждой покупки.

### Reverse-proxy

```text
HAProxy для TCP 443 SNI routing
Caddy для обычного HTTPS web reverse-proxy
```

Caddy можно заменить на Nginx, но тогда Codex должен полностью прописать certbot/renewal. По умолчанию использовать Caddy.

### Deploy

```text
Docker Compose
Ansible
SSH
Makefile
```

---

## 9. База данных

Codex должен реализовать Prisma schema с таблицами минимум:

```text
users
plans
subscriptions
devices
device_credentials
nodes
node_profiles
payments
payment_events
traffic_usage_events
traffic_counters
node_health_events
admin_users
audit_log
routing_rules_versions
deployments
```

### 9.1. users

Хранит пользователя Telegram.

Обязательные поля:

```text
id uuid primary key
telegram_id bigint unique not null
telegram_username text nullable
first_name text nullable
last_name text nullable
language_code text nullable
created_at timestamptz
updated_at timestamptz
```

### 9.2. plans

Хранит тарифы.

Обязательные поля:

```text
id uuid primary key
code text unique not null
name text not null
price_stars int not null
period_days int not null
traffic_limit_bytes bigint nullable
max_devices int not null default 5
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

### 9.3. subscriptions

Обязательные поля:

```text
id uuid primary key
user_id uuid references users(id)
plan_id uuid references plans(id)
status text not null
starts_at timestamptz
expires_at timestamptz
traffic_limit_bytes bigint nullable
traffic_used_bytes bigint not null default 0
max_devices int not null default 5
created_at timestamptz
updated_at timestamptz
```

Статусы:

```text
active
expired
paused
blocked
pending_payment
cancelled
```

### 9.4. devices

Обязательные поля:

```text
id uuid primary key
user_id uuid references users(id)
subscription_id uuid references subscriptions(id)
device_name text nullable
device_os text not null
happ_device_id text nullable
install_fingerprint_hash text not null
status text not null
first_seen_at timestamptz
last_seen_at timestamptz
created_at timestamptz
updated_at timestamptz
unique(subscription_id, install_fingerprint_hash)
```

Статусы:

```text
active
disabled
revoked
```

### 9.5. device_credentials

Один device получает отдельные credentials для каждого protocol/profile.

Обязательные поля:

```text
id uuid primary key
device_id uuid references devices(id)
node_id uuid references nodes(id)
profile_code text not null
protocol text not null
mode text not null
vless_uuid uuid nullable
hysteria_auth text nullable
public_label text not null
status text not null
created_at timestamptz
updated_at timestamptz
unique(device_id, node_id, profile_code)
```

### 9.6. nodes

Обязательные поля:

```text
id uuid primary key
node_code text unique not null
country_code text not null
role text not null
public_ipv4 text not null
public_ipv6 text nullable
ssh_host text not null
ssh_port int not null default 22
ssh_user text not null
is_control_plane boolean not null default false
is_exit_node boolean not null default false
is_whitelist_bridge boolean not null default false
status text not null
created_at timestamptz
updated_at timestamptz
```

### 9.7. node_profiles

Обязательные поля:

```text
id uuid primary key
node_id uuid references nodes(id)
profile_code text unique not null
protocol text not null
mode text not null
country_code text not null
endpoint_host text not null
endpoint_port int not null
transport text not null
ru_direct boolean not null
whitelist_bridge_node_id uuid nullable references nodes(id)
exit_node_id uuid nullable references nodes(id)
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

---

## 10. Device limit: максимум 5 устройств

Codex обязан реализовать лимит устройств не только через Happ Limited Links, но и на backend-уровне.

Правило:

```text
Одна активная подписка = максимум 5 active devices.
```

Алгоритм при открытии страницы импорта:

1. Пользователь приходит по защищённой ссылке из Telegram bot.
2. Backend проверяет subscription status.
3. Frontend определяет платформу: iOS / Android / desktop / Android TV.
4. Backend создаёт `install_token`.
5. При нажатии кнопки импорта backend создаёт или переиспользует `device`.
6. Если fingerprint уже есть — не создавать новый device.
7. Если fingerprint новый и active devices меньше 5 — создать device.
8. Если active devices уже 5 — отказать и показать понятную ошибку.

Нельзя делать так, чтобы каждое обновление подписки создавало новое устройство.

Повторный импорт с того же устройства должен возвращать тот же `device_id`.

---

## 11. Traffic accounting

Codex должен реализовать учёт трафика по device, protocol, node и profile.

### 11.1. VLESS

Для VLESS использовать Xray stats/API.

Идентификатор пользователя должен строиться так, чтобы можно было связать статистику с `device_credentials.id`.

Пример logical email/tag:

```text
user_<userId>__device_<deviceId>__profile_<profileCode>
```

Node-agent регулярно собирает счётчики и отправляет delta в backend.

### 11.2. Hysteria2

Для Hysteria2 использовать Traffic Stats API.

Каждый device получает отдельный `auth` token.

Node-agent собирает:

```text
/traffic
/online
```

и отправляет delta в backend.

### 11.3. Delta model

Нельзя просто перезаписывать общий счётчик.

Нужно хранить:

```text
last_seen_rx_bytes
last_seen_tx_bytes
current_rx_bytes
current_tx_bytes
delta_rx_bytes
delta_tx_bytes
```

Если сервис перезапущен и счётчик стал меньше, считать это reset и не записывать отрицательную delta.

---

## 12. Subscription page и Happ import

Codex должен сделать отдельный `subscription-web`.

Пользователь получает ссылку вида:

```text
https://${SUB_DOMAIN}/i/${subscriptionPublicToken}
```

Страница должна:

1. показать статус подписки;
2. показать срок действия;
3. показать лимит устройств;
4. определить устройство;
5. не дать Android нажать кнопку iPhone;
6. не дать iPhone нажать кнопку Android;
7. создать device только после подтверждённого install flow;
8. открыть Happ deeplink/import link;
9. показать ручную ссылку и QR как fallback;
10. не раскрывать технические секреты на странице.

### 12.1. Проверка устройства

Frontend-check:

```text
User-Agent
platform hints
screen/device hints
```

Backend-check:

```text
install_token
short lifetime
single-use where possible
fingerprint hash
subscription ownership
```

Frontend-check нужен для удобства. Backend-check нужен для реальной защиты.

### 12.2. Subscription endpoint

Endpoint:

```text
GET /api/subscription/:token
```

Он должен возвращать подписку в формате, который Happ сможет импортировать.

Обязательно:

- добавить Happ provider id, если он есть;
- добавить routing для RU direct в regular-профилях;
- не добавлять RU direct для whitelist-профилей;
- выдавать только active devices;
- не выдавать подписку expired/blocked user;
- не выдавать disabled/revoked device credentials.

### 12.3. Happ Limited Links

Happ Limited Links можно использовать как дополнительный внешний предохранитель.

Но backend всё равно обязан иметь собственный лимит устройств.

---

## 13. Telegram bot

Codex должен реализовать user bot.

Обязательные команды/разделы:

```text
/start
Моя подписка
Купить подписку
Продлить подписку
Подключить устройство
Мои устройства
Отключить устройство
Инструкция
Поддержка
```

### 13.1. Покупка через Telegram Stars

Покупка должна работать через Telegram Stars.

Правила:

```text
currency = XTR
provider_token = empty string для Stars
доступ выдаётся только после successful_payment
pre_checkout_query обязательно подтверждать
payload должен быть уникальным и связанным с payment intent
```

После successful payment:

1. создать `payment`;
2. создать `payment_event`;
3. активировать или продлить subscription;
4. показать пользователю кнопку импорта;
5. записать audit log.

Нельзя активировать подписку до `successful_payment`.

---

## 14. Admin panel

Codex должен реализовать `admin-web`.

Обязательные разделы:

```text
Dashboard
Пользователи
Подписки
Устройства
Платежи
Серверы
Трафик
Профили подключения
Routing rules
Deployments
Audit log
Настройки
```

### 14.1. Dashboard

Показывать:

```text
активные подписки
истекающие подписки
выручка в Stars
активные устройства
трафик за 24 часа / 7 дней / 30 дней
статус FI
статус DE
статус Yandex Bridge
ошибки node-agent
ошибки payments
```

### 14.2. Пользователь

Карточка пользователя должна показывать:

```text
Telegram ID
username
подписки
платежи
устройства
потребление трафика
используемые профили
кнопку block/unblock
кнопку revoke device
```

### 14.3. Серверы

Карточка сервера должна показывать:

```text
node_code
country
role
online/offline
xray status
hysteria status
CPU/RAM/Disk
traffic in/out
active VLESS devices
active Hysteria devices
last heartbeat
last deploy version
```

---

## 15. API backend

Codex должен реализовать REST API.

### 15.1. Public/subscription API

```text
GET  /health
GET  /api/import/:publicToken
POST /api/import/:publicToken/device/prepare
POST /api/import/:publicToken/device/confirm
GET  /api/subscription/:subscriptionToken
GET  /api/subscription/:subscriptionToken/routing
```

### 15.2. Bot API/internal service API

```text
POST /internal/bot/users/upsert
GET  /internal/bot/users/:telegramId/subscription
POST /internal/bot/payments/create-intent
POST /internal/bot/payments/successful
GET  /internal/bot/devices
POST /internal/bot/devices/:id/revoke
```

### 15.3. Admin API

```text
POST /admin/login
POST /admin/logout
GET  /admin/me
GET  /admin/dashboard
GET  /admin/users
GET  /admin/users/:id
POST /admin/users/:id/block
POST /admin/users/:id/unblock
GET  /admin/subscriptions
PATCH /admin/subscriptions/:id
GET  /admin/devices
POST /admin/devices/:id/revoke
GET  /admin/nodes
GET  /admin/nodes/:id
POST /admin/nodes/:id/sync
GET  /admin/traffic
GET  /admin/payments
GET  /admin/audit-log
```

### 15.4. Node-agent API

```text
POST /internal/nodes/:nodeCode/heartbeat
POST /internal/nodes/:nodeCode/traffic
GET  /internal/nodes/:nodeCode/config
POST /internal/nodes/:nodeCode/deploy-result
```

Node-agent API должен быть защищён node token.

---

## 16. Node-agent

Node-agent работает на каждом сервере.

### 16.1. На FI

Должен уметь:

```text
получать список active credentials для FI профилей
рендерить Xray config для VLESS regular и bridge exit
рендерить Hysteria2 config для Hysteria regular и bridge exit
собирать Xray stats
собирать Hysteria traffic stats
отправлять heartbeat
безопасно рестартовать xray/hysteria
проверять порты
```

### 16.2. На DE

То же самое, но без control-plane.

### 16.3. На Yandex Bridge

Должен уметь:

```text
получать bridge config
рендерить Xray bridge config для VLESS whitelist
рендерить Hysteria bridge config для Hysteria whitelist
направлять FI whitelist users на FI exit
направлять DE whitelist users на DE exit
отправлять health
отправлять traffic bridge-level stats
```

Для первой стабильной версии использовать подход A: отдельный inbound на каждую комбинацию exit/protocol.

Обязательные bridge inbounds:

```text
wl-vless-to-fi
wl-vless-to-de
wl-hysteria-to-fi
wl-hysteria-to-de
```

---

## 17. Xray/VLESS+Reality

Codex должен сделать шаблоны конфигов Xray.

### 17.1. Regular exit VLESS

```text
Happ -> FI/DE VLESS Reality inbound -> internet
```

Нужно:

```text
Reality private/public key
shortIds
serverNames
flow если выбран XTLS Vision
per-device UUID
per-device email/tag для stats
Xray stats включён
Xray API слушает только localhost
```

### 17.2. Whitelist VLESS

```text
Happ -> YC VLESS Reality inbound -> YC Xray outbound -> FI/DE VLESS exit -> internet
```

Для первой версии проще сделать отдельные inbound/outbound пары:

```text
wl-vless-to-fi -> outbound to fi-bridge-vless-exit
wl-vless-to-de -> outbound to de-bridge-vless-exit
```

Пользовательский endpoint в подписке всегда `WL_VLESS_DOMAIN`, а не `FI_VLESS_DOMAIN` или `DE_VLESS_DOMAIN`.

---

## 18. Hysteria2

### 18.1. Regular Hysteria2

```text
Happ -> FI/DE Hysteria2 -> internet
```

Нужно:

```text
per-device auth token
Traffic Stats API
/traffic
/online
/kick для отключения пользователя при revoke/block
server config templates
client URI generation
```

### 18.2. Whitelist Hysteria2

```text
Happ -> YC Hysteria2 bridge -> FI/DE Hysteria2 exit -> internet
```

Для bridge-режима Codex должен выбрать технически рабочий вариант и описать его в `docs/runbooks/bridge-hysteria.md`.

Предпочтительная реализация для первой версии:

```text
Xray на YC использует Hysteria2-compatible inbound/outbound
отдельный inbound wl-hysteria-to-fi
отдельный inbound wl-hysteria-to-de
outbound ведёт на соответствующий FI/DE Hysteria2 exit endpoint
```

Если выбран официальный Hysteria2 server для YC bridge, Codex обязан доказать в конфиге, как трафик будет уходить на FI/DE exit, а не выходить напрямую через Yandex Cloud.

Если это не сделано, whitelist Hysteria считается неготовым.

---

## 19. RU direct routing

Codex должен реализовать RU direct только для regular-профилей.

Regular profiles:

```text
fi_vless_regular      -> ru_direct = true
fi_hysteria_regular   -> ru_direct = true
de_vless_regular      -> ru_direct = true
de_hysteria_regular   -> ru_direct = true
```

Whitelist profiles:

```text
fi_vless_whitelist       -> ru_direct = false
fi_hysteria_whitelist    -> ru_direct = false
de_vless_whitelist       -> ru_direct = false
de_hysteria_whitelist    -> ru_direct = false
```

Smoke tests routing:

```text
yandex.ru       -> direct in regular
sberbank.ru     -> direct in regular
gosuslugi.ru    -> direct in regular
vk.com          -> direct in regular
google.com      -> proxy
youtube.com     -> proxy
any whitelist profile -> no local direct rules
```

---

## 20. Локальная разработка

Codex должен сделать локальный запуск без реальных серверов.

Команда:

```bash
make dev
```

Должна поднимать:

```text
PostgreSQL
Redis
api-backend
telegram-bot в mock mode
admin-web
subscription-web
mock-node-agent-fi
mock-node-agent-de
mock-node-agent-yc
```

Mock mode должен позволять:

```text
создать пользователя
создать payment successful вручную
создать active subscription
создать device
сгенерировать subscription body
посмотреть admin dashboard
посмотреть fake traffic stats
```

---

## 21. Production deploy

Codex должен сделать deploy через Makefile.

Обязательные команды:

```bash
make bootstrap
make test
make build
make render-configs
make deploy-fi
make deploy-de
make deploy-yc-bridge
make deploy-all
make add-node NODE_CODE=nl-exit-01
make backup-db
make restore-db BACKUP_FILE=...
```

### 21.1. deploy-fi

Должен:

1. проверить SSH доступ;
2. создать директории проекта;
3. загрузить `.env` для FI;
4. загрузить compose файл;
5. загрузить HAProxy/Caddy configs;
6. загрузить Xray/Hysteria templates;
7. запустить database migrations;
8. запустить сервисы;
9. проверить health;
10. вывести итоговые URLs.

### 21.2. deploy-de

Должен:

1. проверить SSH доступ;
2. установить Docker/system packages;
3. загрузить node-agent;
4. загрузить Xray/Hysteria;
5. применить config;
6. проверить ports;
7. зарегистрировать node в backend.

### 21.3. deploy-yc-bridge

Должен:

1. проверить SSH доступ;
2. установить Docker/system packages;
3. загрузить node-agent;
4. загрузить bridge configs;
5. открыть только нужные ports;
6. проверить, что whitelist endpoints ведут через YC;
7. проверить, что FI/DE whitelist profiles не используют direct FI/DE endpoints.

---

## 22. Добавление новой ноды

Одна из главных целей репозитория — быстро добавить новую ноду.

Codex должен сделать файл:

```text
infra/nodes/nodes.local.example.yml
```

Пример:

```yaml
nodes:
  - node_code: fi-control-01
    country_code: FI
    role: control_exit
    public_ipv4: "CHANGE_ME"
    ssh_host: "CHANGE_ME"
    ssh_port: 22
    ssh_user: "root"
    is_control_plane: true
    is_exit_node: true
    is_whitelist_bridge: false
    domains:
      vless: "fi-vless.example.com"
      hysteria: "fi-hy.example.com"

  - node_code: de-exit-01
    country_code: DE
    role: exit
    public_ipv4: "CHANGE_ME"
    ssh_host: "CHANGE_ME"
    ssh_port: 22
    ssh_user: "root"
    is_control_plane: false
    is_exit_node: true
    is_whitelist_bridge: false
    domains:
      vless: "de-vless.example.com"
      hysteria: "de-hy.example.com"

  - node_code: yc-bridge-01
    country_code: RU
    role: whitelist_bridge
    public_ipv4: "CHANGE_ME"
    ssh_host: "CHANGE_ME"
    ssh_port: 22
    ssh_user: "root"
    is_control_plane: false
    is_exit_node: false
    is_whitelist_bridge: true
    domains:
      vless: "wl-vless.example.com"
      hysteria: "wl-hy.example.com"
```

Новая нода добавляется так:

```bash
cp infra/nodes/nodes.local.example.yml infra/nodes/nodes.local.yml
# добавить новую ноду в nodes.local.yml
make add-node NODE_CODE=nl-exit-01
make deploy-node NODE_CODE=nl-exit-01
```

Codex должен сделать `docs/runbooks/add-node.md` с пошаговой инструкцией.

---

## 23. Файл секретов, который пользователь заполнит вручную

Codex должен создать шаблон:

```text
infra/secrets/secrets.local.example.md
```

Пользователь потом создаст:

```text
infra/secrets/secrets.local.md
```

Этот файл должен быть в `.gitignore`.

Шаблон должен содержать:

```md
# secrets.local.md

## Git
GIT_REMOTE_URL=
GIT_BRANCH=main

## FI
FI_HOST=
FI_PORT=22
FI_USER=root
FI_SSH_KEY_PATH=
FI_PUBLIC_IPV4=

## DE
DE_HOST=
DE_PORT=22
DE_USER=root
DE_SSH_KEY_PATH=
DE_PUBLIC_IPV4=

## Yandex Cloud Bridge
YC_HOST=
YC_PORT=22
YC_USER=root
YC_SSH_KEY_PATH=
YC_PUBLIC_IPV4=

## Domains
ROOT_DOMAIN=
API_DOMAIN=
ADMIN_DOMAIN=
SUB_DOMAIN=
FI_VLESS_DOMAIN=
FI_HYSTERIA_DOMAIN=
DE_VLESS_DOMAIN=
DE_HYSTERIA_DOMAIN=
WL_VLESS_DOMAIN=
WL_HYSTERIA_DOMAIN=

## Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_ADMIN_IDS=

## Telegram Stars
STARS_PROVIDER_TOKEN=
STARS_CURRENCY=XTR

## Database
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
DATABASE_URL=

## Redis
REDIS_PASSWORD=
REDIS_URL=

## Auth
ADMIN_JWT_SECRET=
INTERNAL_API_TOKEN=
NODE_AGENT_TOKEN=
SUBSCRIPTION_TOKEN_SECRET=

## Happ
HAPP_PROVIDER_ID=
HAPP_SUBSCRIPTION_NAME=
HAPP_SUPPORT_URL=

## Xray Reality
FI_REALITY_PRIVATE_KEY=
FI_REALITY_PUBLIC_KEY=
FI_REALITY_SHORT_ID=
DE_REALITY_PRIVATE_KEY=
DE_REALITY_PUBLIC_KEY=
DE_REALITY_SHORT_ID=
YC_REALITY_PRIVATE_KEY=
YC_REALITY_PUBLIC_KEY=
YC_REALITY_SHORT_ID=

## Hysteria
FI_HYSTERIA_TRAFFIC_API_SECRET=
DE_HYSTERIA_TRAFFIC_API_SECRET=
YC_HYSTERIA_TRAFFIC_API_SECRET=
FI_HYSTERIA_OBFS_PASSWORD=
DE_HYSTERIA_OBFS_PASSWORD=
YC_HYSTERIA_OBFS_PASSWORD=
```

Важно: `STARS_PROVIDER_TOKEN` для Telegram Stars обычно должен быть пустым provider token при отправке invoice, но переменную оставить, чтобы код был явным и тестируемым.

---

## 24. Git и CI/CD

Codex должен подготовить Git-репозиторий.

### 24.1. Локальные команды

```bash
git init
git add .
git commit -m "Initial VPN infrastructure"
git branch -M main
git remote add origin ${GIT_REMOTE_URL}
git push -u origin main
```

Но Codex не должен пушить, если:

```text
GIT_REMOTE_URL пустой
есть незакоммиченные реальные секреты
.env или infra/secrets/secrets.local.md попали в git status staged
тесты не проходят
```

### 24.2. GitHub Actions

Создать:

```text
.github/workflows/ci.yml
.github/workflows/deploy-manual.yml
```

CI должен запускать:

```text
lint
typecheck
tests
build
prisma validate
```

Manual deploy workflow должен быть `workflow_dispatch` и требовать environment approval.

Для первого деплоя достаточно локального `make deploy-all`. GitHub Actions нужен как подготовка к нормальному процессу.

---

## 25. Тесты

Codex должен написать тесты минимум на:

### 25.1. Device limit

```text
создать 5 устройств -> ok
создать 6 устройство -> error
повторный импорт существующего устройства -> ok, device не дублируется
revoked device не считается active
```

### 25.2. Subscription generation

```text
expired subscription -> 403
blocked subscription -> 403
active subscription -> returns profiles
regular profiles contain routing direct rules
whitelist profiles do not contain ru direct rules
FI whitelist endpoint is WL domain
DE whitelist endpoint is WL domain
```

### 25.3. Payments

```text
pre_checkout_query accepted
invoice created with XTR
successful_payment activates subscription
same successful_payment cannot be applied twice
failed payment does not activate subscription
```

### 25.4. Traffic delta

```text
counter increase -> writes positive delta
counter reset -> no negative delta
device traffic aggregated into subscription traffic
quota exceeded -> subscription limited/blocked according to plan
```

### 25.5. Node profiles

```text
FI has 4 profiles
DE has 4 profiles
Yandex Bridge has bridge inbounds for FI/DE VLESS/Hysteria
regular profiles have ru_direct=true
whitelist profiles have ru_direct=false
```

---

## 26. Acceptance criteria

Проект считается готовым для первого тестового запуска, если выполнено всё ниже.

### 26.1. Локально

```bash
make bootstrap
make dev
make test
make build
```

проходят без ошибок.

### 26.2. Бот

Пользователь может:

```text
открыть /start
купить тестовую подписку через mock successful payment
посмотреть подписку
получить ссылку на импорт
посмотреть устройства
отключить устройство
```

### 26.3. Subscription page

Пользователь может:

```text
открыть страницу импорта
увидеть свою подписку
увидеть корректную кнопку для своего устройства
получить Happ import link
не превысить лимит 5 устройств
```

### 26.4. Admin panel

Админ может:

```text
войти
посмотреть пользователей
посмотреть подписки
посмотреть устройства
посмотреть платежи
посмотреть серверы
посмотреть трафик
заблокировать пользователя
отключить устройство
```

### 26.5. Ноды

После заполнения secrets и запуска deploy:

```text
FI online
DE online
Yandex Bridge online
Xray работает на FI
Xray работает на DE
Xray bridge работает на YC
Hysteria работает на FI
Hysteria работает на DE
Hysteria bridge работает на YC
node-agent присылает heartbeat
node-agent присылает traffic stats
```

### 26.6. Профили

В подписке активного пользователя есть ровно эти варианты:

```text
Finland VLESS
Finland Hysteria
Finland Whitelist VLESS
Finland Whitelist Hysteria
Germany VLESS
Germany Hysteria
Germany Whitelist VLESS
Germany Whitelist Hysteria
```

Если пользователь отключён, подписка не должна выдавать ни один рабочий профиль.

---

## 27. Порядок работы Codex

Codex должен идти по шагам.

### Шаг 1. Создать skeleton репозитория

Создать директории, package manifests, Makefile, Docker Compose, README.

### Шаг 2. Создать Prisma schema и миграции

Реализовать таблицы из этого ТЗ.

### Шаг 3. Реализовать api-backend

Сделать health, users, subscriptions, devices, payments, nodes, traffic.

### Шаг 4. Реализовать Telegram bot

Сделать меню, Stars invoice flow, successful payment, subscription link.

### Шаг 5. Реализовать subscription-web

Сделать страницу импорта, проверку устройства, Happ link generation.

### Шаг 6. Реализовать admin-web

Сделать dashboard и базовые CRUD/screens.

### Шаг 7. Реализовать node-agent

Сделать health, config render, stats collection, service restart wrappers.

### Шаг 8. Реализовать infra templates

Сделать HAProxy, Caddy, Xray, Hysteria, systemd, Docker Compose.

### Шаг 9. Реализовать deploy scripts

Сделать bootstrap, render-configs, deploy-fi, deploy-de, deploy-yc, deploy-all.

### Шаг 10. Реализовать тесты

Покрыть acceptance tests из раздела 25.

### Шаг 11. Проверить локально

Запустить:

```bash
make bootstrap
make dev
make test
make build
```

### Шаг 12. Подготовить Git

Проверить, что секреты не попали в git.

```bash
git status
git add .
git commit -m "Initial VPN infrastructure"
```

Пушить только если `GIT_REMOTE_URL` заполнен и пользователь разрешил/ожидал push.

### Шаг 13. Деплой

После заполнения secrets:

```bash
make deploy-all
```

Если один сервер падает, Codex должен вывести понятную ошибку и не скрывать проблему.

---

## 28. Что нельзя делать

Codex не должен:

1. добавлять лишние VPN-протоколы;
2. делать одну общую подписочную ссылку на всех;
3. создавать новые device при каждом обновлении подписки;
4. хранить реальные секреты в Git;
5. открывать PostgreSQL в интернет;
6. открывать Redis в интернет;
7. открывать Xray API в интернет;
8. открывать Hysteria Traffic Stats API в интернет;
9. считать whitelist-профиль готовым, если endpoint ведёт напрямую на FI/DE;
10. считать Hysteria whitelist готовым, если он выходит в интернет через YC вместо FI/DE, когда выбран FI/DE exit;
11. активировать подписку до successful payment;
12. показывать админку без авторизации;
13. игнорировать отрицательные traffic delta после restart;
14. деплоить без health-check.

---

## 29. Минимальный README, который Codex обязан создать

README должен содержать:

```text
Project overview
Architecture summary
Server roles
Local development
Environment variables
How to run tests
How to deploy FI
How to deploy DE
How to deploy Yandex Bridge
How to add a node
How device limit works
How traffic accounting works
How Telegram Stars payments work
How Happ import works
Security notes
```

---

## 30. Официальные документы, которые нужно учитывать

Codex должен учитывать актуальные официальные документы:

```text
Xray VLESS:
https://xtls.github.io/en/config/inbounds/vless.html

Xray REALITY examples/docs:
https://github.com/XTLS/Xray-examples/tree/main/VLESS-TCP-XTLS-Vision-REALITY
https://github.com/XTLS/REALITY

Xray Hysteria transport:
https://xtls.github.io/en/config/transports/hysteria.html
https://xtls.github.io/en/config/outbounds/hysteria.html

Hysteria2:
https://v2.hysteria.network/docs/getting-started/Server/
https://v2.hysteria.network/docs/advanced/Full-Server-Config/
https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/
https://v2.hysteria.network/docs/developers/URI-Scheme/

Happ:
https://www.happ.su/main/dev-docs
https://www.happ.su/main/dev-docs/limited-links
https://www.happ.su/main/dev-docs/routing
https://www.happ.su/main/dev-docs/provider-id
https://www.happ.su/main/dev-docs/app-management

Telegram Stars:
https://core.telegram.org/bots/payments-stars
https://core.telegram.org/bots/payments
```

Если документация изменилась, Codex должен адаптировать implementation, но не должен нарушать бизнес-правила из этого ТЗ.

---

## 31. Финальный результат от Codex

В конце работы Codex должен выдать:

1. список созданных файлов;
2. что работает локально;
3. какие тесты прошли;
4. какие env/secrets нужно заполнить;
5. какие команды запускать для деплоя;
6. какие сервера были задеплоены;
7. какие health checks прошли;
8. что осталось сделать вручную, если что-то невозможно без доступа пользователя.

Формат финального отчёта:

```md
# Codex final report

## Created files
...

## Local checks
...

## Git status
...

## Deployment status
...

## Required manual actions
...

## Known limitations
...
```

---

## 32. Главная формулировка для Codex

Собери production-ready monorepo для VPN-сервиса на VLESS+Reality и Hysteria2.  
FI является control-plane и exit-node.  
DE является exit-node.  
Yandex Cloud является whitelisted bridge.  
На каждый exit-node должны быть 4 профиля: regular VLESS, regular Hysteria, whitelist VLESS, whitelist Hysteria.  
Regular-профили обязаны иметь RU direct routing.  
Whitelist-профили обязаны идти через Yandex Cloud Bridge и не должны иметь RU direct routing.  
Пользователь покупает подписку через Telegram Stars, получает ссылку на subscription page, импортирует подписку в Happ, а backend контролирует трафик и максимум 5 устройств.  
Админка должна показывать пользователей, устройства, платежи, серверы и трафик.  
Репозиторий должен содержать всё для локального запуска, Git push, деплоя FI/DE/Yandex и быстрого добавления новой ноды.
