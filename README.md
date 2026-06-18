# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

<img width="907" height="358" alt="873bb7c8cfaef9bce1a8d7aeb0755391a05fc500" src="https://github.com/user-attachments/assets/d7369568-c9be-4a47-9627-d29fa82630b2" />
<table border="1" cellpadding="6" cellspacing="0">
  <thead>
    <tr>
      <th>Пин CC1101 V2</th>
      <th>Назначение</th>
      <th>Подключение к Arduino UNO</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>VCC</td>
      <td>Питание</td>
      <td>3.3V <strong>(НЕ 5V!)</strong></td>
    </tr>
    <tr>
      <td>GND</td>
      <td>Земля</td>
      <td>GND</td>
    </tr>
    <tr>
      <td>CSN / CS / NSS</td>
      <td>SPI Chip Select</td>
      <td>D10</td>
    </tr>
    <tr>
      <td>SCK</td>
      <td>SPI Clock</td>
      <td>D13</td>
    </tr>
    <tr>
      <td>MOSI / SI</td>
      <td>SPI Master Out</td>
      <td>D11</td>
    </tr>
    <tr>
      <td>MISO / SO</td>
      <td>SPI Master In</td>
      <td>D12</td>
    </tr>
    <tr>
      <td>GDO0</td>
      <td>Прерывание / выход</td>
      <td>D2 (или другой свободный)</td>
    </tr>
    <tr>
      <td>GDO2</td>
      <td>Необязательный</td>
      <td>Не подключать</td>
    </tr>
  </tbody>
</table>



## Датчики протечки и реестр датчиков

Статичные датчики теперь вынесены в файл `DEMO_ENDPOINT/sensors.json`.
Фронт больше не рисует встроенные датчики отдельно: вкладка «Датчики», верхняя строка статуса и общий статус дома берут данные из `GET /api/sensors`.

Основной endpoint для Arduino и аналогичных датчиков:

```http
POST /api/sensors/event
Content-Type: application/json

{
  "deviceId": "washing-machine-leak-uno",
  "alarm": true,
  "rain": true,
  "ao": 512,
  "reason": "alarm_on"
}
```

Команда удалённого сброса для конкретного устройства:

```http
GET /api/sensors/by-device/washing-machine-leak-uno/command
```

Сброс тревоги с сервера:

```http
POST /api/sensors/sensor-washing-machine/reset
```

Старые endpoint'ы `/api/washing-machine`, `/api/bathroom`, `/api/dishwasher` оставлены для совместимости, но внутри они теперь синхронизируются с единым реестром датчиков.

## Добавлено в версии system-telegram-maintenance-fixed

### Режим обслуживания датчика
Во вкладке **Датчики → Список** у каждой карточки есть кнопки:
- `Обслуж. 15 мин`
- `Обслуж. 1 час`
- `Вернуть в работу`

Пока датчик в обслуживании, события протечки продолжают попадать в журнал, но не создают critical-аварию. Это удобно при проверке датчика, замене проводов или тесте протечки.

### Telegram-уведомления
Настройка находится во вкладке **Настройки → Telegram-уведомления**.
Нужно указать:
- Bot token
- Chat ID
- какие приоритеты отправлять: critical / warning / info

Critical по умолчанию включён. После сохранения можно нажать **Отправить тест**.

Backend endpoints:
- `GET /api/settings/telegram`
- `PUT /api/settings/telegram`
- `POST /api/settings/telegram/test`

### Вкладка «Система»
Добавлена отдельная вкладка **Система** для NanoPi:
- backend online
- uptime backend
- uptime NanoPi
- CPU / RAM / Disk
- температура CPU, если доступна через `/sys/class/thermal/...`
- пути к `state.json` и `sensors.json`
- общий статус дома и устройств

Backend endpoint:
- `GET /api/system/status`

## WireGuard VPN (`pokrovka.conf`)

В проект добавлено управление WireGuard из UI: **Настройки → VPN-доступ**.

1. Положите рабочий конфиг в корень проекта:

```bash
/var/www/html/pokrovka/pokrovka.conf
```

2. Установите WireGuard, скопируйте конфиг в `/etc/wireguard/pokrovka.conf`, включите автозапуск и поднимите интерфейс:

```bash
cd /var/www/html/pokrovka
sudo chmod +x install_pokrovka_wireguard.fixed.sh
sudo ./install_pokrovka_wireguard.fixed.sh install
```

3. Ручное управление:

```bash
sudo ./install_pokrovka_wireguard.fixed.sh up
sudo ./install_pokrovka_wireguard.fixed.sh down
sudo ./install_pokrovka_wireguard.fixed.sh restart
sudo ./install_pokrovka_wireguard.fixed.sh status
```

API для UI:

```bash
curl http://127.0.0.1:3010/api/vpn/status
curl -X POST http://127.0.0.1:3010/api/vpn/up
curl -X POST http://127.0.0.1:3010/api/vpn/down
```
