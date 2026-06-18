# Zigbee для Pokrovka / Умный дом

Добавлена связка:

```text
SONOFF ZBDongle-P → Zigbee2MQTT → Mosquitto MQTT → Pokrovka API → React UI
```

## Что добавлено

### На сервере

- MQTT-клиент в `DEMO_ENDPOINT/server.js`.
- Подписка на `zigbee2mqtt/#`.
- Автоматическое хранение Zigbee-устройств в `state.json`.
- Heartbeat Zigbee-устройств в общем списке `/api/devices`.
- События Zigbee попадают в общий журнал.
- Critical-уведомление для payload `water_leak: true`.

### API

- `GET /api/zigbee/status`
- `POST /api/zigbee/permit-join`
- `POST /api/zigbee/bridge/health-check`
- `POST /api/zigbee/bridge/restart`
- `POST /api/zigbee/devices/:friendlyName/set`
- `POST /api/zigbee/devices/:friendlyName/get`

### UI

- Новая вкладка `Zigbee`.
- Статусы MQTT, Zigbee2MQTT bridge, pairing.
- Кнопка добавления новых устройств на 254 секунды.
- Кнопка закрытия pairing.
- Список устройств.
- Быстрые кнопки `ON/OFF/TOGGLE` для ламп/реле.
- Управление brightness для ламп.
- Отправка произвольной JSON-команды в `zigbee2mqtt/<friendly_name>/set`.
- Ссылка на Zigbee2MQTT frontend: `http://<ip-сервера>:8081`.

## Установка

Скопируй архив в `/var/www/html`, затем:

```bash
cd /var/www/html
unzip -o pokrovka-zigbee-server-ui-fixed.zip

cd /var/www/html/pokrovka
sudo chmod +x install_pokrovka_zigbee.fixed.sh
sudo ./install_pokrovka_zigbee.fixed.sh install
```

Если на сервере несколько USB serial-устройств, укажи донгл явно:

```bash
ls -l /dev/serial/by-id/
sudo ZIGBEE_ADAPTER=/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_... ./install_pokrovka_zigbee.fixed.sh install
```

Для ZBDongle-P используется:

```yaml
serial:
  adapter: zstack
```

## Проверка

```bash
curl http://127.0.0.1:3010/api/zigbee/status
cd /opt/pokrovka-zigbee && sudo docker compose ps
cd /opt/pokrovka-zigbee && sudo docker compose logs --tail=100 zigbee2mqtt
```

Открыть Zigbee2MQTT UI:

```text
http://IP_СЕРВЕРА:8081
```

## Добавление устройства

1. Открой вкладку `Zigbee` в нашей панели.
2. Нажми `Добавить устройство`.
3. Переведи Zigbee-устройство в режим pairing.
4. Дождись появления карточки устройства.
5. После добавления можно нажать `Закрыть pairing`.


## v5: API service fix

Если `curl http://127.0.0.1:3010/api/zigbee/status` возвращает `Cannot GET /api/zigbee/status`, значит на порту 3010 работает старый backend без Zigbee routes. Установщик v5 создаёт/перезаписывает `pokrovka-api.service`, останавливает старый node-процесс на порту 3010 и проверяет endpoint после старта.

## v6: автоматические методы управления

UI больше не использует жёсткую логику только для `state` и `brightness`. Для каждого добавленного устройства API отдаёт массив `controls`, сформированный из `definition.exposes` Zigbee2MQTT.

В карточке устройства автоматически появляются:

- переключатели для `state` и `binary` свойств;
- слайдеры/числовые поля для `numeric` свойств: `brightness`, `color_temp`, `position`, `occupied_heating_setpoint` и т.п.;
- выпадающие списки для `enum` свойств: `power_on_behavior`, `system_mode`, `preset`, `fan_mode` и т.п.;
- текстовые поля для `text` свойств;
- read-only свойства датчиков: `temperature`, `humidity`, `battery`, `linkquality`, `water_leak`, `occupancy`, `contact`.

Дополнительный endpoint:

```bash
curl http://127.0.0.1:3010/api/zigbee/devices/FRIENDLY_NAME/methods
```

Команды по-прежнему отправляются через:

```bash
POST /api/zigbee/devices/FRIENDLY_NAME/set
```

Тело запроса — JSON, например:

```json
{"state":"ON"}
```

или:

```json
{"brightness":180}
```

## v13: fallback-кнопки управления Zigbee

Если Zigbee2MQTT не отдаёт `definition.exposes` для устройства, но устройство публикует состояние вида `{"state":"ON","power_on_behavior":"previous"}`, UI теперь всё равно строит методы управления по текущему state:

- `state` → кнопки Вкл / Выкл / Toggle;
- `power_on_behavior` → выпадающий список off / on / toggle / previous;
- `brightness`, `color_temp`, `position`, `cover_position` → слайдеры;
- датчиковые свойства (`linkquality`, `temperature`, `humidity`, `battery`, `occupancy`, `water_leak` и т.д.) отображаются как показания без кнопок.

API `/api/zigbee/status` и `/api/zigbee/devices/:friendlyName/methods` тоже возвращают fallback controls, поэтому UI не зависит только от exposes.
