Проект: Pokrovka Smart Home на NanoPi-R6S.

Стек:
- Node.js backend в DEMO_ENDPOINT/server.js
- UI в текущем проекте
- Zigbee2MQTT + Mosquitto
- API порт 3010
- Zigbee2MQTT frontend порт 8081
- MQTT broker 127.0.0.1:1883

Важные правила:
- Не ломать существующие Arduino/датчики.
- Zigbee-устройства отображать постоянными типовыми карточками:
  кран — открыть/закрыть,
  реле — включить/выключить,
  кнопка/выключатель — статус/последнее действие,
  датчик — показания.
- JSON-команды оставлять только в расширенном/отладочном режиме.

Темы интерфейса (4: dark/light/midnight/day):
- В НОВЫХ компонентах использовать семантические токены вместо сырых hex:
  bg-surface / bg-card / bg-panel / bg-inset, border-line,
  text-ink / text-ink-soft / text-ink-muted, text-accent
  (заданы в tailwind.config.js → var(--c-*), значения в src/styles/index.css).
  Тогда компонент темится во всех темах сам.
- НЕ добавлять новые `bg-[#hex]`: иначе придётся дописывать ремап в каждый
  блок .theme-* в styles/index.css (иначе тёмное пятно на светлых темах).
- Деплой UI: ./deploy.sh (сборка во временный каталог + атомарный своп).
