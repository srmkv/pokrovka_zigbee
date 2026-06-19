const express = require("express");
const cors = require("cors");
const fs = require("fs");
// Предпочитать IPv4 при резолвинге (через VPN IPv6 часто недоступен и запросы виснут).
try { require("dns").setDefaultResultOrder?.("ipv4first"); } catch (_) {}
const path = require("path");
const fetch = require("node-fetch");
const os = require("os");
const { execFile, execSync } = require("child_process");
let mqtt = null;
try {
  mqtt = require("mqtt");
} catch (e) {
  console.warn("MQTT package is not installed yet. Zigbee integration will stay offline until npm install installs mqtt.");
}

const app = express();
const PORT = Number(process.env.PORT || 3010);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_EVENT_LOG = 250;
const MAX_NOTIFICATIONS = 80;
const DEVICE_TIMEOUT_MS = 90 * 1000;
const TELEGRAM_API_BASE = "https://api.telegram.org";

const ARDUINO_IP = "192.168.0.115";
const ARDUINO_PORT = 80;

async function sendToArduino(cmd) {
  try {
    const url = `http://${ARDUINO_IP}:${ARDUINO_PORT}/${cmd}`;
    const resp = await fetch(url, { timeout: 1000 });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return await resp.text();
  } catch (e) {
    console.error("Ошибка связи с Arduino:", e.message);
    return null;
  }
}

const STATE_PATH = path.join(__dirname, "state.json");
const SENSORS_PATH = path.join(__dirname, "sensors.json");
const VALID_LEAK_STATUSES = new Set(["dry", "leak", "unknown"]);
const SENSOR_LABELS = {
  leakSensor: "Ванная",
  washingMachineSensor: "Стиральная машина",
  dishwasherSensor: "Посудомойка",
  kitchenSensor: "Кухня"
};

function readStaticSensors() {
  try {
    const raw = fs.readFileSync(SENSORS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.warn("Не удалось прочитать sensors.json, использую встроенный fallback:", e.message);
  }

  return [
    {
      id: "sensor-bathroom",
      name: "Ванная",
      location: "Ванная",
      type: "leak",
      deviceId: "bathroom-leak-uno",
      icon: "drop",
      resettable: true,
      isBuiltIn: true,
      legacyKey: "leakSensor",
      createdAt: "fallback",
      isActive: true
    },
    {
      id: "sensor-washing-machine",
      name: "Стиральная машина",
      location: "Прачечная / ванная",
      type: "leak",
      deviceId: "washing-machine-leak-uno",
      icon: "washing-machine",
      resettable: true,
      isBuiltIn: true,
      legacyKey: "washingMachineSensor",
      createdAt: "fallback",
      isActive: true
    },
    {
      id: "sensor-dishwasher",
      name: "Посудомойка",
      location: "Кухня",
      type: "leak",
      deviceId: "dishwasher-leak-uno",
      icon: "dishwasher",
      resettable: true,
      isBuiltIn: true,
      legacyKey: "dishwasherSensor",
      createdAt: "fallback",
      isActive: true
    }
  ];
}

function defaultSensorRegistry() {
  return readStaticSensors().map(sensor => ({
    type: "leak",
    icon: "drop",
    resettable: true,
    ip: "",
    mac: "",
    firmwareVersion: "",
    isBuiltIn: true,
    isActive: true,
    ...sensor
  }));
}

const SCENARIOS = [
  {
    id: "morning",
    name: "Утро",
    description: "Свет включён, жалюзи приоткрыты, пол в комфортном режиме",
    apply: async () => {
      state.light.effect = "on";
      state.blinds.kitchen = 60;
      state.blinds.holl = 40;
      state.floor.living = { on: true, temp: 25 };
      state.floor.bath = { on: true, temp: 26 };
      await sendToArduino("on");
    }
  },
  {
    id: "night",
    name: "Ночь",
    description: "Свет выключен, жалюзи закрыты, тёплый пол в экономичном режиме",
    apply: async () => {
      state.light.effect = "off";
      state.blinds.kitchen = 0;
      state.blinds.holl = 0;
      state.blinds.room = 0;
      state.floor.living = { on: true, temp: 23 };
      state.floor.bath = { on: true, temp: 24 };
      await sendToArduino("off");
    }
  },
  {
    id: "away",
    name: "Ушёл из дома",
    description: "Свет выключен, жалюзи закрыты, пол понижен",
    apply: async () => {
      state.light.effect = "off";
      state.blinds.kitchen = 0;
      state.blinds.holl = 0;
      state.blinds.room = 0;
      state.floor.living = { on: false, temp: 20 };
      state.floor.bath = { on: false, temp: 20 };
      await sendToArduino("off");
    }
  },
  {
    id: "vacation",
    name: "Отпуск",
    description: "Экономичный режим для долгого отсутствия",
    apply: async () => {
      state.light.effect = "off";
      state.blinds.kitchen = 0;
      state.blinds.holl = 0;
      state.blinds.room = 0;
      state.floor.living = { on: false, temp: 18 };
      state.floor.bath = { on: false, temp: 18 };
      await sendToArduino("off");
    }
  }
];

function defaultRules() {
  return [
    {
      id: "washing-machine-leak-critical",
      name: "Критическая протечка стиральной машины",
      description: "Создаёт critical-уведомление при появлении протечки у стиральной машины",
      enabled: true,
      priority: "critical"
    },
    {
      id: "washing-machine-leak-resolved",
      name: "Протечка устранена",
      description: "Уведомляет, когда тревога у стиральной машины снята",
      enabled: true,
      priority: "info"
    },
    {
      id: "device-offline-warning",
      name: "Устройство недоступно",
      description: "Создаёт warning-уведомление, если heartbeat устройства пропал",
      enabled: true,
      priority: "warning"
    }
  ];
}

function defaultTelegramSettings() {
  return {
    enabled: false,
    botToken: "",
    chatId: "",
    sendCritical: true,
    sendWarning: false,
    sendInfo: false,
    lastTestAt: null,
    lastError: null
  };
}

function defaultSystemSettings() {
  return {
    name: "NanoPi",
    location: "Дом",
    maintenanceDefaultMinutes: 15
  };
}


function defaultZigbeeState() {
  return {
    enabled: process.env.ZIGBEE_DISABLED === "1" ? false : true,
    mqttUrl: process.env.ZIGBEE_MQTT_URL || "mqtt://127.0.0.1:1883",
    baseTopic: process.env.ZIGBEE_BASE_TOPIC || "zigbee2mqtt",
    frontendUrl: process.env.ZIGBEE_FRONTEND_URL || "http://localhost:8081",
    bridgeState: "unknown",
    permitJoin: false,
    permitJoinUntil: null,
    lastSeenAt: null,
    lastError: null,
    lastBridgeEvent: null,
    bridgeInfo: null,
    devices: {},
    values: {},
    responses: []
  };
}

function defaultState() {
  return {
    leakSensor: "dry",
    lastLeak: null,

    washingMachineSensor: "dry",
    lastLeakWashing: null,
    washingMachineResetVersion: 0,
    washingMachineLastResetAt: null,
    washingMachineLastSeenAt: null,
    washingMachineLastPayload: null,

    dishwasherSensor: "dry",
    lastLeakDishwasher: null,

    kitchenSensor: "dry",
    lastLeakKitchen: null,

    blinds: { kitchen: 0, room: 0, holl: 0 },
    light: { brightness: 80, effect: "off" },
    floor: {
      living: { on: true, temp: 26 },
      bath: { on: false, temp: 24 }
    },
    relays: {},
    eventLog: [],
    notifications: [],
    devices: {},
    scenarios: {
      activeScenarioId: null,
      lastAppliedAt: null
    },
    rules: defaultRules(),
    deviceLinks: [],
    waterValves: {},
    zigbeeNotify: {},
    irRemotes: [],
    sensorRegistry: defaultSensorRegistry(),
    sensorStates: {},
    settings: {
      telegram: defaultTelegramSettings(),
      system: defaultSystemSettings()
    },
    zigbee: defaultZigbeeState()
  };
}

let state = defaultState();

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  state = defaultState();
  if (fs.existsSync(STATE_PATH)) {
    try {
      const data = fs.readFileSync(STATE_PATH, "utf8");
      state = { ...state, ...JSON.parse(data) };
      state.blinds = { ...defaultState().blinds, ...(state.blinds || {}) };
      state.light = { ...defaultState().light, ...(state.light || {}) };
      state.floor = {
        ...defaultState().floor,
        ...(state.floor || {}),
        living: { ...defaultState().floor.living, ...(state.floor?.living || {}) },
        bath: { ...defaultState().floor.bath, ...(state.floor?.bath || {}) }
      };
      state.scenarios = { ...defaultState().scenarios, ...(state.scenarios || {}) };
      state.devices = state.devices || {};
      state.eventLog = Array.isArray(state.eventLog) ? state.eventLog : [];
      state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
      state.rules = mergeRules(state.rules);
      state.deviceLinks = Array.isArray(state.deviceLinks) ? state.deviceLinks : [];
      state.waterValves = (state.waterValves && typeof state.waterValves === "object" && !Array.isArray(state.waterValves)) ? state.waterValves : {};
      state.zigbeeNotify = (state.zigbeeNotify && typeof state.zigbeeNotify === "object" && !Array.isArray(state.zigbeeNotify)) ? state.zigbeeNotify : {};
      state.irRemotes = Array.isArray(state.irRemotes) ? state.irRemotes : [];
      state.sensorRegistry = mergeSensorRegistry(state.sensorRegistry);
      state.sensorStates = state.sensorStates || {};
      state.settings = {
        telegram: { ...defaultTelegramSettings(), ...((state.settings || {}).telegram || {}) },
        system: { ...defaultSystemSettings(), ...((state.settings || {}).system || {}) }
      };
      state.zigbee = {
        ...defaultZigbeeState(),
        ...(state.zigbee || {}),
        devices: { ...(state.zigbee?.devices || {}) },
        values: { ...(state.zigbee?.values || {}) },
        responses: Array.isArray(state.zigbee?.responses) ? state.zigbee.responses.slice(0, 20) : []
      };
      ensureSensorRegistryState();
      console.log("Состояние загружено из файла.");
    } catch (e) {
      console.warn("Ошибка чтения state.json:", e);
    }
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("Ошибка сохранения state.json:", e);
  }
}

function mergeRules(savedRules) {
  const defaults = defaultRules();
  const savedById = new Map((Array.isArray(savedRules) ? savedRules : []).map(rule => [rule.id, rule]));
  return defaults.map(rule => ({ ...rule, ...(savedById.get(rule.id) || {}) }));
}

function mergeSensorRegistry(savedRegistry) {
  const defaults = defaultSensorRegistry();
  const saved = Array.isArray(savedRegistry) ? savedRegistry : [];
  const savedById = new Map(saved.map(item => [item.id, item]));
  const defaultIds = new Set(defaults.map(item => item.id));
  const mergedDefaults = defaults.map(item => {
    const savedItem = savedById.get(item.id) || {};
    return {
      ...savedItem,
      ...item,
      ip: savedItem.ip ?? item.ip ?? "",
      mac: savedItem.mac ?? item.mac ?? "",
      firmwareVersion: savedItem.firmwareVersion ?? item.firmwareVersion ?? "",
      isBuiltIn: true
    };
  });
  const customItems = saved.filter(item => !defaultIds.has(item.id));
  return [...mergedDefaults, ...customItems];
}

function lastLeakKeyByLegacyKey(legacyKey) {
  return {
    leakSensor: "lastLeak",
    washingMachineSensor: "lastLeakWashing",
    dishwasherSensor: "lastLeakDishwasher",
    kitchenSensor: "lastLeakKitchen"
  }[legacyKey] || null;
}

function ensureSensorRegistryState() {
  if (!Array.isArray(state.sensorRegistry)) state.sensorRegistry = defaultSensorRegistry();
  if (!state.sensorStates || typeof state.sensorStates !== "object") state.sensorStates = {};

  state.sensorRegistry = state.sensorRegistry.map(sensor => ({
    type: "leak",
    icon: "drop",
    resettable: true,
    ip: "",
    mac: "",
    firmwareVersion: "",
    isActive: true,
    ...sensor
  }));

  state.sensorRegistry.forEach(sensor => {
    const legacyLastKey = lastLeakKeyByLegacyKey(sensor.legacyKey);
    const current = state.sensorStates[sensor.id] || {};
    const legacyStatus = sensor.legacyKey ? state[sensor.legacyKey] : undefined;
    const legacyLastTriggerAt = legacyLastKey ? state[legacyLastKey] : null;

    state.sensorStates[sensor.id] = {
      status: current.status || legacyStatus || "unknown",
      lastTriggerAt: current.lastTriggerAt ?? legacyLastTriggerAt ?? null,
      lastSeenAt: current.lastSeenAt || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastSeenAt || null : null),
      lastPayload: current.lastPayload || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastPayload || null : null),
      resetVersion: Number.isFinite(current.resetVersion) ? current.resetVersion : (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineResetVersion || 0 : 0),
      lastResetAt: current.lastResetAt || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastResetAt || null : null),
      maintenanceUntil: current.maintenanceUntil || null,
      maintenanceReason: current.maintenanceReason || ""
    };

    mirrorLegacySensorState(sensor, state.sensorStates[sensor.id]);
  });
}

function findSensorByLegacyKey(legacyKey) {
  ensureSensorRegistryState();
  return (state.sensorRegistry || []).find(sensor => sensor.legacyKey === legacyKey && sensor.isActive !== false);
}

function findSensorByDeviceId(deviceId) {
  ensureSensorRegistryState();
  return (state.sensorRegistry || []).find(sensor => sensor.deviceId === deviceId && sensor.isActive !== false);
}

function mirrorLegacySensorState(sensor, sensorState) {
  if (!sensor?.legacyKey) return;
  const status = sensorState?.status || "unknown";
  const lastKey = lastLeakKeyByLegacyKey(sensor.legacyKey);
  state[sensor.legacyKey] = status;
  if (lastKey) state[lastKey] = status === "leak" ? (sensorState?.lastTriggerAt || nowIso()) : null;

  if (sensor.legacyKey === "washingMachineSensor") {
    state.washingMachineResetVersion = sensorState?.resetVersion || 0;
    state.washingMachineLastResetAt = sensorState?.lastResetAt || null;
    state.washingMachineLastSeenAt = sensorState?.lastSeenAt || null;
    state.washingMachineLastPayload = sensorState?.lastPayload || null;
  }
}

function isRuleEnabled(ruleId) {
  return !!state.rules.find(rule => rule.id === ruleId && rule.enabled);
}

function isSensorInMaintenance(sensorOrState) {
  const sensorState = sensorOrState?.id ? getSensorComputedState(sensorOrState) : sensorOrState;
  if (!sensorState?.maintenanceUntil) return false;
  const until = new Date(sensorState.maintenanceUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

function sanitizeTelegramSettings(settings = state.settings?.telegram || {}) {
  const token = String(settings.botToken || "");
  const maskedToken = token ? `${token.slice(0, 6)}...${token.slice(-4)}` : "";
  return {
    enabled: !!settings.enabled,
    botTokenSet: !!token,
    botTokenMasked: maskedToken,
    chatId: String(settings.chatId || ""),
    sendCritical: settings.sendCritical !== false,
    sendWarning: !!settings.sendWarning,
    sendInfo: !!settings.sendInfo,
    lastTestAt: settings.lastTestAt || null,
    lastError: settings.lastError || null
  };
}

function shouldSendTelegramForPriority(priority) {
  const tg = { ...defaultTelegramSettings(), ...((state.settings || {}).telegram || {}) };
  if (!tg.enabled || !tg.botToken || !tg.chatId) return false;
  if (priority === "critical") return tg.sendCritical !== false;
  if (priority === "warning") return !!tg.sendWarning;
  return !!tg.sendInfo;
}

async function sendTelegramMessage(text, { force = false } = {}) {
  const tg = { ...defaultTelegramSettings(), ...((state.settings || {}).telegram || {}) };
  // force=true игнорирует глобальный тумблер enabled (для теста и явных подписок),
  // но всё равно требует токен и chatId.
  if (!tg.botToken || !tg.chatId || (!force && !tg.enabled)) return { skipped: true };

  const url = `${TELEGRAM_API_BASE}/bot${tg.botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    timeout: 5000
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.description || `Telegram HTTP ${resp.status}`);
  return data;
}

function formatNotificationForTelegram(note) {
  const icon = note.priority === "critical" ? "🚨" : note.priority === "warning" ? "⚠️" : "ℹ️";
  const title = String(note.title || "Уведомление").replace(/[<>]/g, "");
  const text = String(note.text || "").replace(/[<>]/g, "");
  return `${icon} <b>${title}</b>\n${text}\n\nПриоритет: ${note.priority}\nИсточник: ${note.source || "system"}\nВремя: ${new Date(note.createdAt || Date.now()).toLocaleString("ru-RU")}`;
}

function notifyTelegramForNotification(note) {
  if (!shouldSendTelegramForPriority(note.priority)) return;
  sendTelegramMessage(formatNotificationForTelegram(note))
    .then(() => {
      if (state.settings?.telegram) {
        state.settings.telegram.lastError = null;
        saveState();
      }
    })
    .catch((e) => {
      console.warn("Ошибка Telegram уведомления:", e.message);
      if (state.settings?.telegram) {
        state.settings.telegram.lastError = e.message;
        saveState();
      }
    });
}

function readCpuTempC() {
  const candidates = ["/sys/class/thermal/thermal_zone0/temp", "/sys/class/hwmon/hwmon0/temp1_input"];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = Number(String(fs.readFileSync(file, "utf8")).trim());
      if (Number.isFinite(raw)) return raw > 1000 ? Math.round(raw / 100) / 10 : raw;
    } catch (_) {}
  }
  return null;
}

function readDiskInfo() {
  try {
    const out = execSync(`df -k ${__dirname}`, { encoding: "utf8", timeout: 1000 }).trim().split(/\n/);
    const row = out[out.length - 1].split(/\s+/);
    const sizeKb = Number(row[1] || 0);
    const usedKb = Number(row[2] || 0);
    const availableKb = Number(row[3] || 0);
    return {
      filesystem: row[0] || "",
      sizeGb: Math.round((sizeKb / 1024 / 1024) * 10) / 10,
      usedGb: Math.round((usedKb / 1024 / 1024) * 10) / 10,
      availableGb: Math.round((availableKb / 1024 / 1024) * 10) / 10,
      usePercent: row[4] || "",
      mount: row[5] || ""
    };
  } catch (e) {
    return { error: e.message };
  }
}

function systemStatus() {
  reconcileDeviceStates();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  return {
    name: state.settings?.system?.name || "NanoPi",
    location: state.settings?.system?.location || "Дом",
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    backend: { online: true, port: PORT, uptimeSeconds: Math.floor(process.uptime()), startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() },
    nanopi: {
      uptimeSeconds: Math.floor(os.uptime()),
      loadavg: os.loadavg(),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "unknown",
      cpuTempC: readCpuTempC(),
      memory: {
        totalMb: Math.round(memTotal / 1024 / 1024),
        usedMb: Math.round(memUsed / 1024 / 1024),
        freeMb: Math.round(memFree / 1024 / 1024),
        usedPercent: Math.round((memUsed / memTotal) * 100)
      },
      disk: readDiskInfo()
    },
    paths: { statePath: STATE_PATH, sensorsPath: SENSORS_PATH },
    summary: summarizeHomeState(),
    now: nowIso()
  };
}

function trimCollections() {
  state.eventLog = state.eventLog.slice(0, MAX_EVENT_LOG);
  state.notifications = state.notifications.slice(0, MAX_NOTIFICATIONS);
}

function logEvent({ type, title, text, priority = "info", source = "system", payload = null }) {
  state.eventLog.unshift({
    id: nextId("evt"),
    type,
    title,
    text,
    priority,
    source,
    payload,
    createdAt: nowIso()
  });
  trimCollections();
}

function createNotification({ title, text, priority = "info", source = "system", sticky = false, payload = null }) {
  const note = {
    id: nextId("note"),
    title,
    text,
    priority,
    source,
    sticky: sticky || priority === "critical",
    payload,
    acknowledgedAt: null,
    createdAt: nowIso()
  };
  state.notifications.unshift(note);
  trimCollections();
  notifyTelegramForNotification(note);
  return note;
}

function updateLeakTimes() {
  if (state.leakSensor === "leak" && !state.lastLeak) state.lastLeak = nowIso();
  if (state.leakSensor !== "leak") state.lastLeak = null;

  if (state.washingMachineSensor === "leak" && !state.lastLeakWashing) state.lastLeakWashing = nowIso();
  if (state.washingMachineSensor !== "leak") state.lastLeakWashing = null;

  if (state.dishwasherSensor === "leak" && !state.lastLeakDishwasher) state.lastLeakDishwasher = nowIso();
  if (state.dishwasherSensor !== "leak") state.lastLeakDishwasher = null;

  if (state.kitchenSensor === "leak" && !state.lastLeakKitchen) state.lastLeakKitchen = nowIso();
  if (state.kitchenSensor !== "leak") state.lastLeakKitchen = null;
}

function effectiveDeviceStatus(device) {
  if (!device?.lastSeenAt) return "unknown";
  const timeoutMs = Number(device?.timeoutMs || DEVICE_TIMEOUT_MS);
  return Date.now() - new Date(device.lastSeenAt).getTime() <= timeoutMs ? "online" : "offline";
}

function touchDevice(deviceId, patch = {}) {
  const current = state.devices[deviceId] || {
    id: deviceId,
    name: patch.name || deviceId,
    source: patch.source || "sensor",
    createdAt: nowIso(),
    status: "online"
  };

  const updated = {
    ...current,
    ...patch,
    id: deviceId,
    lastSeenAt: nowIso(),
    status: "online"
  };

  state.devices[deviceId] = updated;
  return updated;
}

function reconcileDeviceStates() {
  let changed = false;
  Object.values(state.devices).forEach(device => {
    const nextStatus = effectiveDeviceStatus(device);
    if (device.status !== nextStatus) {
      device.status = nextStatus;
      changed = true;
      logEvent({
        type: "device",
        title: nextStatus === "offline" ? "Устройство недоступно" : "Устройство снова в сети",
        text: `${device.name || device.id}: ${nextStatus === "offline" ? "heartbeat пропал" : "связь восстановлена"}`,
        priority: nextStatus === "offline" ? "warning" : "info",
        source: device.id,
        payload: { deviceId: device.id, status: nextStatus }
      });

      if (isRuleEnabled("device-offline-warning")) {
        createNotification({
          title: nextStatus === "offline" ? "Устройство недоступно" : "Устройство снова в сети",
          text: `${device.name || device.id}: ${nextStatus === "offline" ? "heartbeat не поступает" : "heartbeat восстановлен"}`,
          priority: nextStatus === "offline" ? "warning" : "info",
          source: device.id,
          sticky: nextStatus === "offline",
          payload: { deviceId: device.id, status: nextStatus }
        });
      }
    }
  });

  if (changed) saveState();
}

function compactWashingPayload(body) {
  return {
    device: typeof body.device === "string" ? body.device : undefined,
    seq: typeof body.seq === "number" ? body.seq : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    alarm: typeof body.alarm === "boolean" ? body.alarm : undefined,
    rain: typeof body.rain === "boolean" ? body.rain : undefined,
    ao: typeof body.ao === "number" ? body.ao : undefined,
    reset_closed: typeof body.reset_closed === "boolean" ? body.reset_closed : undefined
  };
}

function resolveWashingStatus(body) {
  if (typeof body?.status === "string" && VALID_LEAK_STATUSES.has(body.status)) {
    return body.status;
  }
  if (typeof body?.alarm === "boolean") {
    return body.alarm ? "leak" : "dry";
  }
  if (typeof body?.rain === "boolean") {
    return body.rain ? "leak" : "dry";
  }
  return null;
}

function getSensorComputedState(sensor) {
  const saved = state.sensorStates?.[sensor.id] || {};
  const legacyLastKey = lastLeakKeyByLegacyKey(sensor.legacyKey);
  const legacyStatus = sensor.legacyKey ? state[sensor.legacyKey] : undefined;
  const legacyLastTriggerAt = legacyLastKey ? state[legacyLastKey] : null;

  return {
    sensorId: sensor.id,
    status: saved.status || legacyStatus || "unknown",
    lastTriggerAt: saved.lastTriggerAt ?? legacyLastTriggerAt ?? null,
    lastSeenAt: saved.lastSeenAt || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastSeenAt || null : null),
    lastPayload: saved.lastPayload || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastPayload || null : null),
    resetVersion: Number.isFinite(saved.resetVersion) ? saved.resetVersion : (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineResetVersion || 0 : 0),
    lastResetAt: saved.lastResetAt || (sensor.legacyKey === "washingMachineSensor" ? state.washingMachineLastResetAt || null : null),
    maintenanceUntil: saved.maintenanceUntil || null,
    maintenanceReason: saved.maintenanceReason || "",
    maintenanceActive: isSensorInMaintenance(saved),
    deviceStatus: sensor.deviceId && state.devices[sensor.deviceId] ? effectiveDeviceStatus(state.devices[sensor.deviceId]) : "unknown"
  };
}

function applySensorState(sensor, status, payload = {}) {
  const previous = getSensorComputedState(sensor);
  const current = state.sensorStates[sensor.id] || {};
  const nextState = {
    status,
    lastTriggerAt: status === "leak" ? (current.lastTriggerAt || nowIso()) : null,
    lastSeenAt: nowIso(),
    lastPayload: payload,
    resetVersion: current.resetVersion || 0,
    lastResetAt: current.lastResetAt || null,
    maintenanceUntil: current.maintenanceUntil || null,
    maintenanceReason: current.maintenanceReason || ""
  };

  state.sensorStates[sensor.id] = nextState;
  mirrorLegacySensorState(sensor, nextState);
  updateLeakTimes();

  if (sensor.deviceId) {
    touchDevice(sensor.deviceId, {
      name: sensor.name,
      source: "arduino",
      meta: payload
    });
  }

  const maintenanceActive = isSensorInMaintenance(nextState);

  logEvent({
    type: "sensor",
    title: `Датчик: ${sensor.name}`,
    text: maintenanceActive && status === "leak" ? `Статус: ${status} (режим обслуживания)` : `Статус: ${status}`,
    priority: status === "leak" ? (maintenanceActive ? "info" : "warning") : "info",
    source: sensor.deviceId || sensor.id,
    payload: { sensorId: sensor.id, status, maintenanceActive, payload }
  });

  if (previous.status !== "leak" && status === "leak") {
    if (maintenanceActive) {
      createNotification({
        title: `Протечка в обслуживании: ${sensor.name}`,
        text: `${sensor.location || sensor.name}: вода обнаружена, но датчик временно в режиме обслуживания`,
        priority: "info",
        source: sensor.deviceId || sensor.id,
        sticky: false,
        payload: { sensorId: sensor.id, maintenanceActive: true }
      });
    } else {
      createNotification({
        title: `Протечка: ${sensor.name}`,
        text: `${sensor.location || sensor.name}: обнаружена вода`,
        priority: sensor.resettable ? "critical" : "warning",
        source: sensor.deviceId || sensor.id,
        sticky: true,
        payload: { sensorId: sensor.id }
      });
    }
  }

  if (previous.status === "leak" && status === "dry") {
    createNotification({
      title: `Тревога снята: ${sensor.name}`,
      text: `${sensor.location || sensor.name}: состояние вернулось в норму`,
      priority: "info",
      source: sensor.deviceId || sensor.id,
      payload: { sensorId: sensor.id }
    });
  }

  saveState();
  return getSensorComputedState(sensor);
}

function resetRegisteredSensor(sensor) {
  const current = state.sensorStates[sensor.id] || {};
  const nextState = {
    ...current,
    status: "dry",
    lastTriggerAt: null,
    lastResetAt: nowIso(),
    lastSeenAt: current.lastSeenAt || nowIso(),
    resetVersion: (current.resetVersion || 0) + 1,
    maintenanceUntil: current.maintenanceUntil || null,
    maintenanceReason: current.maintenanceReason || ""
  };

  state.sensorStates[sensor.id] = nextState;
  mirrorLegacySensorState(sensor, nextState);
  updateLeakTimes();

  logEvent({
    type: "sensor",
    title: `Сброс тревоги: ${sensor.name}`,
    text: "Сервер запросил удалённый сброс тревоги",
    priority: "info",
    source: "ui",
    payload: { sensorId: sensor.id }
  });
  saveState();
  return getSensorComputedState(sensor);
}

function summarizeHomeState() {
  ensureSensorRegistryState();
  const devices = Object.values(state.devices || {});
  const onlineDevices = devices.filter(d => effectiveDeviceStatus(d) === "online").length;
  const offlineDevices = devices.filter(d => effectiveDeviceStatus(d) === "offline").length;
  const sensorItems = (state.sensorRegistry || []).filter(sensor => sensor.isActive !== false);
  const activeLeakItems = sensorItems
    .map(sensor => ({ sensor, state: getSensorComputedState(sensor) }))
    .filter(item => item.state.status === "leak");
  const unreadCritical = state.notifications.filter(note => !note.acknowledgedAt && note.priority === "critical").length;
  const unreadWarning = state.notifications.filter(note => !note.acknowledgedAt && note.priority === "warning").length;
  const overallStatus = activeLeakItems.length > 0 || unreadCritical > 0
    ? "critical"
    : (offlineDevices > 0 || unreadWarning > 0 ? "warning" : "normal");

  return {
    overallStatus,
    activeScenarioId: state.scenarios?.activeScenarioId || null,
    onlineDevices,
    offlineDevices,
    totalDevices: devices.length,
    sensorsTotal: sensorItems.length,
    sensorsOk: sensorItems.filter(sensor => getSensorComputedState(sensor).status === "dry").length,
    sensorsUnknown: sensorItems.filter(sensor => getSensorComputedState(sensor).status === "unknown").length,
    activeLeaks: activeLeakItems.length,
    activeLeakSensors: activeLeakItems.map(item => ({
      id: item.sensor.id,
      name: item.sensor.name,
      location: item.sensor.location,
      deviceId: item.sensor.deviceId,
      lastTriggerAt: item.state.lastTriggerAt
    })),
    unreadNotifications: state.notifications.filter(note => !note.acknowledgedAt).length,
    unreadCritical,
    unreadWarning,
    eventsCount: state.eventLog.length,
    lastEvent: state.eventLog[0] || null
  };
}

function washingMachineResponse() {
  ensureSensorRegistryState();
  const sensor = findSensorByLegacyKey("washingMachineSensor");
  const computed = sensor ? getSensorComputedState(sensor) : {};
  updateLeakTimes();
  return {
    washingMachineSensor: computed.status || state.washingMachineSensor,
    lastLeakWashing: computed.lastTriggerAt || state.lastLeakWashing,
    washingMachineResetVersion: computed.resetVersion || 0,
    washingMachineLastResetAt: computed.lastResetAt || null,
    washingMachineLastSeenAt: computed.lastSeenAt || null,
    washingMachineLastPayload: computed.lastPayload || null
  };
}

function runRules({ previous }) {
  if (!previous) return;

  if (previous.washingMachineSensor !== "leak" && state.washingMachineSensor === "leak") {
    logEvent({
      type: "rule",
      title: "Сработало правило: протечка стиральной машины",
      text: "Датчик протечки стиральной машины перешёл в аварийный режим",
      priority: "critical",
      source: "rule:washing-machine-leak-critical"
    });

    if (isRuleEnabled("washing-machine-leak-critical")) {
      createNotification({
        title: "Критическая протечка",
        text: "Стиральная машина: обнаружена вода под датчиком",
        priority: "critical",
        source: "rule:washing-machine-leak-critical",
        sticky: true,
        payload: { sensor: "washing-machine" }
      });
    }
  }

  if (previous.washingMachineSensor === "leak" && state.washingMachineSensor === "dry") {
    logEvent({
      type: "rule",
      title: "Сработало правило: тревога снята",
      text: "Протечка у стиральной машины снята",
      priority: "info",
      source: "rule:washing-machine-leak-resolved"
    });

    if (isRuleEnabled("washing-machine-leak-resolved")) {
      createNotification({
        title: "Тревога снята",
        text: "Стиральная машина: аварийное состояние сброшено",
        priority: "info",
        source: "rule:washing-machine-leak-resolved"
      });
    }
  }
}

async function applyScenario(scenarioId, source = "ui") {
  const scenario = SCENARIOS.find(item => item.id === scenarioId);
  if (!scenario) return null;

  await scenario.apply();
  state.scenarios.activeScenarioId = scenario.id;
  state.scenarios.lastAppliedAt = nowIso();

  logEvent({
    type: "scenario",
    title: `Сценарий: ${scenario.name}`,
    text: scenario.description,
    priority: "info",
    source,
    payload: { scenarioId: scenario.id }
  });

  createNotification({
    title: `Активирован сценарий «${scenario.name}»`,
    text: scenario.description,
    priority: "info",
    source,
    payload: { scenarioId: scenario.id }
  });

  saveState();
  return scenario;
}


// ===== Zigbee / Zigbee2MQTT integration =====
const ZIGBEE_DEVICE_TIMEOUT_MS = Number(process.env.ZIGBEE_DEVICE_TIMEOUT_MS || 2 * 60 * 60 * 1000);
let zigbeeClient = null;
let zigbeeSaveTimer = null;

function ensureZigbeeState() {
  // ВАЖНО: нормализуем состояние НА МЕСТЕ и возвращаем ВСЕГДА один и тот же объект.
  // Раньше функция пересоздавала state.zigbee при каждом вызове, из-за чего ссылка z,
  // взятая в начале обработчика MQTT, устаревала после вложенного вызова (upsert),
  // и запись z.values[...]/z.lastSeenAt уходила в "осиротевший" объект — состояния
  // устройств (например action кнопки) терялись.
  if (!state.zigbee || typeof state.zigbee !== "object") {
    state.zigbee = defaultZigbeeState();
  }
  const z = state.zigbee;
  const defaults = defaultZigbeeState();
  for (const key of Object.keys(defaults)) {
    if (z[key] === undefined) z[key] = defaults[key];
  }
  if (!z.devices || typeof z.devices !== "object") z.devices = {};
  if (!z.values || typeof z.values !== "object") z.values = {};
  if (!Array.isArray(z.responses)) z.responses = [];
  return z;
}

function saveStateSoon() {
  if (zigbeeSaveTimer) return;
  zigbeeSaveTimer = setTimeout(() => {
    zigbeeSaveTimer = null;
    saveState();
  }, 350);
}

function parseMqttPayload(payload) {
  const raw = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload || "");
  if (!raw) return "";
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

function normalizeZigbeeFriendlyName(name) {
  return String(name || "").trim();
}

function getZigbeeBaseTopic() {
  return String(ensureZigbeeState().baseTopic || process.env.ZIGBEE_BASE_TOPIC || "zigbee2mqtt").replace(/^\/+|\/+$/g, "");
}

function zigbeeDeviceKey(device) {
  return normalizeZigbeeFriendlyName(device?.friendly_name || device?.friendlyName || device?.ieee_address || device?.ieeeAddress || device?.id);
}

function compactZigbeeDefinition(device) {
  const definition = device?.definition || {};
  return {
    model: definition.model || device?.model_id || device?.model || "",
    vendor: definition.vendor || device?.manufacturer || "",
    description: definition.description || "",
    exposes: Array.isArray(definition.exposes) ? definition.exposes : (Array.isArray(device?.exposes) ? device.exposes : [])
  };
}


const ZIGBEE_ACCESS_STATE = 1;
const ZIGBEE_ACCESS_SET = 2;
const ZIGBEE_ACCESS_GET = 4;

function zigbeeAccessFlags(access) {
  const value = Number(access || 0);
  return {
    published: (value & ZIGBEE_ACCESS_STATE) === ZIGBEE_ACCESS_STATE,
    writable: (value & ZIGBEE_ACCESS_SET) === ZIGBEE_ACCESS_SET,
    gettable: (value & ZIGBEE_ACCESS_GET) === ZIGBEE_ACCESS_GET,
    raw: value
  };
}

function zigbeeControlLabel(property, fallback) {
  const key = String(property || fallback || '').toLowerCase();
  const labels = {
    state: 'Питание',
    brightness: 'Яркость',
    color_temp: 'Температура цвета',
    color_temp_startup: 'Температура цвета при старте',
    position: 'Позиция',
    cover_position: 'Позиция шторы',
    motor_state: 'Состояние мотора',
    lock_state: 'Состояние замка',
    child_lock: 'Защита от детей',
    power_on_behavior: 'Поведение после питания',
    occupancy: 'Движение',
    contact: 'Контакт',
    water_leak: 'Протечка',
    smoke: 'Дым',
    gas: 'Газ',
    temperature: 'Температура',
    humidity: 'Влажность',
    battery: 'Батарея',
    linkquality: 'Качество связи',
    voltage: 'Напряжение',
    current: 'Ток',
    power: 'Мощность',
    energy: 'Энергия',
    action: 'Действие',
    mode: 'Режим',
    system_mode: 'Режим системы',
    preset: 'Пресет',
    local_temperature: 'Температура в комнате',
    occupied_heating_setpoint: 'Целевая температура',
    running_state: 'Работа',
    fan_mode: 'Режим вентилятора',
    valve_position: 'Положение клапана'
  };
  return labels[key] || fallback || property || 'Параметр';
}

function zigbeeControlKind(expose) {
  const type = String(expose?.type || '').toLowerCase();
  const property = String(expose?.property || expose?.name || '').toLowerCase();
  if (property === 'state') return 'switch';
  if (type === 'binary') return 'binary';
  if (type === 'numeric') return 'numeric';
  if (type === 'enum') return 'enum';
  if (type === 'text') return 'text';
  if (type === 'list') return 'list';
  if (type === 'composite') return 'composite';
  return type || 'unknown';
}

function buildZigbeeControlsFromExposes(exposes, parentPath = []) {
  if (!Array.isArray(exposes)) return [];
  const out = [];

  for (const expose of exposes) {
    if (!expose || typeof expose !== 'object') continue;
    const name = expose.name || expose.property || expose.type || 'feature';
    const pathItems = [...parentPath, String(name)];
    const nested = [];
    if (Array.isArray(expose.features)) nested.push(...expose.features);
    if (Array.isArray(expose.exposes)) nested.push(...expose.exposes);
    if (nested.length) out.push(...buildZigbeeControlsFromExposes(nested, pathItems));

    const property = expose.property || expose.name;
    const flags = zigbeeAccessFlags(expose.access);
    const readable = flags.published || flags.gettable || flags.writable;
    if (!property || !readable) continue;

    out.push({
      key: pathItems.join('.'),
      property,
      name: expose.name || property,
      label: zigbeeControlLabel(property, expose.label || expose.name || property),
      type: expose.type || 'unknown',
      kind: zigbeeControlKind(expose),
      access: flags.raw,
      readable: flags.published || flags.gettable,
      writable: flags.writable,
      gettable: flags.gettable,
      description: expose.description || '',
      unit: expose.unit || '',
      valueOn: expose.value_on,
      valueOff: expose.value_off,
      valueToggle: expose.value_toggle,
      values: Array.isArray(expose.values) ? expose.values : [],
      min: typeof expose.value_min === 'number' ? expose.value_min : null,
      max: typeof expose.value_max === 'number' ? expose.value_max : null,
      step: typeof expose.value_step === 'number' ? expose.value_step : null,
      endpoint: expose.endpoint || null,
      path: pathItems
    });
  }

  const seen = new Set();
  return out.filter((control) => {
    const id = `${control.property}:${control.kind}:${control.key}`;
    const propertyId = `${control.property}:${control.kind}`;
    if (seen.has(id) || seen.has(propertyId)) return false;
    seen.add(id);
    seen.add(propertyId);
    return true;
  });
}

const ZIGBEE_FALLBACK_WRITABLE_KEYS = new Set([
  'state',
  'brightness',
  'color_temp',
  'color_temp_startup',
  'position',
  'cover_position',
  'child_lock',
  'power_on_behavior',
  'system_mode',
  'preset',
  'occupied_heating_setpoint',
  'fan_mode',
  'mode'
]);

const ZIGBEE_FALLBACK_READONLY_KEYS = new Set([
  'linkquality',
  'temperature',
  'humidity',
  'battery',
  'voltage',
  'current',
  'power',
  'energy',
  'occupancy',
  'contact',
  'water_leak',
  'smoke',
  'gas',
  'action',
  'local_temperature',
  'running_state'
]);

function fallbackZigbeeControlFromStateKey(property, value) {
  if (!property || String(property).startsWith('_')) return null;
  const key = String(property).toLowerCase();
  const isWritable = ZIGBEE_FALLBACK_WRITABLE_KEYS.has(key) || key === 'state';
  const isReadOnly = ZIGBEE_FALLBACK_READONLY_KEYS.has(key) || !isWritable;

  if (key === 'state') {
    return {
      key: 'fallback.state',
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: 'binary',
      kind: 'switch',
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      description: 'Fallback-кнопки построены по текущему state, потому что Zigbee2MQTT не отдал exposes для этого метода.',
      unit: '',
      valueOn: 'ON',
      valueOff: 'OFF',
      valueToggle: 'TOGGLE',
      values: ['ON', 'OFF', 'TOGGLE'],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  if (key === 'power_on_behavior') {
    return {
      key: 'fallback.power_on_behavior',
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: 'enum',
      kind: 'enum',
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      description: 'Поведение устройства после появления питания.',
      unit: '',
      values: ['off', 'on', 'toggle', 'previous'],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  const numericRanges = {
    brightness: { min: 0, max: 255, step: 1, unit: '' },
    color_temp: { min: 150, max: 500, step: 1, unit: '' },
    color_temp_startup: { min: 150, max: 500, step: 1, unit: '' },
    position: { min: 0, max: 100, step: 1, unit: '%' },
    cover_position: { min: 0, max: 100, step: 1, unit: '%' },
    occupied_heating_setpoint: { min: 5, max: 35, step: 0.5, unit: '°C' }
  };

  if (numericRanges[key] || typeof value === 'number') {
    const range = numericRanges[key] || { min: 0, max: 100, step: 1, unit: '' };
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: 'numeric',
      kind: 'numeric',
      access: isWritable ? 3 : 1,
      readable: true,
      writable: isWritable,
      gettable: false,
      description: '',
      unit: range.unit || '',
      values: [],
      min: range.min,
      max: range.max,
      step: range.step,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  if (typeof value === 'boolean') {
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: 'binary',
      kind: 'binary',
      access: isWritable ? 3 : 1,
      readable: true,
      writable: isWritable,
      gettable: false,
      description: '',
      unit: '',
      valueOn: true,
      valueOff: false,
      values: [true, false],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  const enumValues = {
    child_lock: ['LOCK', 'UNLOCK'],
    system_mode: ['off', 'heat', 'cool', 'auto'],
    preset: ['manual', 'schedule', 'eco', 'comfort', 'boost'],
    fan_mode: ['off', 'low', 'medium', 'high', 'auto'],
    mode: ['auto', 'manual', 'off']
  };

  if (enumValues[key] || (isWritable && typeof value === 'string')) {
    const values = enumValues[key] || Array.from(new Set([String(value), 'ON', 'OFF']));
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: 'enum',
      kind: 'enum',
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      description: '',
      unit: '',
      values,
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  if (isReadOnly) {
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: zigbeeControlLabel(property, property),
      type: typeof value === 'string' ? 'text' : 'unknown',
      kind: 'text',
      access: 1,
      readable: true,
      writable: false,
      gettable: false,
      description: '',
      unit: '',
      values: [],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ['fallback', property]
    };
  }

  return null;
}

function buildZigbeeControlsFromState(state = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return [];
  return Object.entries(state)
    .map(([property, value]) => fallbackZigbeeControlFromStateKey(property, value))
    .filter(Boolean);
}

function mergeZigbeeControls(...groups) {
  const merged = [];
  const seen = new Set();
  groups.flat().forEach(control => {
    if (!control || !control.property) return;
    const id = `${control.property}:${control.kind}`;
    if (seen.has(id)) return;
    seen.add(id);
    merged.push(control);
  });
  return merged;
}

function zigbeeDeviceControls(device, runtimeState = {}) {
  return mergeZigbeeControls(
    buildZigbeeControlsFromExposes(device?.definition?.exposes || []),
    buildZigbeeControlsFromState(runtimeState)
  );
}

function upsertZigbeeDevice(device, patch = {}) {
  const z = ensureZigbeeState();
  const friendlyName = zigbeeDeviceKey(device || patch);
  if (!friendlyName) return null;
  const current = z.devices[friendlyName] || { friendlyName, createdAt: nowIso() };
  // Сообщения state/availability приходят как { friendly_name } без definition.
  // Нельзя позволять им затирать уже известные exposes/описание устройства —
  // иначе карточка теряет элементы управления при каждой публикации устройства.
  // Если на том же friendly_name появилось ДРУГОЕ физическое устройство (сменился ieee),
  // сбрасываем накопленную definition, чтобы старые exposes/описание не залипли навсегда.
  const incomingIeee = device?.ieee_address || device?.ieeeAddress || "";
  const identityChanged = !!(incomingIeee && current.ieeeAddress && incomingIeee !== current.ieeeAddress);
  const incomingDef = compactZigbeeDefinition(device || current);
  const currentDef = identityChanged ? {} : (current.definition || {});
  const definition = {
    model: incomingDef.model || currentDef.model || "",
    vendor: incomingDef.vendor || currentDef.vendor || "",
    description: incomingDef.description || currentDef.description || "",
    exposes: Array.isArray(incomingDef.exposes) && incomingDef.exposes.length
      ? incomingDef.exposes
      : (Array.isArray(currentDef.exposes) ? currentDef.exposes : [])
  };
  const next = {
    ...current,
    ...patch,
    friendlyName,
    ieeeAddress: device?.ieee_address || device?.ieeeAddress || patch.ieeeAddress || current.ieeeAddress || "",
    type: device?.type || patch.type || current.type || "EndDevice",
    manufacturer: device?.manufacturer || patch.manufacturer || current.manufacturer || definition.vendor || "",
    modelId: device?.model_id || patch.modelId || current.modelId || definition.model || "",
    powerSource: device?.power_source || patch.powerSource || current.powerSource || "",
    interviewCompleted: typeof device?.interview_completed === "boolean" ? device.interview_completed : (patch.interviewCompleted ?? current.interviewCompleted ?? null),
    supported: typeof device?.supported === "boolean" ? device.supported : (patch.supported ?? current.supported ?? null),
    definition,
    updatedAt: nowIso()
  };
  z.devices[friendlyName] = next;
  return next;
}

function getKnownZigbeeFriendlyNames() {
  return Object.keys(ensureZigbeeState().devices || {}).sort((a, b) => b.length - a.length);
}

function resolveFriendlyNameFromRelativeTopic(relativeTopic) {
  if (!relativeTopic) return "";
  for (const name of getKnownZigbeeFriendlyNames()) {
    if (relativeTopic === name || relativeTopic.startsWith(`${name}/`)) return name;
  }
  return relativeTopic.split("/")[0] || relativeTopic;
}

function extractAvailability(payload) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") return payload.state || payload.status || payload.availability || "unknown";
  return "unknown";
}

function looksLikeZigbeeStatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const ignored = new Set(["device", "endpoint", "linkquality"]);
  return Object.keys(payload).some(key => !ignored.has(key));
}

function recordZigbeeEventForHomeLog(friendlyName, payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.action) {
    logEvent({
      type: "zigbee",
      title: `Zigbee действие: ${friendlyName}`,
      text: String(payload.action),
      priority: "info",
      source: `zigbee:${friendlyName}`,
      payload
    });
    return;
  }
  if (payload.water_leak === true || payload.water_leak === "true") {
    createNotification({
      title: `Zigbee протечка: ${friendlyName}`,
      text: "Zigbee-датчик сообщил water_leak=true",
      priority: "critical",
      source: `zigbee:${friendlyName}`,
      sticky: true,
      payload
    });
    logEvent({ type: "zigbee", title: `Zigbee протечка: ${friendlyName}`, text: "water_leak=true", priority: "critical", source: `zigbee:${friendlyName}`, payload });
    return;
  }
  if (payload.contact === false || payload.occupancy === true || payload.smoke === true || payload.gas === true) {
    logEvent({
      type: "zigbee",
      title: `Zigbee событие: ${friendlyName}`,
      text: JSON.stringify(payload),
      priority: payload.smoke || payload.gas ? "critical" : "info",
      source: `zigbee:${friendlyName}`,
      payload
    });
  }
}

function handleZigbeeBridgeTopic(relativeTopic, payload) {
  const z = ensureZigbeeState();
  if (relativeTopic === "bridge/state") {
    z.bridgeState = typeof payload === "string" ? payload : (payload?.state || "unknown");
    z.lastSeenAt = nowIso();
    return;
  }

  if (relativeTopic === "bridge/devices" && Array.isArray(payload)) {
    payload.forEach(device => {
      const next = upsertZigbeeDevice(device);
      if (next && next.type !== "Coordinator") {
        touchDevice(`zigbee:${next.friendlyName}`, {
          name: next.friendlyName,
          source: "zigbee",
          timeoutMs: ZIGBEE_DEVICE_TIMEOUT_MS,
          meta: {
            ieeeAddress: next.ieeeAddress,
            modelId: next.modelId,
            manufacturer: next.manufacturer,
            powerSource: next.powerSource
          }
        });
      }
    });
    z.lastSeenAt = nowIso();
    return;
  }

  if (relativeTopic === "bridge/info") {
    z.bridgeInfo = payload && typeof payload === "object" ? payload : { raw: payload };
    if (payload?.config?.permit_join != null) z.permitJoin = !!payload.config.permit_join;
    z.lastSeenAt = nowIso();
    return;
  }

  if (relativeTopic === "bridge/response/permit_join") {
    z.responses.unshift({ topic: relativeTopic, payload, createdAt: nowIso() });
    z.responses = z.responses.slice(0, 20);
    if (payload?.status === "ok") {
      const time = Number(payload?.data?.time || 0);
      z.permitJoin = time > 0;
      z.permitJoinUntil = time > 0 ? new Date(Date.now() + time * 1000).toISOString() : null;
      z.lastError = null;
      logEvent({ type: "zigbee", title: z.permitJoin ? "Zigbee pairing открыт" : "Zigbee pairing закрыт", text: z.permitJoin ? `Новые устройства можно добавлять ${time} сек.` : "Добавление новых устройств выключено", priority: "info", source: "zigbee2mqtt", payload });
    } else if (payload?.status === "error") {
      z.lastError = payload.error || "Zigbee2MQTT request error";
      logEvent({ type: "zigbee", title: "Ошибка Zigbee2MQTT", text: z.lastError, priority: "warning", source: "zigbee2mqtt", payload });
    }
    return;
  }

  if (relativeTopic === "bridge/event" || relativeTopic.startsWith("bridge/event/")) {
    z.lastBridgeEvent = { topic: relativeTopic, payload, createdAt: nowIso() };
    const eventType = payload?.type || payload?.event || "event";
    if (["device_joined", "device_announce", "device_interview", "device_leave"].includes(eventType)) {
      logEvent({ type: "zigbee", title: `Zigbee: ${eventType}`, text: JSON.stringify(payload?.data || payload), priority: "info", source: "zigbee2mqtt", payload });
    }
    return;
  }

  if (relativeTopic.startsWith("bridge/response/")) {
    z.responses.unshift({ topic: relativeTopic, payload, createdAt: nowIso() });
    z.responses = z.responses.slice(0, 20);
    if (payload?.status === "error") z.lastError = payload.error || "Zigbee2MQTT response error";
  }
}

// Берём реальные value_on/value_off/value_toggle цели из её exposes — разные устройства
// используют разные значения (TS0001-кран принимает ON/OFF/TOGGLE, а не OPEN/CLOSE).
function resolveTargetStateValues(friendlyName) {
  const z = ensureZigbeeState();
  const exposes = z.devices?.[friendlyName]?.definition?.exposes || [];
  const result = { on: "ON", off: "OFF", toggle: "TOGGLE" };
  const visit = (arr) => {
    for (const e of arr || []) {
      if (!e || typeof e !== "object") continue;
      if ((e.property || e.name) === "state") {
        if (e.value_on != null) result.on = e.value_on;
        if (e.value_off != null) result.off = e.value_off;
        if (e.value_toggle != null) result.toggle = e.value_toggle;
      }
      if (Array.isArray(e.features)) visit(e.features);
      if (Array.isArray(e.exposes)) visit(e.exposes);
    }
  };
  visit(exposes);
  return result;
}

function linkCommandToPayload(command, targetFriendlyName) {
  const v = resolveTargetStateValues(targetFriendlyName);
  switch (String(command || "").toLowerCase()) {
    case "on": case "open": return { state: v.on };
    case "off": case "close": return { state: v.off };
    case "toggle":
    default: return { state: v.toggle };
  }
}

// Бинарные ключи датчиков, по смене которых срабатывают связки.
const LINK_BINARY_KEYS = ["occupancy", "presence", "contact", "water_leak", "smoke", "gas", "vibration", "tamper", "carbon_monoxide"];

// Связки устройств: по событию (action) источника выполняем команду на цели.
function runDeviceLinks(sourceFriendlyName, action) {
  const links = Array.isArray(state.deviceLinks) ? state.deviceLinks : [];
  for (const link of links) {
    if (!link || link.enabled === false) continue;
    if (link.source?.friendlyName !== sourceFriendlyName) continue;
    const token = String(action || "").toLowerCase();
    const wantAction = String(link.source?.action || "any").toLowerCase();
    // "any" совпадает только с событиями-нажатиями (без "="); токены датчиков (occupancy=true и т.п.) — точное совпадение.
    if (!(wantAction === token || (wantAction === "any" && !token.includes("=")))) continue;
    const target = link.target?.friendlyName;
    if (!target) continue;
    const payload = linkCommandToPayload(link.target?.command, target);
    // zigbeePublish бросает СИНХРОННО, если брокер отвалился — оборачиваем в промис,
    // чтобы исключение стало reject (попадёт в .catch), а цикл по связкам не прервался.
    Promise.resolve()
      .then(() => zigbeePublish(`${target}/set`, payload))
      .then(() => logEvent({
        type: "zigbee",
        title: `Связка сработала: ${link.name || sourceFriendlyName}`,
        text: `${sourceFriendlyName} (${action}) → ${target} ${JSON.stringify(payload)}`,
        priority: "info",
        source: `link:${link.id}`,
        payload: { linkId: link.id, target, payload }
      }))
      .catch((e) => logEvent({
        type: "zigbee",
        title: `Ошибка связки: ${link.name || sourceFriendlyName}`,
        text: e.message || String(e),
        priority: "warning",
        source: `link:${link.id}`,
        payload: { linkId: link.id, target }
      }));
  }
}

// Шумные/непрерывные ключи — по ним НЕ оповещаем (иначе спам).
const ZIGBEE_NOISY_KEYS = new Set([
  "linkquality", "voltage", "battery", "energy", "power", "current",
  "temperature", "humidity", "update", "update_available", "last_seen", "elapsed", "illuminance", "illuminance_lux"
]);

const ZIGBEE_NOTIFY_LABELS = {
  state: "Состояние", contact: "Контакт", water_leak: "Протечка", occupancy: "Движение",
  smoke: "Дым", gas: "Газ", tamper: "Вскрытие", action: "Действие", lock_state: "Замок",
  alarm: "Тревога", presence: "Присутствие", vibration: "Вибрация", carbon_monoxide: "Угарный газ"
};

function describeZigbeeValue(key, value) {
  switch (key) {
    case "contact": return value ? "закрыто" : "ОТКРЫТО";
    case "water_leak": return value ? "⚠ ПРОТЕЧКА" : "сухо";
    case "smoke": return value ? "⚠ ЗАДЫМЛЕНИЕ" : "норма";
    case "gas": return value ? "⚠ УТЕЧКА ГАЗА" : "норма";
    case "carbon_monoxide": return value ? "⚠ УГАРНЫЙ ГАЗ" : "норма";
    case "occupancy": case "presence": return value ? "есть" : "нет";
    case "tamper": return value ? "⚠ вскрытие" : "ок";
    case "vibration": return value ? "⚠ вибрация" : "ок";
    case "state": {
      const s = String(value).toLowerCase();
      if (["on", "open", "opened", "true"].includes(s)) return "включено/открыто";
      if (["off", "close", "closed", "false"].includes(s)) return "выключено/закрыто";
      return String(value);
    }
    default:
      if (typeof value === "boolean") return value ? "да" : "нет";
      return String(value);
  }
}

// Оповещение в Telegram о смене состояния подписанного устройства.
function handleZigbeeNotify(friendlyName, before, payload) {
  if (!state.zigbeeNotify || !state.zigbeeNotify[friendlyName]) return;
  const changes = [];
  for (const [key, value] of Object.entries(payload || {})) {
    if (key.startsWith("_") || ZIGBEE_NOISY_KEYS.has(key)) continue;
    if (value === "" || value == null) continue;
    const prev = before ? before[key] : undefined;
    if (prev === undefined) continue; // не оповещаем о самом первом значении
    if (JSON.stringify(prev) === JSON.stringify(value)) continue;
    changes.push(`${ZIGBEE_NOTIFY_LABELS[key] || key}: ${describeZigbeeValue(key, value)}`);
  }
  if (!changes.length) return;
  const z = ensureZigbeeState();
  const dev = z.devices?.[friendlyName];
  const name = String(dev?.definition?.description ? `${dev.definition.description} (${friendlyName})` : friendlyName).replace(/[<>]/g, "");
  const text = `🔔 <b>${name}</b>\nСмена состояния:\n${changes.join("\n").replace(/[<>]/g, "")}\nВремя: ${new Date().toLocaleString("ru-RU")}`;
  sendTelegramMessage(text, { force: true }).catch((e) => console.warn("Zigbee notify Telegram:", e.message));
}

function handleZigbeeMqttMessage(topic, payloadBuffer) {
  const z = ensureZigbeeState();
  const base = getZigbeeBaseTopic();
  if (topic !== base && !topic.startsWith(`${base}/`)) return;
  const relativeTopic = topic === base ? "" : topic.slice(base.length + 1);
  const payload = parseMqttPayload(payloadBuffer);

  try {
    if (relativeTopic.startsWith("bridge/")) {
      handleZigbeeBridgeTopic(relativeTopic, payload);
      saveStateSoon();
      return;
    }

    if (!relativeTopic || relativeTopic.endsWith("/set") || relativeTopic.endsWith("/get")) return;

    if (relativeTopic.endsWith("/availability")) {
      const friendlyName = relativeTopic.slice(0, -"/availability".length);
      const device = upsertZigbeeDevice({ friendly_name: friendlyName }, { availability: extractAvailability(payload), availabilityUpdatedAt: nowIso() });
      if (device) {
        touchDevice(`zigbee:${device.friendlyName}`, { name: device.friendlyName, source: "zigbee", timeoutMs: ZIGBEE_DEVICE_TIMEOUT_MS, meta: { availability: device.availability } });
      }
      saveStateSoon();
      return;
    }

    const friendlyName = resolveFriendlyNameFromRelativeTopic(relativeTopic);
    if (!friendlyName) return;

    upsertZigbeeDevice({ friendly_name: friendlyName }, { lastMessageAt: nowIso() });
    if (looksLikeZigbeeStatePayload(payload)) {
      const before = z.values[friendlyName];
      const merged = {
        ...(z.values[friendlyName] || {}),
        ...payload,
        _updatedAt: nowIso(),
        _topic: topic
      };
      // Кнопки/сцены (Aqara и пр.) шлют моментальное action/click и тут же сбрасывают
      // его в пусто — опрос раз в 3с почти всегда видит пустое. Запоминаем ПОСЛЕДНЕЕ
      // непустое событие отдельно, чтобы UI стабильно показывал его и время.
      const actionValue = payload.action ?? payload.click;
      if (actionValue != null && String(actionValue).trim() !== "") {
        merged._lastAction = String(actionValue);
        merged._lastActionAt = nowIso();
      }
      z.values[friendlyName] = merged;
      touchDevice(`zigbee:${friendlyName}`, { name: friendlyName, source: "zigbee", timeoutMs: ZIGBEE_DEVICE_TIMEOUT_MS, meta: payload });
      recordZigbeeEventForHomeLog(friendlyName, payload);
      handleZigbeeNotify(friendlyName, before, payload);
      if (actionValue != null && String(actionValue).trim() !== "") {
        runDeviceLinks(friendlyName, String(actionValue));
      }
      // Триггеры связок по смене состояния датчиков (движение/контакт/протечка и т.п.)
      for (const key of LINK_BINARY_KEYS) {
        if (!(key in payload)) continue;
        const v = payload[key];
        if (typeof v !== "boolean") continue;
        const prev = before ? before[key] : undefined;
        if (prev === v) continue;
        runDeviceLinks(friendlyName, `${key}=${v}`);
      }
      if ("state" in payload && before && before.state !== undefined) {
        const onNow = ["on", "open", "opened", "true", "1"].includes(String(payload.state).toLowerCase());
        const onPrev = ["on", "open", "opened", "true", "1"].includes(String(before.state).toLowerCase());
        if (onNow !== onPrev) runDeviceLinks(friendlyName, `state=${onNow ? "on" : "off"}`);
      }
    }
    z.lastSeenAt = nowIso();
    saveStateSoon();
  } catch (e) {
    z.lastError = e.message || String(e);
    console.warn("Zigbee MQTT parse error:", e.message);
    saveStateSoon();
  }
}

function connectZigbeeMqtt() {
  const z = ensureZigbeeState();
  if (!z.enabled || process.env.ZIGBEE_DISABLED === "1") {
    z.lastError = "Zigbee integration disabled by ZIGBEE_DISABLED=1";
    return;
  }
  if (!mqtt) {
    z.lastError = "Node package mqtt is not installed";
    return;
  }
  if (zigbeeClient) return;

  const mqttUrl = z.mqttUrl || process.env.ZIGBEE_MQTT_URL || "mqtt://127.0.0.1:1883";
  const base = getZigbeeBaseTopic();
  zigbeeClient = mqtt.connect(mqttUrl, {
    clientId: `pokrovka-api-${process.pid}-${Math.random().toString(16).slice(2)}`,
    reconnectPeriod: 5000,
    connectTimeout: 8000,
    keepalive: 45,
    clean: true
  });

  zigbeeClient.on("connect", () => {
    const stateRef = ensureZigbeeState();
    stateRef.lastError = null;
    stateRef.mqttConnected = true;
    stateRef.mqttUrl = mqttUrl;
    stateRef.baseTopic = base;
    stateRef.lastSeenAt = nowIso();
    zigbeeClient.subscribe(`${base}/#`, (err) => {
      if (err) {
        stateRef.lastError = err.message;
      } else {
        console.log(`Zigbee MQTT subscribed: ${base}/#`);
      }
      saveStateSoon();
    });
  });

  zigbeeClient.on("reconnect", () => {
    const stateRef = ensureZigbeeState();
    stateRef.mqttConnected = false;
    stateRef.bridgeState = stateRef.bridgeState === "online" ? "unknown" : stateRef.bridgeState;
  });

  zigbeeClient.on("close", () => {
    const stateRef = ensureZigbeeState();
    stateRef.mqttConnected = false;
    saveStateSoon();
  });

  zigbeeClient.on("error", (err) => {
    const stateRef = ensureZigbeeState();
    stateRef.lastError = err.message || String(err);
    stateRef.mqttConnected = false;
    console.warn("Zigbee MQTT error:", stateRef.lastError);
    saveStateSoon();
  });

  zigbeeClient.on("message", handleZigbeeMqttMessage);
}

function zigbeePublish(relativeTopic, payload) {
  const z = ensureZigbeeState();
  if (!zigbeeClient || !zigbeeClient.connected) {
    throw new Error("MQTT broker is not connected");
  }
  const topic = `${getZigbeeBaseTopic()}/${relativeTopic.replace(/^\/+/, "")}`;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  return new Promise((resolve, reject) => {
    zigbeeClient.publish(topic, body, { qos: 0, retain: false }, (err) => {
      if (err) reject(err);
      else resolve({ topic, payload });
    });
  });
}

function zigbeeDeviceRuntimeStatus(device) {
  const last = device?.lastMessageAt || device?.availabilityUpdatedAt || device?.updatedAt;
  if (!last) return device?.availability || "unknown";
  if (device?.availability === "offline") return "offline";
  return Date.now() - new Date(last).getTime() <= ZIGBEE_DEVICE_TIMEOUT_MS ? "online" : "unknown";
}

function zigbeeStatusResponse() {
  const z = ensureZigbeeState();
  const devices = Object.values(z.devices || {})
    .map(device => ({
      ...device,
      state: z.values?.[device.friendlyName] || {},
      controls: zigbeeDeviceControls(device, z.values?.[device.friendlyName] || {}),
      effectiveStatus: zigbeeDeviceRuntimeStatus(device),
      notify: !!(state.zigbeeNotify && state.zigbeeNotify[device.friendlyName])
    }))
    .sort((a, b) => String(a.friendlyName || "").localeCompare(String(b.friendlyName || ""), "ru"));

  return {
    ok: true,
    enabled: z.enabled,
    mqttConnected: !!(zigbeeClient && zigbeeClient.connected),
    mqttUrl: z.mqttUrl,
    baseTopic: z.baseTopic,
    frontendUrl: z.frontendUrl,
    bridgeState: z.bridgeState || "unknown",
    permitJoin: !!z.permitJoin,
    permitJoinUntil: z.permitJoinUntil || null,
    lastSeenAt: z.lastSeenAt || null,
    lastError: z.lastError || null,
    lastBridgeEvent: z.lastBridgeEvent || null,
    bridgeInfo: z.bridgeInfo || null,
    devicesCount: devices.filter(d => d.type !== "Coordinator").length,
    onlineDevices: devices.filter(d => d.type !== "Coordinator" && d.effectiveStatus === "online").length,
    devices,
    responses: z.responses || []
  };
}

app.use(cors());
app.use(express.json());
loadState();
ensureSensorRegistryState();
saveState();
reconcileDeviceStates();
setInterval(reconcileDeviceStates, 10000);
connectZigbeeMqtt();

app.get("/api/home", (req, res) => {
  updateLeakTimes();
  res.json(state);
});

app.get("/api/system/summary", (req, res) => {
  reconcileDeviceStates();
  res.json(summarizeHomeState());
});

app.get("/api/system/status", (req, res) => {
  res.json(systemStatus());
});

app.get("/api/settings/telegram", (req, res) => {
  state.settings = state.settings || {};
  state.settings.telegram = { ...defaultTelegramSettings(), ...(state.settings.telegram || {}) };
  res.json(sanitizeTelegramSettings(state.settings.telegram));
});

app.put("/api/settings/telegram", (req, res) => {
  const current = { ...defaultTelegramSettings(), ...((state.settings || {}).telegram || {}) };
  const body = req.body || {};
  const next = {
    ...current,
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    chatId: typeof body.chatId === "string" ? body.chatId.trim() : current.chatId,
    sendCritical: typeof body.sendCritical === "boolean" ? body.sendCritical : current.sendCritical,
    sendWarning: typeof body.sendWarning === "boolean" ? body.sendWarning : current.sendWarning,
    sendInfo: typeof body.sendInfo === "boolean" ? body.sendInfo : current.sendInfo
  };
  if (typeof body.botToken === "string") {
    const token = body.botToken.trim();
    if (token) next.botToken = token;
    if (body.clearBotToken === true) next.botToken = "";
  }
  state.settings = state.settings || {};
  state.settings.telegram = next;
  saveState();
  logEvent({ type: "settings", title: "Настройки Telegram обновлены", text: next.enabled ? "Telegram-уведомления включены или изменены" : "Telegram-уведомления выключены", priority: "info", source: "ui" });
  res.json(sanitizeTelegramSettings(next));
});

app.post("/api/settings/telegram/test", async (req, res) => {
  try {
    const result = await sendTelegramMessage("✅ Тестовое сообщение от умного дома NanoPi", { force: true });
    if (result && result.skipped) {
      const msg = "Не заданы Bot Token или Chat ID";
      state.settings.telegram.lastError = msg;
      saveState();
      return res.status(400).json({ ok: false, error: msg, settings: sanitizeTelegramSettings(state.settings.telegram) });
    }
    state.settings.telegram.lastTestAt = nowIso();
    state.settings.telegram.lastError = null;
    saveState();
    res.json({ ok: true, settings: sanitizeTelegramSettings(state.settings.telegram) });
  } catch (e) {
    state.settings.telegram.lastError = e.message;
    saveState();
    res.status(502).json({ ok: false, error: e.message, settings: sanitizeTelegramSettings(state.settings.telegram) });
  }
});

app.get("/api/events", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  res.json(state.eventLog.slice(0, limit));
});

app.get("/api/notifications", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  res.json(state.notifications.slice(0, limit));
});

app.post("/api/notifications/:id/ack", (req, res) => {
  const note = state.notifications.find(item => item.id === req.params.id);
  if (!note) return res.status(404).json({ error: "Not found" });
  note.acknowledgedAt = nowIso();
  saveState();
  res.json({ ok: true, id: note.id, acknowledgedAt: note.acknowledgedAt });
});

app.get("/api/devices", (req, res) => {
  reconcileDeviceStates();
  const devices = Object.values(state.devices || {})
    .map(device => ({ ...device, effectiveStatus: effectiveDeviceStatus(device) }))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "ru"));
  res.json(devices);
});

app.post("/api/device/heartbeat", (req, res) => {
  const { deviceId, name, source, meta } = req.body || {};
  if (!deviceId || typeof deviceId !== "string") {
    return res.status(400).json({ error: "deviceId is required" });
  }
  const device = touchDevice(deviceId, { name: name || deviceId, source: source || "sensor", meta: meta || null });
  saveState();
  res.json({ ok: true, device });
});

app.get("/api/scenarios", (req, res) => {
  res.json({
    activeScenarioId: state.scenarios.activeScenarioId || null,
    items: SCENARIOS.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      active: state.scenarios.activeScenarioId === item.id
    }))
  });
});

app.post("/api/scenarios/apply", async (req, res) => {
  const { scenarioId } = req.body || {};
  const scenario = await applyScenario(scenarioId, "ui");
  if (!scenario) return res.status(400).json({ error: "Unknown scenario" });
  res.json({ ok: true, activeScenarioId: state.scenarios.activeScenarioId, scenarioId: scenario.id });
});

app.get("/api/rules", (req, res) => {
  res.json(state.rules);
});

app.post("/api/rules/:id/toggle", (req, res) => {
  const rule = state.rules.find(item => item.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "Rule not found" });
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be boolean" });
  }
  rule.enabled = req.body.enabled;
  saveState();
  logEvent({
    type: "rule",
    title: `Правило ${rule.enabled ? "включено" : "выключено"}`,
    text: rule.name,
    priority: "info",
    source: "ui",
    payload: { ruleId: rule.id, enabled: rule.enabled }
  });
  res.json(rule);
});

[
  { sensor: "bathroom", key: "leakSensor", lastKey: "lastLeak" },
  { sensor: "dishwasher", key: "dishwasherSensor", lastKey: "lastLeakDishwasher" },
  { sensor: "kitchen", key: "kitchenSensor", lastKey: "lastLeakKitchen" }
].forEach(({ sensor, key, lastKey }) => {
  app.get(`/api/${sensor}`, (req, res) => {
    updateLeakTimes();
    const registrySensor = findSensorByLegacyKey(key);
    const computed = registrySensor ? getSensorComputedState(registrySensor) : null;
    res.json({
      [key]: computed?.status || state[key],
      [lastKey]: computed?.lastTriggerAt || state[lastKey]
    });
  });

  app.post(`/api/${sensor}`, (req, res) => {
    const { status } = req.body || {};
    if (!VALID_LEAK_STATUSES.has(status)) {
      return res.status(400).json({ error: "Bad status" });
    }

    const previous = { ...state };
    const registrySensor = findSensorByLegacyKey(key);
    if (registrySensor) {
      const computed = applySensorState(registrySensor, status, { source: `legacy:/api/${sensor}`, ...req.body });
      runRules({ previous });
      return res.json({ [key]: computed.status, [lastKey]: computed.lastTriggerAt });
    }

    state[key] = status;
    updateLeakTimes();
    logEvent({
      type: "sensor",
      title: `Состояние датчика: ${SENSOR_LABELS[key]}`,
      text: `Статус изменён на ${status}`,
      priority: status === "leak" ? "warning" : "info",
      source: sensor,
      payload: { sensor, status }
    });
    saveState();
    runRules({ previous });
    res.json({ [key]: state[key], [lastKey]: state[lastKey] });
  });
});

app.get("/api/washing-machine", (req, res) => {
  res.json(washingMachineResponse());
});

app.post("/api/washing-machine", (req, res) => {
  const status = resolveWashingStatus(req.body || {});
  if (!status) {
    return res.status(400).json({ error: "Bad payload" });
  }

  const previous = { ...state };
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : (typeof req.body?.device === "string" ? req.body.device : "washing-machine-leak-uno");
  const sensor = findSensorByDeviceId(deviceId) || findSensorByLegacyKey("washingMachineSensor");
  if (!sensor) return res.status(404).json({ error: "Washing machine sensor binding not found" });

  sensor.ip = String(req.body?.ip || sensor.ip || "").trim();
  sensor.mac = String(req.body?.mac || sensor.mac || "").trim();
  sensor.firmwareVersion = String(req.body?.firmwareVersion || sensor.firmwareVersion || "").trim();

  const result = applySensorState(sensor, status, compactWashingPayload(req.body || {}));
  saveState();
  runRules({ previous });
  saveState();
  res.json({ ...washingMachineResponse(), state: result });
});

app.get("/api/washing-machine/command", (req, res) => {
  const sensor = findSensorByLegacyKey("washingMachineSensor");
  const computed = sensor ? getSensorComputedState(sensor) : {};
  res.json({
    resetVersion: computed.resetVersion || 0,
    lastResetAt: computed.lastResetAt || null,
    washingMachineSensor: computed.status || state.washingMachineSensor
  });
});

app.post("/api/washing-machine/reset", (req, res) => {
  const previous = { ...state };
  const sensor = findSensorByLegacyKey("washingMachineSensor");
  if (!sensor) return res.status(404).json({ error: "Washing machine sensor not found" });
  const computed = resetRegisteredSensor(sensor);
  runRules({ previous });
  saveState();

  res.json({
    ok: true,
    washingMachineSensor: computed.status,
    lastLeakWashing: computed.lastTriggerAt,
    washingMachineResetVersion: computed.resetVersion,
    washingMachineLastResetAt: computed.lastResetAt
  });
});

["kitchen", "room", "holl"].forEach(zone => {
  app.get(`/api/blinds/${zone}`, (req, res) => {
    res.json({ position: state.blinds[zone] });
  });

  app.post(`/api/blinds/${zone}`, (req, res) => {
    let { position } = req.body;
    if (typeof position !== "number" || position < 0 || position > 100) {
      return res.status(400).json({ error: "Bad position" });
    }
    state.blinds[zone] = Math.round(position);
    saveState();
    res.json({ position: state.blinds[zone] });
  });
});

app.get("/api/light/slider", (req, res) => {
  res.json({ brightness: state.light.brightness });
});

app.post("/api/light/slider", async (req, res) => {
  const { brightness } = req.body;
  if (typeof brightness !== "number" || brightness < 0 || brightness > 100) {
    return res.status(400).json({ error: "Bad brightness" });
  }
  state.light.brightness = brightness;
  saveState();
  const arduinoResp = await sendToArduino(`brightness?val=${brightness}`);
  if (arduinoResp === null) {
    return res.status(502).json({ error: "Не удалось связаться с Arduino" });
  }
  res.json({ brightness: state.light.brightness });
});

app.post("/api/light/color", async (req, res) => {
  const { r, g, b } = req.body;
  if (
    typeof r !== "number" || r < 0 || r > 255 ||
    typeof g !== "number" || g < 0 || g > 255 ||
    typeof b !== "number" || b < 0 || b > 255
  ) {
    return res.status(400).json({ error: "Bad color" });
  }
  const arduinoResp = await sendToArduino(`color?r=${r}&g=${g}&b=${b}`);
  if (arduinoResp === null) {
    return res.status(502).json({ error: "Не удалось связаться с Arduino" });
  }
  res.json({ r, g, b });
});

const EFFECT_MAP = {
  off: "off",
  on: "on",
  fire: "fire",
  firebounce: "firebounce",
  default: "default",
  fade: "fade",
  relay: "relay"
};

app.get("/api/light/effects", (req, res) => {
  res.json({ effect: state.light.effect });
});

app.post("/api/light/effects", async (req, res) => {
  const { effect } = req.body;
  if (!(effect in EFFECT_MAP)) {
    return res.status(400).json({ error: "Bad effect" });
  }

  state.light.effect = effect;
  saveState();
  const arduinoResp = await sendToArduino(EFFECT_MAP[effect]);
  if (arduinoResp === null) {
    return res.status(502).json({ error: "Не удалось связаться с Arduino" });
  }
  res.json({ effect: state.light.effect });
});

["living", "bath"].forEach(room => {
  app.get(`/api/floor/${room}`, (req, res) => {
    res.json(state.floor[room]);
  });

  app.post(`/api/floor/${room}`, (req, res) => {
    const { on, temp } = req.body;
    if (typeof on !== "boolean" || typeof temp !== "number") {
      return res.status(400).json({ error: "Bad payload" });
    }
    state.floor[room] = { on, temp };
    saveState();
    res.json(state.floor[room]);
  });
});

app.post("/api/relay/send-multiple", async (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes) || !codes.every(c => typeof c === "object" && /^\d{6,26}$/.test(String(c.code)))) {
    return res.status(400).json({ error: "Invalid codes array" });
  }

  let results = [];
  for (const { code, tag, state: on } of codes) {
    const resp = await sendToArduino(`relay?code=${code}`);
    results.push({ code, tag, state: on, success: resp !== null });

    if (typeof tag === "string" && typeof on === "boolean") {
      state.relays = state.relays || {};
      state.relays[tag] = on;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  saveState();
  res.json({ sent: results });
});

app.get("/api/sensors", (req, res) => {
  ensureSensorRegistryState();
  const sensors = (state.sensorRegistry || [])
    .filter(sensor => sensor.isActive !== false)
    .map(sensor => ({
      ...sensor,
      state: getSensorComputedState(sensor),
      eventEndpoint: "/api/sensors/event",
      commandEndpoint: sensor.deviceId ? `/api/sensors/by-device/${encodeURIComponent(sensor.deviceId)}/command` : null,
      resetEndpoint: sensor.resettable ? `/api/sensors/${sensor.id}/reset` : null
    }));
  res.json(sensors);
});

app.post("/api/sensors", (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const deviceId = String(body.deviceId || "").trim();
  if (!name || !deviceId) {
    return res.status(400).json({ error: "name and deviceId are required" });
  }
  if ((state.sensorRegistry || []).some(sensor => sensor.deviceId === deviceId && sensor.isActive !== false)) {
    return res.status(400).json({ error: "deviceId already exists" });
  }

  const sensor = {
    id: nextId("sensor"),
    name,
    location: String(body.location || "").trim() || name,
    type: String(body.type || "leak"),
    icon: String(body.icon || "drop"),
    deviceId,
    ip: String(body.ip || "").trim(),
    mac: String(body.mac || "").trim(),
    firmwareVersion: String(body.firmwareVersion || "").trim(),
    resettable: body.resettable !== false,
    isBuiltIn: false,
    legacyKey: null,
    createdAt: nowIso(),
    isActive: true
  };

  state.sensorRegistry.push(sensor);
  ensureSensorRegistryState();
  logEvent({
    type: "sensor-admin",
    title: "Добавлен новый датчик",
    text: `${sensor.name} (${sensor.deviceId})`,
    priority: "info",
    source: "ui",
    payload: { sensorId: sensor.id }
  });
  saveState();
  res.status(201).json({ ...sensor, state: getSensorComputedState(sensor) });
});

app.put("/api/sensors/:id", (req, res) => {
  const sensor = (state.sensorRegistry || []).find(item => item.id === req.params.id);
  if (!sensor) return res.status(404).json({ error: "Sensor not found" });

  const nextDeviceId = String(req.body?.deviceId || sensor.deviceId || "").trim();
  if ((state.sensorRegistry || []).some(item => item.id !== sensor.id && item.deviceId === nextDeviceId && item.isActive !== false)) {
    return res.status(400).json({ error: "deviceId already exists" });
  }

  sensor.name = String(req.body?.name || sensor.name).trim() || sensor.name;
  sensor.location = String(req.body?.location || sensor.location || sensor.name).trim() || sensor.location || sensor.name;
  sensor.deviceId = nextDeviceId || sensor.deviceId;
  sensor.icon = String(req.body?.icon || sensor.icon || "drop");
  sensor.ip = String(req.body?.ip ?? sensor.ip ?? "").trim();
  sensor.mac = String(req.body?.mac ?? sensor.mac ?? "").trim();
  sensor.firmwareVersion = String(req.body?.firmwareVersion ?? sensor.firmwareVersion ?? "").trim();
  sensor.resettable = typeof req.body?.resettable === "boolean" ? req.body.resettable : sensor.resettable;
  sensor.isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : sensor.isActive;
  saveState();
  res.json({ ...sensor, state: getSensorComputedState(sensor) });
});

app.delete("/api/sensors/:id", (req, res) => {
  const sensor = (state.sensorRegistry || []).find(item => item.id === req.params.id);
  if (!sensor) return res.status(404).json({ error: "Sensor not found" });
  if (sensor.isBuiltIn) {
    return res.status(400).json({ error: "Built-in sensor cannot be removed" });
  }
  sensor.isActive = false;
  saveState();
  res.json({ ok: true, id: sensor.id });
});

app.post("/api/sensors/event", (req, res) => {
  const deviceId = String(req.body?.deviceId || req.body?.device || "").trim();
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

  const sensor = (state.sensorRegistry || []).find(item => item.deviceId === deviceId && item.isActive !== false);
  if (!sensor) return res.status(404).json({ error: "Sensor binding not found" });

  const status = typeof req.body?.status === "string"
    ? req.body.status
    : (typeof req.body?.alarm === "boolean" ? (req.body.alarm ? "leak" : "dry") : (typeof req.body?.rain === "boolean" ? (req.body.rain ? "leak" : "dry") : null));

  if (!VALID_LEAK_STATUSES.has(status)) {
    return res.status(400).json({ error: "Bad status" });
  }

  sensor.ip = String(req.body?.ip || sensor.ip || "").trim();
  sensor.mac = String(req.body?.mac || sensor.mac || "").trim();
  sensor.firmwareVersion = String(req.body?.firmwareVersion || sensor.firmwareVersion || "").trim();

  const result = applySensorState(sensor, status, req.body || {});
  res.json({ ok: true, sensorId: sensor.id, state: result, sensor });
});

app.get("/api/sensors/by-device/:deviceId/command", (req, res) => {
  const sensor = (state.sensorRegistry || []).find(item => item.deviceId === req.params.deviceId && item.isActive !== false);
  if (!sensor) return res.status(404).json({ error: "Sensor binding not found" });
  const computed = getSensorComputedState(sensor);
  res.json({
    sensorId: sensor.id,
    resetVersion: computed.resetVersion || 0,
    lastResetAt: computed.lastResetAt || null,
    status: computed.status || "unknown"
  });
});

app.post("/api/sensors/:id/maintenance", (req, res) => {
  const sensor = (state.sensorRegistry || []).find(item => item.id === req.params.id && item.isActive !== false);
  if (!sensor) return res.status(404).json({ error: "Sensor not found" });
  const minutes = Number(req.body?.minutes || 0);
  const current = state.sensorStates[sensor.id] || {};
  if (!Number.isFinite(minutes) || minutes <= 0) {
    current.maintenanceUntil = null;
    current.maintenanceReason = "";
  } else {
    const safeMinutes = Math.min(Math.max(Math.round(minutes), 1), 24 * 60);
    current.maintenanceUntil = new Date(Date.now() + safeMinutes * 60 * 1000).toISOString();
    current.maintenanceReason = String(req.body?.reason || "Ручное обслуживание").trim();
  }
  state.sensorStates[sensor.id] = {
    status: current.status || getSensorComputedState(sensor).status || "unknown",
    lastTriggerAt: current.lastTriggerAt || null,
    lastSeenAt: current.lastSeenAt || null,
    lastPayload: current.lastPayload || null,
    resetVersion: current.resetVersion || 0,
    lastResetAt: current.lastResetAt || null,
    maintenanceUntil: current.maintenanceUntil || null,
    maintenanceReason: current.maintenanceReason || ""
  };
  logEvent({
    type: "sensor-maintenance",
    title: current.maintenanceUntil ? `Обслуживание: ${sensor.name}` : `Обслуживание выключено: ${sensor.name}`,
    text: current.maintenanceUntil ? `Тревоги приглушены до ${new Date(current.maintenanceUntil).toLocaleString("ru-RU")}` : "Датчик снова работает в штатном режиме",
    priority: "info",
    source: "ui",
    payload: { sensorId: sensor.id, maintenanceUntil: current.maintenanceUntil }
  });
  saveState();
  res.json({ ok: true, sensorId: sensor.id, state: getSensorComputedState(sensor) });
});

app.post("/api/sensors/:id/reset", (req, res) => {
  const sensor = (state.sensorRegistry || []).find(item => item.id === req.params.id && item.isActive !== false);
  if (!sensor) return res.status(404).json({ error: "Sensor not found" });
  if (!sensor.resettable) return res.status(400).json({ error: "Sensor is not resettable" });
  const result = resetRegisteredSensor(sensor);
  res.json({ ok: true, sensorId: sensor.id, state: result });
});



// ===== Zigbee API =====
app.get("/api/zigbee/status", (req, res) => {
  res.json(zigbeeStatusResponse());
});

app.post("/api/zigbee/permit-join", async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const secondsRaw = Number(req.body?.seconds || req.body?.time || 254);
    const seconds = enabled ? Math.min(Math.max(Math.round(secondsRaw || 254), 1), 254) : 0;
    const transaction = nextId("z2m_join");
    await zigbeePublish("bridge/request/permit_join", { time: seconds, transaction });
    const z = ensureZigbeeState();
    z.permitJoin = seconds > 0;
    z.permitJoinUntil = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
    saveState();
    res.json({ ok: true, permitJoin: z.permitJoin, permitJoinUntil: z.permitJoinUntil, transaction });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e), status: zigbeeStatusResponse() });
  }
});

app.post("/api/zigbee/bridge/restart", async (req, res) => {
  try {
    const transaction = nextId("z2m_restart");
    await zigbeePublish("bridge/request/restart", { transaction });
    res.json({ ok: true, transaction });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e), status: zigbeeStatusResponse() });
  }
});

app.post("/api/zigbee/bridge/health-check", async (req, res) => {
  try {
    const transaction = nextId("z2m_health");
    await zigbeePublish("bridge/request/health_check", { transaction });
    res.json({ ok: true, transaction });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e), status: zigbeeStatusResponse() });
  }
});


app.get("/api/zigbee/devices/:friendlyName/methods", (req, res) => {
  const friendlyName = decodeURIComponent(req.params.friendlyName || "");
  const z = ensureZigbeeState();
  const device = z.devices?.[friendlyName];
  if (!friendlyName || !device) return res.status(404).json({ ok: false, error: "Zigbee device not found" });
  const controls = zigbeeDeviceControls(device, z.values?.[friendlyName] || {});
  res.json({
    ok: true,
    friendlyName,
    topicSet: `${getZigbeeBaseTopic()}/${friendlyName}/set`,
    topicGet: `${getZigbeeBaseTopic()}/${friendlyName}/get`,
    state: z.values?.[friendlyName] || {},
    controls,
    writableControls: controls.filter(control => control.writable),
    readOnlyControls: controls.filter(control => !control.writable),
    exposes: device.definition?.exposes || []
  });
});

app.post("/api/zigbee/devices/:friendlyName/set", async (req, res) => {
  try {
    const friendlyName = decodeURIComponent(req.params.friendlyName || "");
    if (!friendlyName) return res.status(400).json({ ok: false, error: "friendlyName is required" });
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : (req.body || {});
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ ok: false, error: "JSON object payload is required" });
    }
    await zigbeePublish(`${friendlyName}/set`, payload);
    res.json({ ok: true, friendlyName, payload });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e), status: zigbeeStatusResponse() });
  }
});

app.post("/api/zigbee/devices/:friendlyName/get", async (req, res) => {
  try {
    const friendlyName = decodeURIComponent(req.params.friendlyName || "");
    if (!friendlyName) return res.status(400).json({ ok: false, error: "friendlyName is required" });
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : (req.body || {});
    await zigbeePublish(`${friendlyName}/get`, payload);
    res.json({ ok: true, friendlyName, payload });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e), status: zigbeeStatusResponse() });
  }
});

// ===== Связки устройств: событие источника -> команда на целевом устройстве =====
function nextLinkId() {
  return `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const LINK_COMMANDS = ["toggle", "on", "off", "open", "close"];

app.get("/api/zigbee/links", (req, res) => {
  res.json({ ok: true, links: Array.isArray(state.deviceLinks) ? state.deviceLinks : [] });
});

app.post("/api/zigbee/links", (req, res) => {
  const body = req.body || {};
  const source = body.source || {};
  const target = body.target || {};
  if (!source.friendlyName || !target.friendlyName) {
    return res.status(400).json({ ok: false, error: "source.friendlyName и target.friendlyName обязательны" });
  }
  // friendlyName уходит в MQTT-топик — запрещаем wildcard-символы.
  if (/[#+]/.test(String(source.friendlyName)) || /[#+]/.test(String(target.friendlyName))) {
    return res.status(400).json({ ok: false, error: "Недопустимые символы в имени устройства" });
  }
  const command = LINK_COMMANDS.includes(String(target.command || "").toLowerCase()) ? String(target.command).toLowerCase() : "toggle";
  const link = {
    id: nextLinkId(),
    enabled: body.enabled !== false,
    name: String(body.name || "").slice(0, 80) || `${source.friendlyName} → ${target.friendlyName}`,
    source: { friendlyName: String(source.friendlyName), action: String(source.action || "any") },
    target: { friendlyName: String(target.friendlyName), command },
    createdAt: nowIso()
  };
  if (!Array.isArray(state.deviceLinks)) state.deviceLinks = [];
  state.deviceLinks.push(link);
  saveState();
  res.json({ ok: true, link });
});

app.post("/api/zigbee/links/:id/toggle", (req, res) => {
  const link = (state.deviceLinks || []).find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Связка не найдена" });
  link.enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : !link.enabled;
  saveState();
  res.json({ ok: true, link });
});

app.post("/api/zigbee/links/:id/test", async (req, res) => {
  const link = (state.deviceLinks || []).find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Связка не найдена" });
  try {
    const payload = linkCommandToPayload(link.target?.command, link.target?.friendlyName);
    await zigbeePublish(`${link.target.friendlyName}/set`, payload);
    res.json({ ok: true, payload });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e) });
  }
});

app.delete("/api/zigbee/links/:id", (req, res) => {
  const before = (state.deviceLinks || []).length;
  state.deviceLinks = (state.deviceLinks || []).filter(l => l.id !== req.params.id);
  saveState();
  res.json({ ok: true, removed: before - state.deviceLinks.length });
});

// Подписка устройства на Telegram-оповещения о смене состояния.
app.post("/api/zigbee/devices/:friendlyName/notify", (req, res) => {
  const friendlyName = decodeURIComponent(req.params.friendlyName || "");
  if (!friendlyName) return res.status(400).json({ ok: false, error: "friendlyName is required" });
  if (!state.zigbeeNotify || typeof state.zigbeeNotify !== "object") state.zigbeeNotify = {};
  const enabled = !!(req.body && req.body.enabled);
  if (enabled) state.zigbeeNotify[friendlyName] = true;
  else delete state.zigbeeNotify[friendlyName];
  saveState();
  res.json({ ok: true, friendlyName, enabled: !!state.zigbeeNotify[friendlyName] });
});

// ===== Привязки карточек "Водоснабжение" (общие для всех клиентов) =====
app.get("/api/water-valves", (req, res) => {
  const config = (state.waterValves && typeof state.waterValves === "object") ? state.waterValves : {};
  res.json({ ok: true, config });
});

app.put("/api/water-valves", (req, res) => {
  const cfg = req.body?.config;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return res.status(400).json({ ok: false, error: "Ожидается объект config" });
  }
  const clean = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (!value || typeof value !== "object") continue;
    clean[String(key).slice(0, 40)] = {
      friendlyName: String(value.friendlyName || "").slice(0, 80),
      label: String(value.label || "").slice(0, 60),
    };
  }
  state.waterValves = clean;
  saveState();
  res.json({ ok: true, config: state.waterValves });
});

// ===== AmneziaWG VPN control =====
const AWG_INTERFACE = process.env.POKROVKA_AWG_INTERFACE || "awg0";
const AWG_CONFIG_PATH = process.env.POKROVKA_AWG_CONFIG || "/etc/amnezia/amneziawg/awg0.conf";
const AWG_IMPL = process.env.POKROVKA_AWG_IMPL || "/usr/local/bin/amneziawg-go";

function runExecFile(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: options.timeout || 10000, maxBuffer: 1024 * 1024, env: options.env || process.env }, (error, stdout = "", stderr = "") => {
      resolve({
        ok: !error,
        code: error && typeof error.code !== "undefined" ? error.code : 0,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
      });
    });
  });
}

// awg-quick запускает userspace-реализацию amneziawg-go через эту переменную окружения.
function awgEnv() {
  return { ...process.env, WG_QUICK_USERSPACE_IMPLEMENTATION: AWG_IMPL };
}

async function readVpnStatus() {
  const configured = fs.existsSync(AWG_CONFIG_PATH);
  const linkResult = await runExecFile("ip", ["link", "show", "dev", AWG_INTERFACE]);
  const addrResult = await runExecFile("ip", ["-4", "addr", "show", "dev", AWG_INTERFACE]);
  const showResult = await runExecFile("awg", ["show", AWG_INTERFACE], { env: awgEnv() });

  const addressMatch = addrResult.stdout.match(/inet\s+([^\s]+)/);
  const peerCount = (showResult.stdout.match(/peer:/g) || []).length;
  const linkUp = linkResult.ok;

  return {
    ok: true,
    interface: AWG_INTERFACE,
    configPath: AWG_CONFIG_PATH,
    configured,
    active: linkUp,
    linkUp,
    address: addressMatch ? addressMatch[1] : null,
    peerCount,
    message: configured ? "AmneziaWG настроен" : `Не найден конфиг ${AWG_CONFIG_PATH}`,
    diagnostics: {
      link: linkResult.stderr || linkResult.stdout,
      awg: showResult.stderr || showResult.stdout,
    },
  };
}

app.get("/api/vpn/status", async (req, res) => {
  try {
    res.json(await readVpnStatus());
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

app.post("/api/vpn/up", async (req, res) => {
  try {
    if (!fs.existsSync(AWG_CONFIG_PATH)) {
      return res.status(400).json({ ok: false, error: `Не найден конфиг ${AWG_CONFIG_PATH}` });
    }
    const result = await runExecFile("awg-quick", ["up", AWG_CONFIG_PATH], { timeout: 30000, env: awgEnv() });
    const status = await readVpnStatus();
    const ok = result.ok || status.active;
    res.status(ok ? 200 : 500).json({
      ok,
      action: "up",
      error: ok ? null : (result.stderr || result.stdout || "Не удалось поднять VPN"),
      status,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

app.post("/api/vpn/down", async (req, res) => {
  try {
    const result = await runExecFile("awg-quick", ["down", AWG_CONFIG_PATH], { timeout: 30000, env: awgEnv() });
    const status = await readVpnStatus();
    const ok = result.ok || !status.active;
    res.status(ok ? 200 : 500).json({
      ok,
      action: "down",
      error: ok ? null : (result.stderr || result.stdout || "Не удалось выключить VPN"),
      status,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

// ===== Прокси погоды (open-meteo) — внешние запросы идут с бэкенда, web ходит сюда =====
const WEATHER_CACHE = new Map();
const WEATHER_INFLIGHT = new Map();
function rawQuery(req) {
  const i = req.url.indexOf("?");
  return i >= 0 ? req.url.slice(i + 1) : "";
}
function fetchWeatherUpstream(key) {
  // дедуп параллельных запросов одного ключа
  if (WEATHER_INFLIGHT.has(key)) return WEATHER_INFLIGHT.get(key);
  // Тянем через curl: на этом боксе node-fetch к api.open-meteo.com периодически
  // зависает на чтении тела (особенность VPN/процесса), а curl стабильно отдаёт за ~0.6с.
  const p = new Promise((resolve, reject) => {
    execFile("curl", ["-sS", "--compressed", "--max-time", "15", "-A", "pokrovka-smarthome", key],
      { maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr && String(stderr).trim()) || err.message));
        try {
          const data = JSON.parse(stdout);
          WEATHER_CACHE.set(key, { at: Date.now(), data });
          if (WEATHER_CACHE.size > 80) WEATHER_CACHE.delete(WEATHER_CACHE.keys().next().value);
          resolve(data);
        } catch (_) {
          reject(new Error("bad json from upstream"));
        }
      });
  }).finally(() => WEATHER_INFLIGHT.delete(key));
  WEATHER_INFLIGHT.set(key, p);
  return p;
}
// stale-while-revalidate: свежий кэш — сразу; устаревший — отдаём старое и обновляем в фоне;
// нет кэша — ждём ответ; при сбое апстрима отдаём последнее, что есть в кэше.
async function proxyWeather(upstreamBase, qs, ttlMs) {
  const key = `${upstreamBase}?${qs}`;
  const cached = WEATHER_CACHE.get(key);
  if (cached) {
    if (Date.now() - cached.at >= ttlMs) fetchWeatherUpstream(key).catch(() => {});
    return cached.data;
  }
  try {
    return await fetchWeatherUpstream(key);
  } catch (e) {
    const any = WEATHER_CACHE.get(key);
    if (any) return any.data;
    throw e;
  }
}

app.get("/api/weather/forecast", async (req, res) => {
  try {
    const data = await proxyWeather("https://api.open-meteo.com/v1/forecast", rawQuery(req), 3 * 60 * 1000);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

app.get("/api/weather/air-quality", async (req, res) => {
  try {
    const data = await proxyWeather("https://air-quality-api.open-meteo.com/v1/air-quality", rawQuery(req), 5 * 60 * 1000);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ===== ИК-устройства (IR remotes через Zigbee ИК-бластер, напр. Moes UFO-R11) =====
// Модель хранения: state.irRemotes = [{ id, name, blaster, icon, buttons:[{id,name,icon,code}] }]
// Бластер — это zigbee-устройство, у которого в exposes есть ir_code_to_send/learn_ir_code.

function deviceExposeProps(device) {
  const props = new Set();
  const walk = (arr) => {
    for (const e of arr || []) {
      if (!e || typeof e !== "object") continue;
      const p = e.property || e.name;
      if (p) props.add(p);
      if (Array.isArray(e.features)) walk(e.features);
      if (Array.isArray(e.exposes)) walk(e.exposes);
    }
  };
  walk(device?.definition?.exposes || []);
  return props;
}

// Список доступных ИК-бластеров (устройства, умеющие слать ИК-коды).
function listIrBlasters() {
  const z = ensureZigbeeState();
  return Object.values(z.devices || {})
    .filter((d) => d && d.type !== "Coordinator" && deviceExposeProps(d).has("ir_code_to_send"))
    .map((d) => ({
      friendlyName: d.friendlyName,
      name: d.friendlyName,
      vendor: d.definition?.vendor || null,
      model: d.definition?.model || null,
      canLearn: deviceExposeProps(d).has("learn_ir_code"),
      status: zigbeeDeviceRuntimeStatus(d),
      learnedCode: (z.values?.[d.friendlyName] || {}).learned_ir_code || null
    }));
}

function findIrRemote(id) {
  if (!Array.isArray(state.irRemotes)) state.irRemotes = [];
  return state.irRemotes.find((r) => r && r.id === id) || null;
}

function irRemotePublicView(remote) {
  const z = ensureZigbeeState();
  const dev = z.devices?.[remote.blaster];
  return {
    ...remote,
    buttons: Array.isArray(remote.buttons) ? remote.buttons : [],
    blasterOnline: dev ? zigbeeDeviceRuntimeStatus(dev) === "online" : false,
    blasterKnown: !!dev
  };
}

// Список ИК-пультов + доступные бластеры.
app.get("/api/ir/remotes", (req, res) => {
  if (!Array.isArray(state.irRemotes)) state.irRemotes = [];
  res.json({
    ok: true,
    remotes: state.irRemotes.map(irRemotePublicView),
    blasters: listIrBlasters()
  });
});

// Создать пульт.
app.post("/api/ir/remotes", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const blaster = String(req.body?.blaster || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!blaster) return res.status(400).json({ error: "blaster is required" });
  if (!Array.isArray(state.irRemotes)) state.irRemotes = [];
  const remote = {
    id: nextId("ir"),
    name,
    blaster,
    icon: String(req.body?.icon || "").trim() || "remote",
    buttons: [],
    createdAt: nowIso()
  };
  state.irRemotes.push(remote);
  saveState();
  res.json({ ok: true, remote: irRemotePublicView(remote) });
});

// Обновить пульт (имя/бластер/иконка).
app.put("/api/ir/remotes/:id", (req, res) => {
  const remote = findIrRemote(req.params.id);
  if (!remote) return res.status(404).json({ error: "remote not found" });
  if (req.body?.name != null) remote.name = String(req.body.name).trim() || remote.name;
  if (req.body?.blaster != null) remote.blaster = String(req.body.blaster).trim() || remote.blaster;
  if (req.body?.icon != null) remote.icon = String(req.body.icon).trim() || remote.icon;
  saveState();
  res.json({ ok: true, remote: irRemotePublicView(remote) });
});

// Удалить пульт.
app.delete("/api/ir/remotes/:id", (req, res) => {
  if (!Array.isArray(state.irRemotes)) state.irRemotes = [];
  const before = state.irRemotes.length;
  state.irRemotes = state.irRemotes.filter((r) => r && r.id !== req.params.id);
  if (state.irRemotes.length === before) return res.status(404).json({ error: "remote not found" });
  saveState();
  res.json({ ok: true });
});

// Добавить кнопку с готовым ИК-кодом.
app.post("/api/ir/remotes/:id/buttons", (req, res) => {
  const remote = findIrRemote(req.params.id);
  if (!remote) return res.status(404).json({ error: "remote not found" });
  const name = String(req.body?.name || "").trim();
  const code = String(req.body?.code || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!code) return res.status(400).json({ error: "code is required" });
  if (!Array.isArray(remote.buttons)) remote.buttons = [];
  const button = {
    id: nextId("irbtn"),
    name,
    code,
    icon: String(req.body?.icon || "").trim() || "",
    createdAt: nowIso()
  };
  remote.buttons.push(button);
  saveState();
  res.json({ ok: true, button, remote: irRemotePublicView(remote) });
});

// Обновить кнопку.
app.put("/api/ir/remotes/:id/buttons/:btnId", (req, res) => {
  const remote = findIrRemote(req.params.id);
  if (!remote) return res.status(404).json({ error: "remote not found" });
  const button = (remote.buttons || []).find((b) => b && b.id === req.params.btnId);
  if (!button) return res.status(404).json({ error: "button not found" });
  if (req.body?.name != null) button.name = String(req.body.name).trim() || button.name;
  if (req.body?.code != null) button.code = String(req.body.code).trim() || button.code;
  if (req.body?.icon != null) button.icon = String(req.body.icon).trim();
  saveState();
  res.json({ ok: true, button, remote: irRemotePublicView(remote) });
});

// Удалить кнопку.
app.delete("/api/ir/remotes/:id/buttons/:btnId", (req, res) => {
  const remote = findIrRemote(req.params.id);
  if (!remote) return res.status(404).json({ error: "remote not found" });
  const before = (remote.buttons || []).length;
  remote.buttons = (remote.buttons || []).filter((b) => b && b.id !== req.params.btnId);
  if (remote.buttons.length === before) return res.status(404).json({ error: "button not found" });
  saveState();
  res.json({ ok: true, remote: irRemotePublicView(remote) });
});

// Нажать кнопку — отправить ИК-код через бластер.
app.post("/api/ir/remotes/:id/buttons/:btnId/send", async (req, res) => {
  const remote = findIrRemote(req.params.id);
  if (!remote) return res.status(404).json({ error: "remote not found" });
  const button = (remote.buttons || []).find((b) => b && b.id === req.params.btnId);
  if (!button) return res.status(404).json({ error: "button not found" });
  try {
    await zigbeePublish(`${remote.blaster}/set`, { ir_code_to_send: button.code });
    logEvent({
      type: "zigbee",
      title: `ИК: ${remote.name} → ${button.name}`,
      text: `Код отправлен через ${remote.blaster}`,
      priority: "info",
      source: `ir:${remote.id}`,
      payload: { remote: remote.id, button: button.id }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// Отправить произвольный код напрямую (для теста перед сохранением кнопки).
app.post("/api/ir/send", async (req, res) => {
  const blaster = String(req.body?.blaster || "").trim();
  const code = String(req.body?.code || "").trim();
  if (!blaster) return res.status(400).json({ error: "blaster is required" });
  if (!code) return res.status(400).json({ error: "code is required" });
  try {
    await zigbeePublish(`${blaster}/set`, { ir_code_to_send: code });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// Запустить обучение: переводим бластер в режим захвата кода с пульта.
app.post("/api/ir/learn/start", async (req, res) => {
  const blaster = String(req.body?.blaster || "").trim();
  if (!blaster) return res.status(400).json({ error: "blaster is required" });
  const z = ensureZigbeeState();
  // Запоминаем последний известный код ДО обучения, чтобы отличить новый.
  const prev = (z.values?.[blaster] || {}).learned_ir_code || null;
  state._irLearn = state._irLearn || {};
  state._irLearn[blaster] = { startedAt: nowIso(), prevCode: prev };
  try {
    await zigbeePublish(`${blaster}/set`, { learn_ir_code: "ON" });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// Опрос результата обучения: новый learned_ir_code, появившийся после старта.
app.get("/api/ir/learn/result", (req, res) => {
  const blaster = String(req.query?.blaster || "").trim();
  if (!blaster) return res.status(400).json({ error: "blaster is required" });
  const z = ensureZigbeeState();
  const current = (z.values?.[blaster] || {}).learned_ir_code || null;
  const session = (state._irLearn || {})[blaster] || null;
  const ready = !!(current && session && current !== session.prevCode);
  res.json({
    ok: true,
    learning: !!session,
    ready,
    code: ready ? current : null
  });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`API started on http://${HOST}:${PORT}`);
});
