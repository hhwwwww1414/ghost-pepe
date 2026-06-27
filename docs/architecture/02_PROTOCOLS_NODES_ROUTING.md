# 02_PROTOCOLS_NODES_ROUTING.md

# Протоколы, серверные ноды и маршрутизация

Дата фиксации: 27.06.2026  
В проекте используются только `VLESS` и `Hysteria2`. В документах `Hysteria` означает именно `Hysteria2`.

---

## 1. Цель документа

Этот документ описывает, как должны быть устроены VPN-ноды, какие inbounds/outbounds должны быть на серверах, как разделять обычный режим и whitelist-режим, как считать трафик и как не сломать direct-маршрутизацию русских ресурсов.

---

## 2. Роли серверов

### 2.1. `exit-node`

Exit-node — сервер, через который пользователь выходит в интернет.

Минимальные exit-ноды:

- `FI-EXIT-01`
- `DE-EXIT-01`

Каждый exit-node обязан иметь:

- Xray-core для VLESS;
- Hysteria2 server;
- node-agent;
- закрытый API-доступ только от control-plane;
- firewall, который не открывает внутренние API наружу;
- health endpoint для проверки состояния;
- сбор системных метрик.

### 2.2. `whitelist-ingress`

Whitelist-ingress — сервер, IP которого находится в белом списке нужной сети.

Он обязан иметь:

- публичный VLESS endpoint для whitelist VLESS;
- публичный Hysteria endpoint для whitelist Hysteria;
- route-chain до FI/DE exit-node или прямой выход в интернет;
- отдельную статистику whitelist-трафика;
- отдельные labels в админке.

Whitelist-ingress нельзя путать с обычным exit-node. Это отдельный аварийный вход в сеть.

---

## 3. Матрица профилей

Для каждого exit-региона backend создаёт 4 профиля.

| `profile_type` | `protocol` | `mode` | `client_endpoint` | `server_route` | `ru_direct` |
|---|---|---|---|---|---|
| `vpn_vless` | `vless` | `regular` | exit-node | user → exit → internet | true |
| `vpn_hysteria` | `hysteria` | `regular` | exit-node | user → exit → internet | true |
| `whitelist_vless` | `vless` | `whitelist` | whitelist-ingress | user → WL → selected exit → internet | false |
| `whitelist_hysteria` | `hysteria` | `whitelist` | whitelist-ingress | user → WL → selected exit → internet | false |

В коде нельзя определять `ru_direct` по названию сервера. Только по полю `mode`.

Правило:

```text
if mode == regular:
    ru_direct = true
if mode == whitelist:
    ru_direct = false
```

---

## 4. VLESS через Xray-core

### 4.1. Идентификация пользователя

VLESS-пользователь в Xray должен создаваться отдельно на каждое устройство.

Формат идентификатора:

```text
vless_email = u:{user_id}:d:{device_id}:p:vless:n:{node_id}:m:{mode}
```

Пример:

```text
u:1842:d:dev_91K2:p:vless:n:fi-01:m:regular
```

Это значение нужно указывать как `email` пользователя в Xray, потому что статистика Xray по пользователю работает по user email/identifier.

### 4.2. UUID

Каждое устройство получает отдельный UUID.

Запрещено:

- один UUID на всех пользователей;
- один UUID на весь аккаунт;
- один UUID на все устройства;
- пересоздавать UUID при каждом открытии страницы подписки.

Разрешено:

- один UUID на конкретную связку `user_id + device_id + protocol + node_id + mode`;
- ротация UUID только при ручном reset устройства или при компрометации.

### 4.3. Xray API и статистика

На Xray нужно включить:

- `api` с `StatsService` и при необходимости `HandlerService`;
- `stats: {}`;
- policy counters для user uplink/downlink;
- доступ к API только с localhost или через node-agent.

Backend не должен ходить напрямую в Xray API по публичной сети. Правильный путь:

```text
backend → node-agent → localhost Xray API
```

Так проще защищать StatsService и HandlerService.

### 4.4. Dynamic users

Для VLESS есть два допустимых варианта управления пользователями:

1. Через Xray HandlerService, если команда разработки реализует безопасное динамическое добавление/удаление.
2. Через генерацию config и безопасный reload/restart, если динамика будет нестабильной.

Требование к UX: пользователь не должен ждать ручного вмешательства админа после оплаты.

Требование к стабильности: изменение одного пользователя не должно ломать всех пользователей на сервере.

---

## 5. Hysteria2

### 5.1. Авторизация

Для Hysteria обязательно использовать не общий password, а авторизацию через backend.

Рекомендуемый режим:

```yaml
auth:
  type: http
  http:
    url: http://127.0.0.1:18081/hysteria/auth
    insecure: false
```

Реальный endpoint лучше обслуживать node-agent, а node-agent уже проверяет пользователя через центральный backend или локальный кеш.

### 5.2. Формат auth token

Hysteria auth payload должен быть уникален для устройства.

Формат в базе:

```text
hy_auth_token = random_32_64_bytes_urlsafe
hy_client_id = u:{user_id}:d:{device_id}:p:hysteria:n:{node_id}:m:{mode}
```

Когда Hysteria вызывает HTTP auth, backend должен вернуть:

```json
{
  "ok": true,
  "id": "u:1842:d:dev_91K2:p:hysteria:n:fi-01:m:regular"
}
```

Именно этот `id` потом используется для статистики и online/devices.

### 5.3. Блокировка клиента

Если подписка истекла, пользователь заблокирован, превышен трафик или устройство удалено, auth endpoint возвращает:

```json
{
  "ok": false
}
```

Если пользователь уже подключён, node-agent должен вызвать Hysteria Traffic Stats API `/kick`, но важно понимать: kick сам по себе не является постоянной блокировкой. Постоянная блокировка должна происходить через auth backend.

### 5.4. Traffic Stats API

На Hysteria нужно включить Traffic Stats API на localhost или private interface:

```yaml
trafficStats:
  listen: 127.0.0.1:9999
  secret: ${HYSTERIA_STATS_SECRET}
```

Node-agent регулярно вызывает:

- `GET /traffic` — получить трафик по client id;
- `GET /online` — получить online client instances;
- `POST /kick` — отключить клиентов при блокировке.

---

## 6. Обычная маршрутизация с RU direct

Обычные профили должны отдавать в Happ routing-профиль, где русские ресурсы идут напрямую.

Общее правило:

```text
RU domains/IPs/private networks -> direct
everything else -> selected VPN profile
```

Пример логики, не финальный JSON:

```json
{
  "name": "Ghost Pepe RU Direct",
  "rules": [
    { "type": "ip", "value": "private", "outbound": "direct" },
    { "type": "domain", "value": "ru_resources", "outbound": "direct" },
    { "type": "ip", "value": "ru_geoip", "outbound": "direct" },
    { "type": "final", "outbound": "proxy" }
  ]
}
```

Реальные правила должны генерироваться из выбранных geo/routing списков и проверяться тестами. Нельзя полагаться только на доменную зону `.ru`, потому что часть русских сервисов работает на `.com`, `.net` и CDN.

---

## 7. Whitelist-маршрутизация

Whitelist-профили должны отличаться от обычных профилей не только названием, но и реальным маршрутом.

Для whitelist-профиля запрещено:

- включать local RU direct;
- давать пользователю endpoint обычного FI/DE сервера;
- смешивать обычную и whitelist-статистику;
- показывать whitelist как основной ежедневный профиль без пояснения.

Правильная схема:

```text
Happ → WL endpoint → WL ingress → selected exit → internet
```

Если WL сам является exit:

```text
Happ → WL endpoint → internet
```

Режим WL должен иметь отдельные поля:

```text
mode = whitelist
ingress_node_id = wl-01
exit_node_id = fi-01 или de-01 или wl-01
protocol = vless или hysteria
```

---

## 8. Server-side routing на WL ingress

WL ingress должен понимать, какой exit выбран пользователем.

Есть два рабочих подхода:

### Подход A. Отдельный inbound на каждый exit

Пример:

| Inbound | Назначение |
|---|---|
| `wl-vless-to-fi` | VLESS whitelist вход, дальше FI. |
| `wl-vless-to-de` | VLESS whitelist вход, дальше DE. |
| `wl-hy-to-fi` | Hysteria whitelist вход, дальше FI. |
| `wl-hy-to-de` | Hysteria whitelist вход, дальше DE. |

Плюс: просто отлаживать.  
Минус: больше портов/конфигов.

### Подход B. Один inbound, выбор exit по user/device metadata

Пример:

```text
client id содержит exit=fi или exit=de
node-agent/backend возвращает route decision
локальный routing отправляет трафик в нужный outbound
```

Плюс: меньше публичных endpoint.  
Минус: сложнее реализовать и тестировать.

Для первой стабильной версии лучше использовать Подход A.

---

## 9. DNS и geo rules

Система должна отдельно хранить версию routing rules.

Обязательные поля:

```text
routing_rules_version
geoip_version
geosite_version
updated_at
checksum
source_url
```

Перед выпуском новой версии правил нужно прогонять smoke tests:

- `gosuslugi.ru` → direct в regular;
- `yandex.ru` → direct в regular;
- `sberbank.ru` → direct в regular;
- `google.com` → proxy;
- `youtube.com` → proxy;
- `telegram.org` → proxy или по выбранной политике;
- любой whitelist-профиль → не должен иметь local direct.

---

## 10. Health checks

Каждая нода должна отдавать backend'у такие данные:

```json
{
  "node_id": "fi-01",
  "role": "exit-node",
  "xray_alive": true,
  "hysteria_alive": true,
  "load_avg": 0.42,
  "cpu_percent": 18.5,
  "ram_percent": 51.2,
  "disk_percent": 33.0,
  "rx_bytes_5m": 123456789,
  "tx_bytes_5m": 987654321,
  "active_vless_devices": 120,
  "active_hysteria_devices": 98,
  "checked_at": "2026-06-27T12:00:00Z"
}
```

Админка должна показывать сервер как проблемный, если:

- node-agent не отвечал больше 2 минут;
- Xray не работает;
- Hysteria не работает;
- disk usage больше 85%;
- load стабильно высокий;
- трафик резко упал до нуля при активных пользователях.

---

## 11. Firewall

Обязательные правила:

- публично открывать только порты VLESS/Hysteria и HTTPS для публичных сервисов;
- Xray API слушает только localhost;
- Hysteria Traffic Stats API слушает только localhost;
- node-agent API недоступен из интернета;
- PostgreSQL недоступен из интернета;
- Redis недоступен из интернета;
- SSH закрыть по ключам, парольный вход отключить;
- доступ админа к инфраструктуре через VPN/allowlist/SSH key, а не через открытые панели.

---

## 12. Acceptance tests для нод

Codex должен реализовать тесты или команды проверки:

1. Создать тестового пользователя.
2. Создать 1 устройство.
3. Выдать 4 профиля для FI.
4. Выдать 4 профиля для DE.
5. Проверить, что обычные профили имеют `ru_direct=true`.
6. Проверить, что whitelist-профили имеют `ru_direct=false`.
7. Проверить, что whitelist endpoint указывает на WL ingress, а не на FI/DE.
8. Проверить, что VLESS traffic появляется в Xray stats по email.
9. Проверить, что Hysteria traffic появляется в `/traffic` по client id.
10. Заблокировать устройство и проверить отказ Hysteria auth.
11. Заблокировать устройство и проверить удаление/деактивацию VLESS credentials.
12. Превысить лимит 5 устройств и получить понятную ошибку.

---

## 13. Источники

- Xray VLESS: https://xtls.github.io/en/config/inbounds/vless.html
- Xray routing: https://xtls.github.io/en/config/routing.html
- Xray stats: https://xtls.github.io/en/config/stats.html
- Xray API: https://xtls.github.io/en/config/api.html
- Hysteria full server config: https://v2.hysteria.network/docs/advanced/Full-Server-Config/
- Hysteria Traffic Stats API: https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/
- Happ routing: https://www.happ.su/main/dev-docs/routing
