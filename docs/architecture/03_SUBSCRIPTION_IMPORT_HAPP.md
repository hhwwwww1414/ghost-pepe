# 03_SUBSCRIPTION_IMPORT_HAPP.md

# Подписки, Happ-импорт и проверка устройства

Дата фиксации: 27.06.2026

---

## 1. Цель документа

Этот документ описывает, как пользователь получает ссылку на подписку, как открывается веб-страница импорта, как проверяется устройство и как подписка автоматически импортируется в Happ.

Главная идея: пользователь не должен копировать технические строки вручную. Он покупает подписку в Telegram, открывает красивую страницу, нажимает кнопку своей платформы и попадает в Happ.

---

## 2. Что обязательно должно быть реализовано

1. Подписка выдаётся не прямой строкой `vless://` или `hy2://`, а ссылкой на веб-страницу.
2. Страница проверяет устройство пользователя.
3. Android-пользователь не может нажать кнопку iPhone.
4. iPhone-пользователь не может нажать Android-кнопку.
5. Если Happ установлен, пользователь автоматически переходит в Happ.
6. Если Happ не установлен, страница показывает установку Happ и кнопку повторного импорта.
7. Backend фиксирует устройство только после реальной попытки импорта.
8. Лимит устройств — максимум 5 активных устройств на пользователя.
9. Повторное обновление подписки не создаёт новое устройство.
10. Пользователь может открыть эту же страницу позже и обновить подписку без дублирования устройства.

---

## 3. Ссылка, которую получает пользователь

После оплаты бот выдаёт ссылку вида:

```text
https://sub.example.com/s/{public_subscription_token}
```

Пример:

```text
https://sub.example.com/s/sub_9A2kLmPq7
```

`public_subscription_token` не должен быть равен `user_id`, `telegram_id`, UUID устройства или секрету протокола. Это публичный токен страницы, который можно отозвать и перевыпустить.

---

## 4. Структура страницы импорта

Страница должна иметь простую структуру:

```text
Название сервиса
Статус подписки
Срок действия
Осталось трафика
Устройств: 2 из 5

[Открыть в Happ на iPhone]
[Открыть в Happ на Android]
[Открыть в Happ на Windows/macOS]
[Показать QR-код]
[Скопировать ссылку подписки]
[Инструкция]
```

Кнопки неподходящих платформ должны быть disabled.

Пример:

- пользователь с iPhone видит активную кнопку iPhone;
- Android-кнопка заблокирована с текстом `Откройте эту ссылку с Android-устройства`;
- пользователь с Android видит активную Android-кнопку;
- iPhone-кнопка заблокирована.

---

## 5. Проверка устройства

Проверка устройства делается в два слоя.

### 5.1. Frontend-check

Frontend определяет платформу по:

- `navigator.userAgent`;
- `navigator.platform`;
- признакам iOS/iPadOS;
- признакам Android;
- признакам desktop.

Frontend нужен для удобства, но ему нельзя доверять полностью.

### 5.2. Backend-check

Backend получает явный параметр платформы:

```text
POST /api/subscription/import/start
```

Пример тела:

```json
{
  "public_subscription_token": "sub_9A2kLmPq7",
  "platform": "ios",
  "app": "happ",
  "browser_user_agent": "...",
  "timezone": "Europe/Moscow"
}
```

Backend обязан проверить:

- подписка существует;
- подписка активна;
- пользователь не заблокирован;
- лимит устройств не превышен;
- платформа поддерживается;
- токен не отозван;
- не превышен rate limit.

---

## 6. Создание устройства

Устройство создаётся не при оплате, а при первом импорте.

Алгоритм:

```text
1. Пользователь открывает страницу подписки.
2. Нажимает кнопку своей платформы.
3. Backend создаёт import_session.
4. Backend ищет существующее устройство по install_id / happ InstallID / HWID / stable token.
5. Если устройство найдено — используется оно же.
6. Если устройство не найдено и активных устройств меньше 5 — создаётся новое устройство.
7. Если активных устройств уже 5 — импорт запрещается.
8. Backend выдаёт subscription_url/deeplink для Happ.
```

Устройство получает человекочитаемое имя:

```text
iPhone • 27.06.2026
Android • Samsung • 27.06.2026
Windows • 27.06.2026
```

Пользователь потом может переименовать устройство в боте или админке.

---

## 7. Почему нельзя выдавать один общий subscription URL без install tracking

Если выдать один общий URL на пользователя, появятся проблемы:

- пользователь сможет поставить подписку на бесконечное число устройств;
- трафик будет смешиваться;
- одно устройство нельзя будет отключить отдельно;
- при обновлениях Happ устройства могут дублироваться;
- админка не покажет честную статистику по устройствам.

Правильная схема: общий публичный page-token ведёт на страницу, а сама рабочая подписка выдаётся только после создания/нахождения конкретного device record.

---

## 8. Happ Limited Links

Для Happ нужно использовать limited link/install limit, если доступен личный кабинет или API Happ Provider.

Задача limited link:

- ограничить установку подписки;
- добавить `InstallID`;
- усложнить удаление install-параметра пользователем;
- снизить риск обхода лимита устройств.

Но backend всё равно должен вести собственный реестр устройств. Нельзя полностью перекладывать учёт устройств только на Happ, потому что админка, бот, трафик и оплаты должны жить в вашей базе.

Правильная схема:

```text
Ваш backend device registry + Happ limited link = двойная защита
```

---

## 9. Типы подписок Happ

Happ поддерживает обычную подписку по веб-URL и зашифрованную подписку `happ://crypto...`.

Рекомендация:

1. Для production использовать зашифрованную Happ-ссылку, если Provider/API доступен и стабильно работает.
2. Для fallback оставить обычный HTTPS subscription URL.
3. В админке хранить, какой способ выдан пользователю.

---

## 10. Формат subscription endpoint

Рабочий endpoint подписки:

```text
GET https://api.example.com/sub/{device_subscription_token}
```

Пример:

```text
GET https://api.example.com/sub/devsub_J83ksP20a
```

Этот endpoint возвращает не HTML, а тело подписки для Happ.

Обязательные проверки при каждом запросе:

- device token существует;
- устройство активно;
- подписка активна;
- пользователь не заблокирован;
- трафик не превышен;
- устройство не удалено;
- токен не отозван.

Если проверка не пройдена, endpoint не должен возвращать рабочие VLESS/Hysteria-ссылки.

---

## 11. Happ headers

Subscription endpoint должен отдавать полезные Happ headers.

Пример:

```http
HTTP/2 200
content-type: text/plain; charset=utf-8
profile-title: Ghost Pepe
profile-update-interval: 6
subscription-userinfo: upload=123456; download=987654; total=107374182400; expire=1790951622
support-url: https://t.me/support_username
```

`subscription-userinfo` обязателен, потому что Happ умеет отображать использованный трафик, общий лимит и срок подписки.

Если используется routing profile:

```http
routing: happ://routing/onadd/{base64_profile}
```

Или routing link добавляется в тело подписки, если выбран такой способ.

---

## 12. Тело подписки

Backend должен генерировать только разрешённые протоколы: `vless://` и `hy2://` / Hysteria2-compatible link.

Пример структуры тела, не финальные реальные credentials:

```text
#profile-title: Ghost Pepe
#subscription-userinfo: upload=123456; download=987654; total=107374182400; expire=1790951622
#support-url: https://t.me/support_username
#profile-update-interval: 6

vless://{device_uuid}@fi-vless.example.com:443?...#FI VPN VLESS
hy2://{device_hy_token}@fi-hy.example.com:443?...#FI VPN Hysteria
vless://{device_uuid_wl}@wl-vless.example.com:443?...#FI Whitelist VLESS
hy2://{device_hy_token_wl}@wl-hy.example.com:443?...#FI Whitelist Hysteria

vless://{device_uuid_de}@de-vless.example.com:443?...#DE VPN VLESS
hy2://{device_hy_token_de}@de-hy.example.com:443?...#DE VPN Hysteria
vless://{device_uuid_de_wl}@wl-vless.example.com:443?...#DE Whitelist VLESS
hy2://{device_hy_token_de_wl}@wl-hy.example.com:443?...#DE Whitelist Hysteria
```

Важно: whitelist-ссылки для FI и DE могут иметь одинаковый публичный endpoint `wl-vless.example.com` / `wl-hy.example.com`, но должны различаться credentials и route metadata на backend/WL ingress.

---

## 13. Импорт в Happ

Страница импорта должна пытаться открыть Happ через deeplink/universal link, который поддерживается выбранной версией Happ.

Общий сценарий:

```text
1. Пользователь нажимает кнопку.
2. Frontend вызывает backend import/start.
3. Backend возвращает happ_import_url.
4. Frontend делает redirect на happ_import_url.
5. Если приложение не открылось, через 2-3 секунды показывается fallback: скачать Happ, скопировать ссылку, QR.
```

Запрещено обещать импорт без fallback. У пользователя может не быть Happ, браузер может заблокировать deeplink, а iOS/Android могут вести себя по-разному.

---

## 14. Android TV

Для Android TV нужен отдельный сценарий.

Пользователь в Happ на TV получает код, а веб-страница отправляет подписку через Happ TV API.

UI:

```text
[Android TV]
Введите 5-значный код из Happ TV: _____
[Отправить подписку на телевизор]
```

Backend должен сохранять событие `tv_import_sent`, но не считать Android TV устройством до подтверждения или первой активности по трафику/auth.

---

## 15. Ошибки импорта

Все ошибки должны быть понятными.

| Ситуация | Сообщение пользователю |
|---|---|
| Подписка истекла | `Подписка закончилась. Продлите её в Telegram-боте.` |
| Лимит 5 устройств | `У вас уже 5 устройств. Удалите одно устройство в боте.` |
| Пользователь заблокирован | `Доступ ограничен. Напишите в поддержку.` |
| Неподходящая платформа | `Откройте эту кнопку с нужного устройства.` |
| Happ не открылся | `Похоже, Happ не установлен. Установите приложение и нажмите импорт ещё раз.` |
| Token revoked | `Ссылка устарела. Получите новую ссылку в боте.` |

---

## 16. Антидублирование устройств

Backend должен использовать несколько признаков:

```text
user_id
subscription_id
install_id
happ_install_id
hwid_hash, если доступен
platform
first_seen_ip_hash
user_agent_hash
```

Нельзя считать IP главным идентификатором устройства. IP меняется, особенно на мобильных сетях.

Нельзя считать User-Agent главным идентификатором устройства. Он может меняться после обновлений.

Главный идентификатор — install token / Happ InstallID / HWID / backend device token.

---

## 17. Безопасность subscription endpoint

Обязательные меры:

- длинные random tokens;
- хранить hash токена в базе, а не raw token;
- rate limit по IP, user, token;
- не логировать raw credentials;
- не возвращать credentials в HTML;
- не показывать UUID/Hysteria token в админке полностью;
- поддерживать revoke конкретного device token;
- поддерживать full revoke всех устройств пользователя.

---

## 18. Acceptance criteria

Сценарий считается готовым, если:

1. Пользователь после Stars-оплаты получает страницу импорта.
2. iPhone видит активную iPhone-кнопку.
3. Android видит активную Android-кнопку.
4. Неподходящие кнопки заблокированы и backend тоже не пропускает неправильную платформу.
5. Happ импортирует подписку через ссылку.
6. В подписке есть только VLESS и Hysteria.
7. У пользователя отображается трафик и срок подписки в Happ.
8. Повторное обновление подписки не создаёт новое устройство.
9. Шестое устройство не добавляется.
10. Удаление устройства в боте отключает все его VLESS/Hysteria credentials.

---

## 19. Источники

- Happ adding configuration/subscription: https://www.happ.su/main/ru/faq/adding-configuration-subscription
- Happ app management: https://www.happ.su/main/dev-docs/app-management
- Happ limited links: https://www.happ.su/main/dev-docs/limited-links
- Happ routing: https://www.happ.su/main/dev-docs/routing
- Happ examples of links and parameters: https://www.happ.su/main/dev-docs/examples-of-links-and-parameters
