import React, { useEffect, useMemo, useState } from "react";
import { useUiPopup } from "../../contexts/UiPopupContext";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

type Primitive = string | number | boolean | null;

type ZigbeeExpose = {
  type?: string;
  name?: string;
  property?: string;
  label?: string;
  access?: number;
  description?: string;
  unit?: string;
  value_on?: Primitive;
  value_off?: Primitive;
  value_toggle?: Primitive;
  value_min?: number;
  value_max?: number;
  value_step?: number;
  values?: Primitive[];
  endpoint?: string;
  features?: ZigbeeExpose[];
  exposes?: ZigbeeExpose[];
};

type ZigbeeControl = {
  key: string;
  property: string;
  name?: string;
  label: string;
  type: string;
  kind: string;
  access: number;
  readable: boolean;
  writable: boolean;
  gettable: boolean;
  description?: string;
  unit?: string;
  valueOn?: Primitive;
  valueOff?: Primitive;
  valueToggle?: Primitive;
  values?: Primitive[];
  min?: number | null;
  max?: number | null;
  step?: number | null;
  endpoint?: string | null;
  path?: string[];
};

type ZigbeeDevice = {
  friendlyName: string;
  ieeeAddress?: string;
  type?: string;
  manufacturer?: string;
  modelId?: string;
  powerSource?: string;
  interviewCompleted?: boolean | null;
  supported?: boolean | null;
  availability?: string;
  effectiveStatus?: string;
  lastMessageAt?: string;
  availabilityUpdatedAt?: string;
  controls?: ZigbeeControl[];
  definition?: {
    model?: string;
    vendor?: string;
    description?: string;
    exposes?: ZigbeeExpose[];
  };
  state?: Record<string, unknown>;
  notify?: boolean;
};

type ZigbeeStatus = {
  ok: boolean;
  enabled: boolean;
  mqttConnected: boolean;
  mqttUrl: string;
  baseTopic: string;
  frontendUrl: string;
  bridgeState: string;
  permitJoin: boolean;
  permitJoinUntil: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  devicesCount: number;
  onlineDevices: number;
  devices: ZigbeeDevice[];
  responses?: Array<{ topic: string; payload: unknown; createdAt: string }>;
};

const emptyStatus: ZigbeeStatus = {
  ok: false,
  enabled: true,
  mqttConnected: false,
  mqttUrl: "mqtt://127.0.0.1:1883",
  baseTopic: "zigbee2mqtt",
  frontendUrl: "http://localhost:8081",
  bridgeState: "unknown",
  permitJoin: false,
  permitJoinUntil: null,
  lastSeenAt: null,
  lastError: null,
  devicesCount: 0,
  onlineDevices: 0,
  devices: [],
  responses: [],
};

const LABELS: Record<string, string> = {
  state: "Питание",
  brightness: "Яркость",
  color_temp: "Температура цвета",
  color_temp_startup: "Температура цвета при старте",
  color_xy: "Цвет XY",
  color_hs: "Цвет H/S",
  position: "Позиция",
  cover_position: "Позиция шторы",
  motor_state: "Состояние мотора",
  lock_state: "Состояние замка",
  child_lock: "Защита от детей",
  power_on_behavior: "После питания",
  occupancy: "Движение",
  contact: "Контакт",
  water_leak: "Протечка",
  smoke: "Дым",
  gas: "Газ",
  temperature: "Температура",
  humidity: "Влажность",
  battery: "Батарея",
  linkquality: "Качество связи",
  voltage: "Напряжение",
  current: "Ток",
  power: "Мощность",
  energy: "Энергия",
  action: "Действие",
  mode: "Режим",
  system_mode: "Режим системы",
  preset: "Пресет",
  local_temperature: "Температура в комнате",
  occupied_heating_setpoint: "Целевая температура",
  running_state: "Работа",
  fan_mode: "Режим вентилятора",
  valve_position: "Положение клапана",
};

function labelFor(property: string, fallback?: string) {
  return LABELS[property.toLowerCase()] || fallback || property;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

function formatStateValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const ACTION_LABELS: Record<string, string> = {
  single: "Одиночное нажатие",
  double: "Двойное нажатие",
  triple: "Тройное нажатие",
  quadruple: "Четверное нажатие",
  hold: "Удержание",
  release: "Отпускание",
  long: "Долгое нажатие",
  long_press: "Долгое нажатие",
  long_release: "Отпускание (долгое)",
  many: "Серия нажатий",
  on: "Вкл",
  off: "Выкл",
  toggle: "Переключение",
  brightness_up: "Ярче",
  brightness_down: "Тусклее",
  brightness_move_up: "Ярче (удержание)",
  brightness_move_down: "Тусклее (удержание)",
  brightness_stop: "Стоп яркости",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action.toLowerCase()] || action;
}

function formatActionTime(value: unknown) {
  if (!value) return "";
  try {
    return new Date(String(value)).toLocaleTimeString("ru-RU");
  } catch {
    return "";
  }
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Имя, которое задал пользователь в Zigbee2MQTT. Если это технический hex-адрес
// (0x… или ieee), считаем что понятного имени нет и не показываем его как заголовок.
function customName(device: ZigbeeDevice): string | null {
  const name = String(device.friendlyName || "").trim();
  if (!name || name === "Coordinator") return null;
  if (/^0x[0-9a-f]+$/i.test(name)) return null;
  if (device.ieeeAddress && name === device.ieeeAddress) return null;
  return name;
}

function accessFlags(access?: number) {
  const value = Number(access || 0);
  return {
    readable: (value & 1) === 1 || (value & 4) === 4,
    writable: (value & 2) === 2,
    gettable: (value & 4) === 4,
  };
}

function controlKind(expose: ZigbeeExpose) {
  const type = String(expose.type || "").toLowerCase();
  const property = String(expose.property || expose.name || "").toLowerCase();
  if (property === "state") return "switch";
  if (["binary", "numeric", "enum", "text", "list", "composite"].includes(type)) return type;
  return type || "unknown";
}

function deriveControls(exposes?: ZigbeeExpose[], parentPath: string[] = []): ZigbeeControl[] {
  if (!Array.isArray(exposes)) return [];
  const controls: ZigbeeControl[] = [];

  exposes.forEach((expose) => {
    if (!expose || typeof expose !== "object") return;
    const name = String(expose.name || expose.property || expose.type || "feature");
    const path = [...parentPath, name];
    const nested: ZigbeeExpose[] = [];
    if (Array.isArray(expose.features)) nested.push(...expose.features);
    if (Array.isArray(expose.exposes)) nested.push(...expose.exposes);
    if (nested.length) controls.push(...deriveControls(nested, path));

    const property = String(expose.property || expose.name || "");
    if (!property) return;
    const flags = accessFlags(expose.access);
    if (!flags.readable && !flags.writable && !flags.gettable) return;

    controls.push({
      key: path.join("."),
      property,
      name: expose.name || property,
      label: labelFor(property, expose.label || expose.name || property),
      type: expose.type || "unknown",
      kind: controlKind(expose),
      access: Number(expose.access || 0),
      readable: flags.readable,
      writable: flags.writable,
      gettable: flags.gettable,
      description: expose.description || "",
      unit: expose.unit || "",
      valueOn: expose.value_on,
      valueOff: expose.value_off,
      valueToggle: expose.value_toggle,
      values: Array.isArray(expose.values) ? expose.values : [],
      min: typeof expose.value_min === "number" ? expose.value_min : null,
      max: typeof expose.value_max === "number" ? expose.value_max : null,
      step: typeof expose.value_step === "number" ? expose.value_step : null,
      endpoint: expose.endpoint || null,
      path,
    });
  });

  const seen = new Set<string>();
  return controls.filter((control) => {
    const id = `${control.property}:${control.kind}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const WRITABLE_STATE_KEYS = new Set([
  "state",
  "brightness",
  "color_temp",
  "color_temp_startup",
  "position",
  "cover_position",
  "child_lock",
  "power_on_behavior",
  "system_mode",
  "preset",
  "occupied_heating_setpoint",
  "fan_mode",
  "mode",
]);

const READ_ONLY_STATE_KEYS = new Set([
  "linkquality",
  "temperature",
  "humidity",
  "battery",
  "voltage",
  "current",
  "power",
  "energy",
  "occupancy",
  "contact",
  "water_leak",
  "smoke",
  "gas",
  "action",
  "local_temperature",
  "running_state",
]);

function fallbackControlFromStateKey(property: string, value: unknown): ZigbeeControl | null {
  if (!property || property.startsWith("_")) return null;
  const key = property.toLowerCase();
  const isWritable = WRITABLE_STATE_KEYS.has(key) || key === "state";
  const isReadOnly = READ_ONLY_STATE_KEYS.has(key) || !isWritable;

  if (key === "state") {
    return {
      key: "fallback.state",
      property,
      name: property,
      label: labelFor(property, property),
      type: "binary",
      kind: "switch",
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      valueOn: "ON",
      valueOff: "OFF",
      valueToggle: "TOGGLE",
      values: ["ON", "OFF", "TOGGLE"],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ["fallback", property],
      description: "Fallback-кнопки построены по текущему state, потому что Zigbee2MQTT не отдал exposes для этого метода.",
    };
  }

  if (key === "power_on_behavior") {
    return {
      key: "fallback.power_on_behavior",
      property,
      name: property,
      label: labelFor(property, property),
      type: "enum",
      kind: "enum",
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      values: ["off", "on", "toggle", "previous"],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ["fallback", property],
      description: "Поведение устройства после появления питания.",
    };
  }

  const numericRanges: Record<string, { min: number; max: number; step: number; unit?: string }> = {
    brightness: { min: 0, max: 255, step: 1 },
    color_temp: { min: 150, max: 500, step: 1 },
    color_temp_startup: { min: 150, max: 500, step: 1 },
    position: { min: 0, max: 100, step: 1, unit: "%" },
    cover_position: { min: 0, max: 100, step: 1, unit: "%" },
    occupied_heating_setpoint: { min: 5, max: 35, step: 0.5, unit: "°C" },
  };

  if (numericRanges[key] || typeof value === "number") {
    const range = numericRanges[key] || { min: 0, max: 100, step: 1 };
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: labelFor(property, property),
      type: "numeric",
      kind: "numeric",
      access: isWritable ? 3 : 1,
      readable: true,
      writable: isWritable,
      gettable: false,
      values: [],
      min: range.min,
      max: range.max,
      step: range.step,
      unit: range.unit || "",
      endpoint: null,
      path: ["fallback", property],
    };
  }

  if (typeof value === "boolean") {
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: labelFor(property, property),
      type: "binary",
      kind: "binary",
      access: isWritable ? 3 : 1,
      readable: true,
      writable: isWritable,
      gettable: false,
      valueOn: true,
      valueOff: false,
      values: [true, false],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ["fallback", property],
    };
  }

  const enumValues: Record<string, Primitive[]> = {
    child_lock: ["LOCK", "UNLOCK"],
    system_mode: ["off", "heat", "cool", "auto"],
    preset: ["manual", "schedule", "eco", "comfort", "boost"],
    fan_mode: ["off", "low", "medium", "high", "auto"],
    mode: ["auto", "manual", "off"],
  };

  if (enumValues[key] || (isWritable && typeof value === "string")) {
    const values = enumValues[key] || Array.from(new Set([String(value), "ON", "OFF"]));
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: labelFor(property, property),
      type: "enum",
      kind: "enum",
      access: 3,
      readable: true,
      writable: true,
      gettable: false,
      values,
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ["fallback", property],
    };
  }

  if (isReadOnly) {
    return {
      key: `fallback.${property}`,
      property,
      name: property,
      label: labelFor(property, property),
      type: typeof value === "string" ? "text" : "unknown",
      kind: "text",
      access: 1,
      readable: true,
      writable: false,
      gettable: false,
      values: [],
      min: null,
      max: null,
      step: null,
      endpoint: null,
      path: ["fallback", property],
    };
  }

  return null;
}

function deriveControlsFromState(state?: Record<string, unknown>): ZigbeeControl[] {
  if (!state || typeof state !== "object") return [];
  return Object.entries(state)
    .map(([key, value]) => fallbackControlFromStateKey(key, value))
    .filter((control): control is ZigbeeControl => Boolean(control));
}

function mergeControls(...groups: ZigbeeControl[][]): ZigbeeControl[] {
  const merged: ZigbeeControl[] = [];
  const seen = new Set<string>();
  groups.flat().forEach((control) => {
    const id = `${control.property}:${control.kind}`;
    if (seen.has(id)) return;
    seen.add(id);
    merged.push(control);
  });
  return merged;
}

function getDeviceControls(device: ZigbeeDevice) {
  const fromApi = Array.isArray(device.controls) ? device.controls : [];
  const fromExposes = deriveControls(device.definition?.exposes || []);
  const fromState = deriveControlsFromState(device.state || {});
  return mergeControls(fromApi, fromExposes, fromState);
}

function defaultForControl(control: ZigbeeControl, current: unknown): Primitive {
  if (current == null) {
    if (control.kind === "numeric") return control.min ?? 0;
    if (control.kind === "switch") return "ON";
    if (control.kind === "binary") return control.valueOn ?? true;
    if (control.kind === "enum") return control.values?.[0] ?? "";
    return "";
  }
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") return current;
  return JSON.stringify(current);
}

function payloadFor(control: ZigbeeControl, value: Primitive): Record<string, unknown> {
  return { [control.property]: value };
}

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data?.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function ZigbeeControlRenderer({
  control,
  value,
  busy,
  onSend,
}: {
  control: ZigbeeControl;
  value: unknown;
  busy: boolean;
  onSend: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [textValue, setTextValue] = useState<string>(String(defaultForControl(control, value) ?? ""));

  useEffect(() => {
    setTextValue(String(defaultForControl(control, value) ?? ""));
  }, [control, value]);

  const description = control.description ? <div className="mt-1 text-[11px] leading-4 text-gray-500">{control.description}</div> : null;

  if (control.kind === "switch" || (control.property === "state" && control.writable)) {
    const onValue = control.valueOn ?? "ON";
    const offValue = control.valueOff ?? "OFF";
    const toggleValue = control.valueToggle ?? "TOGGLE";
    return (
      <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-100">{control.label}</div>
            <div className="text-xs text-gray-500">Сейчас: {formatStateValue(value)}</div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button disabled={busy} onClick={() => onSend(payloadFor(control, onValue))} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60">Вкл</button>
            <button disabled={busy} onClick={() => onSend(payloadFor(control, offValue))} className="rounded-lg border border-[#2a2b46] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Выкл</button>
            {toggleValue != null && <button disabled={busy} onClick={() => onSend(payloadFor(control, toggleValue))} className="rounded-lg border border-[#2a2b46] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Toggle</button>}
          </div>
        </div>
        {description}
      </div>
    );
  }

  if (control.kind === "binary") {
    const onValue = control.valueOn ?? true;
    const offValue = control.valueOff ?? false;
    return (
      <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
        <div className="mb-2 text-sm font-semibold text-gray-100">{control.label}</div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => onSend(payloadFor(control, onValue))} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60">{String(onValue)}</button>
          <button disabled={busy} onClick={() => onSend(payloadFor(control, offValue))} className="rounded-lg border border-[#2a2b46] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">{String(offValue)}</button>
        </div>
        <div className="mt-2 text-xs text-gray-500">Сейчас: {formatStateValue(value)}</div>
        {description}
      </div>
    );
  }

  if (control.kind === "numeric") {
    const min = control.min ?? 0;
    const max = control.max ?? (control.property === "brightness" ? 255 : 100);
    const step = control.step ?? 1;
    const numericValue = asNumber(value, asNumber(Number(textValue), min));
    return (
      <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-100">{control.label}</div>
            <div className="text-xs text-gray-500">{min}–{max}{control.unit ? ` ${control.unit}` : ""}</div>
          </div>
          <div className="text-sm font-semibold text-gray-200">{numericValue}{control.unit ? ` ${control.unit}` : ""}</div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(Number(textValue)) ? Number(textValue) : numericValue}
            disabled={busy}
            onChange={(event) => setTextValue(event.target.value)}
            onMouseUp={() => onSend(payloadFor(control, Number(textValue)))}
            onTouchEnd={() => onSend(payloadFor(control, Number(textValue)))}
            className="min-w-0 flex-1"
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={textValue}
            disabled={busy}
            onChange={(event) => setTextValue(event.target.value)}
            className="w-20 rounded-lg border border-[#2a2b46] bg-[#111322] px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
          <button disabled={busy} onClick={() => onSend(payloadFor(control, Number(textValue)))} className="rounded-lg border border-blue-500/60 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/10 disabled:opacity-60">OK</button>
        </div>
        {description}
      </div>
    );
  }

  if (control.kind === "enum") {
    const current = value == null ? "" : String(value);
    return (
      <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
        <div className="mb-2 text-sm font-semibold text-gray-100">{control.label}</div>
        <select
          value={current}
          disabled={busy}
          onChange={(event) => onSend(payloadFor(control, event.target.value))}
          className="w-full rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
        >
          {current === "" && <option value="">Выбрать</option>}
          {(control.values || []).map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
        </select>
        {description}
      </div>
    );
  }

  if (control.kind === "text") {
    return (
      <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
        <div className="mb-2 text-sm font-semibold text-gray-100">{control.label}</div>
        <div className="flex gap-2">
          <input
            value={textValue}
            disabled={busy}
            onChange={(event) => setTextValue(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
          <button disabled={busy} onClick={() => onSend(payloadFor(control, textValue))} className="rounded-lg border border-blue-500/60 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/10 disabled:opacity-60">OK</button>
        </div>
        {description}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
      <div className="text-sm font-semibold text-gray-100">{control.label}</div>
      <div className="mt-1 text-xs text-gray-500">Сложный метод: отправь JSON ниже. Свойство: <span className="text-gray-300">{control.property}</span></div>
      {description}
    </div>
  );
}


type DeviceCardKind = "coordinator" | "valve" | "relay" | "switch" | "button" | "cover" | "lock" | "sensor" | "light" | "generic";

type DeviceProfile = {
  kind: DeviceCardKind;
  title: string;
  subtitle: string;
  icon: string;
  controllable: boolean;
};

const READABLE_PRIORITY = [
  "state",
  "action",
  "position",
  "cover_position",
  "lock_state",
  "contact",
  "occupancy",
  "water_leak",
  "temperature",
  "humidity",
  "battery",
  "power",
  "energy",
  "voltage",
  "current",
  "linkquality",
  "power_on_behavior",
];

function normalizedText(device: ZigbeeDevice) {
  return [
    device.friendlyName,
    device.ieeeAddress,
    device.type,
    device.powerSource,
    device.manufacturer,
    device.modelId,
    device.definition?.model,
    device.definition?.vendor,
    device.definition?.description,
    ...(device.controls || []).map((control) => `${control.property} ${control.label} ${control.type} ${control.kind}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasStateKey(device: ZigbeeDevice, key: string) {
  return Object.prototype.hasOwnProperty.call(device.state || {}, key);
}

function hasAnyControl(device: ZigbeeDevice, names: string[]) {
  const lookup = new Set(names.map((name) => name.toLowerCase()));
  return getDeviceControls(device).some((control) => lookup.has(control.property.toLowerCase()));
}

function isStateWritable(device: ZigbeeDevice) {
  return getDeviceControls(device).some((control) => control.property.toLowerCase() === "state" && control.writable);
}

function valueLower(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function sensorProfileFor(device: ZigbeeDevice): DeviceProfile {
  const has = (key: string) => hasStateKey(device, key) || hasAnyControl(device, [key]);
  if (has("water_leak")) return { kind: "sensor", title: "Датчик протечки", subtitle: "Контроль протечки воды", icon: "💧", controllable: false };
  if (has("smoke")) return { kind: "sensor", title: "Датчик дыма", subtitle: "Контроль задымления", icon: "🔥", controllable: false };
  if (has("gas")) return { kind: "sensor", title: "Датчик газа", subtitle: "Контроль утечки газа", icon: "🟩", controllable: false };
  if (has("occupancy")) return { kind: "sensor", title: "Датчик движения", subtitle: "Присутствие и движение", icon: "🚶", controllable: false };
  if (has("contact")) return { kind: "sensor", title: "Датчик открытия", subtitle: "Открытие двери / окна", icon: "🚪", controllable: false };
  if (has("temperature") || has("humidity")) return { kind: "sensor", title: "Датчик климата", subtitle: "Температура и влажность", icon: "🌡️", controllable: false };
  return { kind: "sensor", title: "Датчик", subtitle: "Показания без управляющих команд", icon: "📟", controllable: false };
}

function inferDeviceProfile(device: ZigbeeDevice): DeviceProfile {
  const text = normalizedText(device);
  const controls = getDeviceControls(device);
  const stateWritable = isStateWritable(device);
  const hasAction = hasStateKey(device, "action") || hasAnyControl(device, ["action"]);
  const hasPosition = hasStateKey(device, "position") || hasStateKey(device, "cover_position") || hasAnyControl(device, ["position", "cover_position"]);
  const hasLock = hasStateKey(device, "lock_state") || hasAnyControl(device, ["lock_state", "state_lock"]);
  const hasValve = /\b(valve|water valve|gas valve|tap|кран|клапан|задвиж|шаровый)\b/i.test(text) || hasStateKey(device, "valve_position") || hasAnyControl(device, ["valve_position"]);
  const hasLight = /\b(light|bulb|lamp|dimmer|свет|лампа|диммер)\b/i.test(text) || hasStateKey(device, "brightness") || hasAnyControl(device, ["brightness", "color_temp", "color_xy", "color_hs"]);
  const hasSensor = ["temperature", "humidity", "water_leak", "occupancy", "contact", "smoke", "gas", "battery"].some((key) => hasStateKey(device, key) || hasAnyControl(device, [key]));
  const isBattery = /battery|battery_low|батар/i.test(text) || String(device.powerSource || "").toLowerCase().includes("battery");
  const isButtonText =
    /\b(button|remote|wireless|scene switch|sensor_switch|кнопк|пульт|выключатель)\b/i.test(text) ||
    /(wxkg|ts004\d?|ptm21|qbkg|e1766|e1812|e1524|on_off_switch)/i.test(text) ||
    (isBattery && /\bswitch\b/i.test(text));
  const isRelayText = /\b(relay|switch module|plug|outlet|socket|реле|розетк|модуль)\b/i.test(text);

  if (device.friendlyName === "Coordinator" || String(device.type || "").toLowerCase() === "coordinator") {
    return { kind: "coordinator", title: "Координатор", subtitle: "ZBDongle-P / координатор сети", icon: "🧭", controllable: false };
  }

  if (hasValve) {
    return { kind: "valve", title: "Кран", subtitle: "Открытие и закрытие через Zigbee", icon: "🚰", controllable: stateWritable || controls.some((c) => c.writable) };
  }

  if (hasPosition) {
    return { kind: "cover", title: "Штора / привод", subtitle: "Позиция и команды движения", icon: "🪟", controllable: controls.some((c) => c.writable) };
  }

  if (hasLock) {
    return { kind: "lock", title: "Замок", subtitle: "Состояние замка", icon: "🔒", controllable: controls.some((c) => c.writable) };
  }

  if (hasAction && (isBattery || isButtonText) && !stateWritable) {
    return { kind: "button", title: "Кнопка", subtitle: "Показывает последнее действие", icon: "🔘", controllable: false };
  }

  if (isButtonText && isBattery) {
    return { kind: "button", title: "Кнопка / выключатель", subtitle: "Беспроводная кнопка: статус и последнее действие", icon: "🔘", controllable: false };
  }

  if (hasLight && stateWritable) {
    return { kind: "light", title: "Свет", subtitle: "Включение, яркость и параметры света", icon: "💡", controllable: true };
  }

  if ((isRelayText || stateWritable || hasStateKey(device, "power_on_behavior")) && (hasStateKey(device, "state") || stateWritable)) {
    return { kind: "relay", title: "Реле", subtitle: "Постоянное состояние и управление питанием", icon: "⚡", controllable: stateWritable };
  }

  if (hasSensor) {
    return sensorProfileFor(device);
  }

  if (hasAction) {
    return { kind: "button", title: "Кнопка", subtitle: "Показывает последнее действие", icon: "🔘", controllable: false };
  }

  return { kind: "generic", title: "Zigbee устройство", subtitle: "Тип не определён, показано состояние", icon: "📡", controllable: controls.some((c) => c.writable) };
}

function statusTextFor(profile: DeviceProfile, state: Record<string, unknown>) {
  const stateValue = state.state;
  if (profile.kind === "valve") {
    const lower = valueLower(stateValue);
    if (["on", "open", "opened", "true"].includes(lower)) return "Открыт";
    if (["off", "close", "closed", "false"].includes(lower)) return "Закрыт";
    return stateValue == null ? "Состояние неизвестно" : formatStateValue(stateValue);
  }
  if (profile.kind === "relay" || profile.kind === "light") {
    const lower = valueLower(stateValue);
    if (["on", "true", "1"].includes(lower)) return "Включено";
    if (["off", "false", "0"].includes(lower)) return "Выключено";
    return stateValue == null ? "Состояние неизвестно" : formatStateValue(stateValue);
  }
  if (profile.kind === "button" || profile.kind === "switch") {
    const last = state._lastAction ?? state.action;
    if (last != null && String(last) !== "") {
      const at = formatActionTime(state._lastActionAt);
      return `${actionLabel(String(last))}${at ? ` · ${at}` : ""}`;
    }
    if (state.state != null) return `Статус: ${formatStateValue(state.state)}`;
    return "Ожидает события";
  }
  if (profile.kind === "cover") {
    const position = state.cover_position ?? state.position;
    return position == null ? "Позиция неизвестна" : `Позиция ${formatStateValue(position)}%`;
  }
  if (profile.kind === "lock") {
    const l = valueLower(state.lock_state);
    if (["lock", "locked", "true"].includes(l)) return "Закрыт";
    if (["unlock", "unlocked", "false"].includes(l)) return "Открыт";
    return state.lock_state == null ? "Состояние неизвестно" : formatStateValue(state.lock_state);
  }
  if (profile.kind === "sensor") {
    if ("water_leak" in state) return state.water_leak ? "⚠ Протечка!" : "Сухо";
    if ("smoke" in state) return state.smoke ? "⚠ Задымление!" : "Норма";
    if ("gas" in state) return state.gas ? "⚠ Утечка газа!" : "Норма";
    if ("occupancy" in state) return state.occupancy ? "Есть движение" : "Нет движения";
    if ("contact" in state) return state.contact ? "Закрыто" : "Открыто";
    if ("temperature" in state || "humidity" in state) {
      const parts: string[] = [];
      if (state.temperature != null) parts.push(`${formatStateValue(state.temperature)} °C`);
      if (state.humidity != null) parts.push(`${formatStateValue(state.humidity)} %`);
      return parts.join(" · ") || "Показания обновляются";
    }
    return "Показания обновляются";
  }
  return stateValue == null ? "Состояние неизвестно" : formatStateValue(stateValue);
}

function stateControl(device: ZigbeeDevice) {
  return getDeviceControls(device).find((control) => control.property.toLowerCase() === "state" && control.writable);
}

function numericControl(device: ZigbeeDevice, names: string[]) {
  const lookup = new Set(names.map((name) => name.toLowerCase()));
  return getDeviceControls(device).find((control) => lookup.has(control.property.toLowerCase()) && control.writable);
}

function enumControl(device: ZigbeeDevice, names: string[]) {
  const lookup = new Set(names.map((name) => name.toLowerCase()));
  return getDeviceControls(device).find((control) => lookup.has(control.property.toLowerCase()) && control.writable);
}

function preferredStateValues(control: ZigbeeControl | undefined, state: Record<string, unknown>, profile: DeviceProfile) {
  const current = valueLower(state.state);
  const values = (control?.values || []).map((v) => String(v));
  const upperValues = values.map((v) => v.toUpperCase());

  if (profile.kind === "valve") {
    if (upperValues.includes("OPEN") || upperValues.includes("CLOSE")) return { on: "OPEN", off: "CLOSE", toggle: null as Primitive };
    if (["open", "opened", "close", "closed"].includes(current)) return { on: "OPEN", off: "CLOSE", toggle: null as Primitive };
    return { on: control?.valueOn ?? "ON", off: control?.valueOff ?? "OFF", toggle: control?.valueToggle ?? "TOGGLE" };
  }

  return { on: control?.valueOn ?? "ON", off: control?.valueOff ?? "OFF", toggle: control?.valueToggle ?? "TOGGLE" };
}

// Цвет текста статуса (семафор), под mushroom-строку статуса.
// Для offline/устаревших датчиков — нейтральный серый, чтобы не выдавать
// устаревший пакет за «живую» тревогу (красный/жёлтый).
function statusTextColor(profile: DeviceProfile, state: Record<string, unknown>, online = true) {
  if (!online || state._stale === true) return "text-gray-400";
  const cur = valueLower(state.state);
  if (profile.kind === "valve") return ["on", "open", "opened", "true"].includes(cur) ? "text-emerald-300" : "text-gray-400";
  if (profile.kind === "relay" || profile.kind === "light") return ["on", "true", "1"].includes(cur) ? "text-emerald-300" : "text-gray-400";
  if (profile.kind === "lock") {
    const l = valueLower(state.lock_state);
    if (["lock", "locked", "true"].includes(l)) return "text-emerald-300";
    if (["unlock", "unlocked", "false"].includes(l)) return "text-amber-300";
    return "text-gray-400";
  }
  if (profile.kind === "sensor") {
    if (state.water_leak === true || state.smoke === true || state.gas === true) return "text-red-300";
    if (state.occupancy === true || state.contact === false) return "text-amber-300";
    if ("water_leak" in state || "smoke" in state || "gas" in state) return "text-emerald-300";
    return "text-gray-300";
  }
  if (profile.kind === "button" || profile.kind === "switch") return (state._lastAction ?? state.action) ? "text-amber-200" : "text-gray-400";
  return "text-gray-200";
}

// Фон круглой иконки-семафора (активно/тревога/нейтрально)
function iconTone(profile: DeviceProfile, state: Record<string, unknown>, online: boolean) {
  if (!online) return "bg-[#1b1d31]";
  const cur = valueLower(state.state);
  if ((profile.kind === "valve" || profile.kind === "relay" || profile.kind === "light") && ["on", "open", "opened", "true", "1"].includes(cur)) return "bg-blue-600/25";
  if (profile.kind === "cover") {
    const p = state.cover_position ?? state.position;
    if (typeof p === "number" && p > 0) return "bg-blue-600/25";
  }
  if (profile.kind === "sensor") {
    if (state.water_leak === true || state.smoke === true || state.gas === true) return "bg-red-500/25";
    if (state.occupancy === true || state.contact === false) return "bg-amber-500/25";
  }
  return "bg-[#1b1d31]";
}

// Переключатель в стиле Home Assistant
function ToggleSwitch({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-60 ${on ? "bg-blue-600" : "bg-[#2a2b46]"}`}
    >
      <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// Компактный чип заряда батареи
function batteryChip(state: Record<string, unknown>) {
  const b = state.battery;
  if (typeof b !== "number") return null;
  const low = b <= 15;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${low ? "bg-red-500/20 text-red-200" : "bg-[#1b1d31] text-gray-300"}`}>🔋 {Math.round(b)}%</span>
  );
}

// Основной орган управления (справа в шапке). Управляемые типы шлют команды ВСЕГДА —
// даже при пустых exposes/state и offline (Zigbee2MQTT примет publish в .../set).
function PrimaryControl({
  device,
  profile,
  busy,
  onSend,
}: {
  device: ZigbeeDevice;
  profile: DeviceProfile;
  busy: boolean;
  onSend: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const state = device.state || {};
  const control = stateControl(device);
  const stateValues = preferredStateValues(control, state, profile);
  const isOn = ["on", "open", "opened", "true", "1"].includes(valueLower(state.state));

  if (profile.kind === "valve") {
    return (
      <div className="flex shrink-0 gap-2">
        <button disabled={busy} onClick={() => onSend({ state: stateValues.on })} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">Открыть</button>
        <button disabled={busy} onClick={() => onSend({ state: stateValues.off })} className="rounded-xl border border-[#2a2b46] px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Закрыть</button>
      </div>
    );
  }

  if (profile.kind === "relay" || profile.kind === "light") {
    return <ToggleSwitch on={isOn} busy={busy} onToggle={() => onSend({ state: isOn ? stateValues.off : stateValues.on })} />;
  }

  if (profile.kind === "cover") {
    const rawPos = state.cover_position ?? state.position;
    const pos = typeof rawPos === "number" ? rawPos : null;
    return (
      <div className="flex shrink-0 gap-1.5">
        <button disabled={busy || pos === 100} title="Открыть" onClick={() => onSend({ state: "OPEN" })} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">▲</button>
        <button disabled={busy} title="Стоп" onClick={() => onSend({ state: "STOP" })} className="rounded-lg border border-[#2a2b46] px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">■</button>
        <button disabled={busy || pos === 0} title="Закрыть" onClick={() => onSend({ state: "CLOSE" })} className="rounded-lg border border-[#2a2b46] px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-[#1b1d31] disabled:opacity-50">▼</button>
      </div>
    );
  }

  if (profile.kind === "lock") {
    const lockControl = enumControl(device, ["lock_state"]);
    if (!lockControl) return null;
    const locked = ["lock", "locked", "true"].includes(valueLower(state.lock_state));
    return (
      <button disabled={busy} onClick={() => onSend({ lock_state: locked ? "UNLOCK" : "LOCK" })} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{locked ? "Открыть" : "Запереть"}</button>
    );
  }

  if (profile.kind === "generic") {
    const hasStateControl = getDeviceControls(device).some((c) => c.property.toLowerCase() === "state" && c.writable) || "state" in state;
    if (hasStateControl) return <ToggleSwitch on={isOn} busy={busy} onToggle={() => onSend({ state: isOn ? stateValues.off : stateValues.on })} />;
    return null;
  }

  return null; // sensor / button / switch / coordinator — read-only
}

function ImportantStateGrid({ device, profile }: { device: ZigbeeDevice; profile: DeviceProfile }) {
  const state = device.state || {};
  const entries = Object.entries(state)
    .filter(([key]) => !key.startsWith("_"))
    .sort(([a], [b]) => {
      const ia = READABLE_PRIORITY.indexOf(a);
      const ib = READABLE_PRIORITY.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  const important = entries.filter(([key]) => {
    if (profile.kind === "relay" || profile.kind === "light" || profile.kind === "valve") return ["state", "linkquality", "power_on_behavior", "brightness", "battery"].includes(key);
    if (profile.kind === "button" || profile.kind === "switch") return ["action", "state", "battery", "linkquality"].includes(key);
    if (profile.kind === "sensor") return ["temperature", "humidity", "water_leak", "occupancy", "contact", "battery", "linkquality"].includes(key);
    return true;
  });

  const visible = (important.length ? important : entries).slice(0, 8);
  const stale = state._stale === true || device.effectiveStatus === "offline";

  return (
    <div className="mt-3 rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Состояние</span>
        {stale && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300/90">данные устарели · нет связи</span>}
      </div>
      {visible.length === 0 ? (
        <div className="text-sm text-gray-500">Пока нет данных от устройства</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map(([key, value]) => (
            <div key={key} className="rounded-xl bg-[#111322] px-3 py-2 text-xs">
              <div className="truncate text-gray-500">{labelFor(key, key)}</div>
              <div className="mt-0.5 truncate font-semibold text-gray-200" title={formatStateValue(value)}>{formatStateValue(value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZigbeeDeviceCard({ device, advanced, onCommand, onSetNotify }: { device: ZigbeeDevice; advanced: boolean; onCommand: (friendlyName: string, payload: Record<string, unknown>) => Promise<void>; onSetNotify: (friendlyName: string, enabled: boolean) => Promise<void> }) {
  const [raw, setRaw] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const state = device.state || {};
  const status = device.effectiveStatus || device.availability || "unknown";
  const online = status === "online";
  const profile = inferDeviceProfile(device);
  const isCoordinator = device.friendlyName === "Coordinator" || profile.kind === "coordinator";
  const readOnly = isCoordinator || profile.kind === "sensor" || profile.kind === "button" || profile.kind === "switch";
  const bat = batteryChip(state);
  const secondaryControl =
    profile.kind === "light" ? numericControl(device, ["brightness"]) :
    profile.kind === "cover" ? numericControl(device, ["position", "cover_position"]) :
    undefined;
  const writableControls = getDeviceControls(device).filter((c) => c.writable);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setRawError(null);
    try {
      await onCommand(device.friendlyName, payload);
    } catch (err: unknown) {
      setRawError(err instanceof Error ? err.message : "Команда не выполнена");
    } finally {
      setBusy(false);
    }
  }

  async function sendRaw() {
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad json");
      payload = parsed as Record<string, unknown>;
    } catch {
      setRawError('Команда должна быть JSON-объектом, например {"state":"ON"}');
      return;
    }
    await send(payload);
  }

  const statusText = isCoordinator
    ? "Сеть активна"
    : (!online && readOnly ? "Недоступно" : statusTextFor(profile, state));

  return (
    <div className={`rounded-2xl border border-[#2a2b46] bg-[#131522] p-4 shadow-sm min-w-0 ${online ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${iconTone(profile, state, online)}`} aria-hidden="true">{profile.icon}</div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#131522] ${online ? "bg-emerald-400" : status === "offline" ? "bg-red-400" : "bg-amber-400"}`}
            title={online ? "на связи" : status === "offline" ? "не в сети" : "нет данных"}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-gray-100">{customName(device) || profile.title}</h3>
          <div className={`truncate text-sm font-medium ${statusTextColor(profile, state, online)}`}>{statusText}</div>
          {customName(device) && <div className="truncate text-[11px] text-gray-500">{profile.title}</div>}
          {bat && <div className="mt-1.5 flex flex-wrap gap-1.5">{bat}</div>}
        </div>

        {!readOnly && (
          <div className="shrink-0 self-center">
            <PrimaryControl device={device} profile={profile} busy={busy} onSend={send} />
          </div>
        )}
      </div>

      {secondaryControl && (
        <div className="mt-3">
          <ZigbeeControlRenderer control={secondaryControl} value={state[secondaryControl.property]} busy={busy} onSend={send} />
        </div>
      )}

      {!isCoordinator && (
        <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={!!device.notify}
            onChange={(e) => { onSetNotify(device.friendlyName, e.target.checked).catch(() => {}); }}
            className="h-4 w-4 shrink-0 accent-blue-600"
          />
          Оповещать в Telegram о смене состояния
        </label>
      )}

      {advanced && !isCoordinator && (
        <div className="mt-3 space-y-3 rounded-xl border border-[#2a2b46] bg-[#111322] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Расширенный режим</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
            <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Модель</span><br />{device.modelId || device.definition?.model || "—"}</div>
            <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Производитель</span><br />{device.manufacturer || device.definition?.vendor || "—"}</div>
            <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Тип Zigbee</span><br />{device.type || "—"}</div>
            <div className="rounded-xl bg-[#181825] p-2"><span className="text-gray-500">Питание</span><br />{device.powerSource || "—"}</div>
            <div className="col-span-2 rounded-xl bg-[#181825] p-2 break-all"><span className="text-gray-500">Адрес (ieee / имя)</span><br />{device.ieeeAddress || "—"}{customName(device) ? ` · ${device.friendlyName}` : ""}</div>
          </div>
          {device.definition?.description && <div className="text-xs text-gray-400">{device.definition.description}</div>}
          <ImportantStateGrid device={device} profile={profile} />
          {writableControls.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Все параметры</div>
              {writableControls.map((c) => (
                <ZigbeeControlRenderer key={c.key} control={c} value={state[c.property]} busy={busy} onSend={send} />
              ))}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">JSON-команда</div>
            <div className="mt-2 flex gap-2">
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
                placeholder='{"state":"ON"}'
              />
              <button disabled={busy} onClick={sendRaw} className="rounded-lg border border-blue-500/60 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/10 disabled:opacity-60">Отправить</button>
            </div>
            <pre className="mt-3 max-h-44 overflow-auto rounded-lg bg-[#0d0f1b] p-3 text-[11px] text-gray-400">{JSON.stringify(state, null, 2)}</pre>
          </div>
        </div>
      )}
      {rawError && <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{rawError}</div>}
    </div>
  );
}

type DeviceLink = {
  id: string;
  enabled: boolean;
  name: string;
  source: { friendlyName: string; action: string };
  target: { friendlyName: string; command: string };
  createdAt?: string;
};

function actionValuesForDevice(device?: ZigbeeDevice): string[] {
  if (!device) return [];
  const fromCtrl = (device.controls || []).find((c) => c.property?.toLowerCase() === "action")?.values || [];
  return Array.from(new Set(fromCtrl.map(String).filter(Boolean)));
}

// Бинарные ключи-события датчиков: [метка для true, метка для false]
const LINK_BINARY_EVENTS: Record<string, [string, string]> = {
  occupancy: ["Движение появилось", "Движение пропало"],
  presence: ["Присутствие появилось", "Присутствие пропало"],
  contact: ["Закрылось", "Открылось"],
  water_leak: ["Протечка", "Сухо"],
  smoke: ["Задымление", "Норма"],
  gas: ["Утечка газа", "Норма"],
  vibration: ["Вибрация", "Покой"],
  tamper: ["Вскрытие", "OK"],
  carbon_monoxide: ["Угарный газ", "Норма"],
};

// Все ключи, по которым устройство может быть источником события.
function deviceEventKeys(device?: ZigbeeDevice): string[] {
  if (!device) return [];
  const keys = new Set<string>();
  (device.controls || []).forEach((c) => { if (c.property) keys.add(c.property.toLowerCase()); });
  Object.keys(device.state || {}).forEach((k) => { if (!k.startsWith("_")) keys.add(k.toLowerCase()); });
  return Array.from(keys);
}

// Любой датчик/устройство, которое может быть триггером (кнопка, датчик, реле/кран по state).
function isEventSource(device: ZigbeeDevice): boolean {
  if (device.friendlyName === "Coordinator") return false;
  const kind = inferDeviceProfile(device).kind;
  if (kind === "button" || kind === "switch") return true;
  const keys = deviceEventKeys(device);
  if (keys.includes("action")) return true;
  if (Object.keys(LINK_BINARY_EVENTS).some((k) => keys.includes(k))) return true;
  return keys.includes("state");
}

// Варианты «событий» источника для выпадающего списка.
function eventOptionsForDevice(device?: ZigbeeDevice): Array<{ value: string; label: string }> {
  if (!device) return [{ value: "any", label: "любое событие" }];
  const keys = deviceEventKeys(device);
  const opts: Array<{ value: string; label: string }> = [];
  const actions = actionValuesForDevice(device);
  if (keys.includes("action") || actions.length) {
    opts.push({ value: "any", label: "любое нажатие" });
    actions.forEach((a) => opts.push({ value: a, label: actionLabel(a) }));
  }
  for (const k of Object.keys(LINK_BINARY_EVENTS)) {
    if (!keys.includes(k)) continue;
    const [onL, offL] = LINK_BINARY_EVENTS[k];
    opts.push({ value: `${k}=true`, label: onL });
    opts.push({ value: `${k}=false`, label: offL });
  }
  if (keys.includes("state")) {
    opts.push({ value: "state=on", label: "Включился / открылся" });
    opts.push({ value: "state=off", label: "Выключился / закрылся" });
  }
  if (!opts.length) opts.push({ value: "any", label: "любое событие" });
  return opts;
}

function formatEventToken(token: string): string {
  if (!token || token === "any") return "любое событие";
  if (!token.includes("=")) return actionLabel(token);
  const [k, v] = token.split("=");
  const pair = LINK_BINARY_EVENTS[k];
  if (pair) return v === "true" ? pair[0] : pair[1];
  if (k === "state") return v === "on" ? "Включился / открылся" : "Выключился / закрылся";
  return `${k}=${v}`;
}

function isControllableTarget(device: ZigbeeDevice): boolean {
  const kind = inferDeviceProfile(device).kind;
  if (["valve", "relay", "light", "cover"].includes(kind)) return true;
  return getDeviceControls(device).some((c) => c.property.toLowerCase() === "state" && c.writable);
}

function commandOptionsForTarget(device?: ZigbeeDevice): Array<{ value: string; label: string }> {
  const kind = device ? inferDeviceProfile(device).kind : "";
  if (kind === "valve" || kind === "cover") {
    return [
      { value: "toggle", label: "Переключить (открыть ⇄ закрыть)" },
      { value: "open", label: "Открыть" },
      { value: "close", label: "Закрыть" },
    ];
  }
  return [
    { value: "toggle", label: "Переключить (вкл ⇄ выкл)" },
    { value: "on", label: "Включить" },
    { value: "off", label: "Выключить" },
  ];
}

function commandShortLabel(command: string): string {
  switch (command) {
    case "open": return "Открыть";
    case "close": return "Закрыть";
    case "on": return "Включить";
    case "off": return "Выключить";
    default: return "Переключить";
  }
}

function deviceShortLabel(device?: ZigbeeDevice): string {
  if (!device) return "—";
  const name = customName(device);
  if (name) return name;
  const profile = inferDeviceProfile(device);
  return `${profile.title} ${String(device.friendlyName || "").slice(-4)}`;
}

// Группировка связок по исходному устройству («по каждому датчику»).
function groupLinksBySource(links: DeviceLink[]): { friendlyName: string; links: DeviceLink[] }[] {
  const map = new Map<string, DeviceLink[]>();
  for (const l of links) {
    const fn = l.source.friendlyName;
    if (!map.has(fn)) map.set(fn, []);
    map.get(fn)!.push(l);
  }
  return Array.from(map.entries()).map(([friendlyName, items]) => ({ friendlyName, links: items }));
}

function pluralLinks(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "связок";
  if (b > 1 && b < 5) return "связки";
  if (b === 1) return "связка";
  return "связок";
}

function DeviceLinksSection({ devices }: { devices: ZigbeeDevice[] }) {
  const { showAlert } = useUiPopup();
  const [links, setLinks] = useState<DeviceLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [sourceFn, setSourceFn] = useState("");
  const [sourceAction, setSourceAction] = useState("any");
  const [targetFn, setTargetFn] = useState("");
  const [command, setCommand] = useState("toggle");

  const sources = devices.filter(isEventSource);
  const targets = devices.filter(isControllableTarget);
  const byName = (fn: string) => devices.find((d) => d.friendlyName === fn);
  const sourceDevice = byName(sourceFn);
  const targetDevice = byName(targetFn);
  const eventOptions = eventOptionsForDevice(sourceDevice);
  const commandOptions = commandOptionsForTarget(targetDevice);

  async function load() {
    try {
      const r = await fetch(`${API_BASE}/zigbee/links`, { cache: "no-store" });
      if (!r.ok) throw new Error(await readError(r));
      const data = await r.json();
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if ((!sourceFn || !byName(sourceFn)) && sources[0]) setSourceFn(sources[0].friendlyName);
    if ((!targetFn || !byName(targetFn)) && targets[0]) setTargetFn(targets[0].friendlyName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  useEffect(() => {
    if (!commandOptions.some((o) => o.value === command)) setCommand(commandOptions[0]?.value || "toggle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFn, devices]);

  useEffect(() => {
    if (!eventOptions.some((o) => o.value === sourceAction)) setSourceAction(eventOptions[0]?.value || "any");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFn, devices]);

  async function addLink() {
    if (!sourceFn || !targetFn) {
      showAlert({ tone: "error", title: "Связка", message: "Выберите кнопку-источник и устройство-цель." });
      return;
    }
    if (links.some((l) => l.source.friendlyName === sourceFn && l.source.action === sourceAction && l.target.friendlyName === targetFn && l.target.command === command)) {
      showAlert({ tone: "error", title: "Связка", message: "Такая связка уже существует." });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/zigbee/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${deviceShortLabel(sourceDevice)} → ${deviceShortLabel(targetDevice)}`,
          source: { friendlyName: sourceFn, action: sourceAction },
          target: { friendlyName: targetFn, command },
        }),
      });
      if (!r.ok) throw new Error(await readError(r));
      showAlert({ tone: "info", title: "Связка", message: "Связка создана." });
      await load();
    } catch (e: unknown) {
      showAlert({ tone: "error", title: "Связка", message: e instanceof Error ? e.message : "Не удалось создать связку" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleLink(id: string, enabled: boolean) {
    await fetch(`${API_BASE}/zigbee/links/${id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }).catch(() => {});
    await load();
  }

  async function removeLink(id: string) {
    await fetch(`${API_BASE}/zigbee/links/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  async function testLink(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/zigbee/links/${id}/test`, { method: "POST" });
      if (!r.ok) throw new Error(await readError(r));
      showAlert({ tone: "info", title: "Связка", message: "Команда отправлена на устройство-цель." });
    } catch (e: unknown) {
      showAlert({ tone: "error", title: "Связка", message: e instanceof Error ? e.message : "Ошибка теста" });
    } finally {
      setBusy(false);
    }
  }

  const selectCls = "rounded-lg border border-[#2a2b46] bg-[#111322] px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500";

  return (
    <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4 shadow-sm">
      <div className="text-lg font-bold text-gray-100">Связки устройств</div>
      <div className="mt-1 text-xs text-gray-400">Когда датчик или кнопка присылает событие (движение, открытие, протечка, нажатие…) — выполнить действие на другом устройстве. Например: движение → включить реле, или нажатие кнопки → открыть/закрыть кран.</div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto_1fr_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1 text-xs text-gray-500">Когда (источник)
          <select className={selectCls} value={sourceFn} onChange={(e) => setSourceFn(e.target.value)}>
            {sources.length === 0 && <option value="">нет датчиков</option>}
            {sources.map((d) => <option key={d.friendlyName} value={d.friendlyName}>{deviceShortLabel(d)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Событие
          <select className={selectCls} value={sourceAction} onChange={(e) => setSourceAction(e.target.value)}>
            {eventOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="hidden pb-2 text-center text-gray-500 md:block">→</div>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Сделать (цель)
          <select className={selectCls} value={targetFn} onChange={(e) => setTargetFn(e.target.value)}>
            {targets.length === 0 && <option value="">нет устройств</option>}
            {targets.map((d) => <option key={d.friendlyName} value={d.friendlyName}>{deviceShortLabel(d)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Действие
          <select className={selectCls} value={command} onChange={(e) => setCommand(e.target.value)}>
            {commandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button disabled={busy || !sourceFn || !targetFn} onClick={addLink} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">Добавить</button>
      </div>

      <div className="mt-4 space-y-3">
        {links.length === 0 ? (
          <div className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3 text-sm text-gray-500">Связок пока нет. Создайте первую выше.</div>
        ) : (
          groupLinksBySource(links).map((group) => {
            const src = byName(group.friendlyName);
            return (
              <div key={group.friendlyName} className="rounded-xl border border-[#2a2b46] bg-[#181825] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-semibold text-gray-100">
                    {src ? deviceShortLabel(src) : group.friendlyName}
                  </div>
                  <span className="shrink-0 rounded-full border border-[#2a2b46] px-2 py-0.5 text-[11px] text-gray-400">{group.links.length} {pluralLinks(group.links.length)}</span>
                </div>
                <div className="space-y-2">
                  {group.links.map((link) => {
                    const tgt = byName(link.target.friendlyName);
                    return (
                      <div key={link.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-[#2a2b46] bg-[#131522] p-2.5 ${link.enabled ? "" : "opacity-60"}`}>
                        <div className="min-w-0 flex-1 text-xs">
                          <span className="text-amber-200">{formatEventToken(link.source.action)}</span>
                          <span className="text-gray-500">{" → "}</span>
                          <span className="font-medium text-gray-100">{tgt ? deviceShortLabel(tgt) : link.target.friendlyName}</span>
                          <span className="text-gray-400"> · {commandShortLabel(link.target.command)}</span>
                        </div>
                        <button onClick={() => testLink(link.id)} disabled={busy} className="rounded-lg border border-[#2a2b46] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Тест</button>
                        <button onClick={() => toggleLink(link.id, !link.enabled)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${link.enabled ? "bg-emerald-600/20 text-emerald-200" : "border border-[#2a2b46] text-gray-300 hover:bg-[#1b1d31]"}`}>{link.enabled ? "Вкл" : "Выкл"}</button>
                        <button onClick={() => removeLink(link.id)} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10">Удалить</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Самостоятельная панель связок для вкладки «Автоматизация»:
// сама подтягивает список устройств из /api/zigbee/status (без зависимости от ZigbeePanel).
export const DeviceLinksPanel: React.FC = () => {
  const [devices, setDevices] = useState<ZigbeeDevice[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/zigbee/status`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setDevices(Array.isArray(d.devices) ? d.devices : []);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = window.setInterval(load, 7000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return <DeviceLinksSection devices={devices} />;
};

const ZigbeePanel: React.FC = () => {
  const { showAlert } = useUiPopup();
  const [status, setStatus] = useState<ZigbeeStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem("zigbee.advanced") === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("zigbee.advanced", advanced ? "1" : "0"); } catch { /* ignore */ }
  }, [advanced]);

  const frontendHref = useMemo(() => {
    if (status.frontendUrl && !status.frontendUrl.includes("localhost")) return status.frontendUrl;
    if (typeof window === "undefined") return status.frontendUrl || "http://localhost:8081";
    return `${window.location.protocol}//${window.location.hostname}:8081`;
  }, [status.frontendUrl]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/zigbee/status`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setStatus({ ...emptyStatus, ...(data || {}) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось получить статус Zigbee";
      showAlert({ tone: "error", title: "Zigbee", message });
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function permitJoin(enabled: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/zigbee/permit-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, seconds: 254 }),
      });
      if (!response.ok) throw new Error(await readError(response));
      showAlert({ tone: "info", title: "Zigbee", message: enabled ? "Добавление устройств открыто на 254 секунды." : "Добавление устройств закрыто." });
      await load(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Команда не выполнена";
      showAlert({ tone: "error", title: "Zigbee", message });
    } finally {
      setBusy(false);
    }
  }

  async function bridgeAction(action: "restart" | "health-check") {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/zigbee/bridge/${action}`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      showAlert({ tone: "info", title: "Zigbee2MQTT", message: action === "restart" ? "Запрошен перезапуск bridge." : "Запрошена проверка health check." });
      await load(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Команда не выполнена";
      showAlert({ tone: "error", title: "Zigbee2MQTT", message });
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand(friendlyName: string, payload: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}/zigbee/devices/${encodeURIComponent(friendlyName)}/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await readError(response));
    showAlert({ tone: "info", title: "Zigbee", message: advanced ? `Команда отправлена: ${JSON.stringify(payload)}` : "Команда отправлена" });
    await load(true);
  }

  async function setNotify(friendlyName: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/zigbee/devices/${encodeURIComponent(friendlyName)}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) throw new Error(await readError(response));
    showAlert({ tone: "info", title: "Оповещения", message: enabled ? "Оповещения о смене состояния включены." : "Оповещения выключены." });
    await load(true);
  }

  const filteredDevices = status.devices.filter((device) => {
    if (!query.trim()) return true;
    const controls = getDeviceControls(device).map((control) => `${control.label} ${control.property}`).join(" ");
    const haystack = [device.friendlyName, device.ieeeAddress, device.modelId, device.manufacturer, device.definition?.description, controls].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="h-full min-h-0 overflow-auto pr-1 space-y-4">
      <div className="rounded-2xl border border-[#2a2b46] bg-darkblue p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-100">Zigbee</div>
            <div className="mt-1 text-sm text-gray-400">ZBDongle-P → Zigbee2MQTT → MQTT → панель умного дома</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.mqttConnected ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"}`}>MQTT {status.mqttConnected ? "online" : "offline"}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.bridgeState === "online" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>Bridge {status.bridgeState}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.permitJoin ? "bg-blue-500/20 text-blue-200" : "bg-[#1b1d31] text-gray-300"}`}>Pairing {status.permitJoin ? "открыт" : "закрыт"}</span>
          </div>
        </div>

        {status.lastError && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{status.lastError}</div>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Устройства</div><div className="text-xl font-bold text-gray-100">{status.onlineDevices}/{status.devicesCount}</div></div>
          <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">MQTT</div><div className="truncate text-sm font-semibold text-gray-200">{status.mqttUrl}</div></div>
          <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Base topic</div><div className="truncate text-sm font-semibold text-gray-200">{status.baseTopic}</div></div>
          <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Последний пакет</div><div className="truncate text-sm font-semibold text-gray-200">{formatDate(status.lastSeenAt)}</div></div>
        </div>

        {status.permitJoinUntil && <div className="mt-3 text-xs text-blue-200">Добавление новых устройств открыто до {formatDate(status.permitJoinUntil)}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button disabled={busy || loading} onClick={() => permitJoin(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">Добавить устройство</button>
          <button disabled={busy || loading} onClick={() => permitJoin(false)} className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Закрыть pairing</button>
          <button disabled={busy || loading} onClick={() => bridgeAction("health-check")} className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Health check</button>
          <button disabled={busy || loading} onClick={() => bridgeAction("restart")} className="rounded-lg border border-amber-500/50 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-60">Restart bridge</button>
          <button disabled={loading} onClick={() => load()} className="rounded-lg border border-[#2a2b46] px-4 py-2 text-sm text-gray-200 hover:bg-[#1b1d31] disabled:opacity-60">Обновить</button>
          <a href={frontendHref} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-500/50 px-4 py-2 text-sm text-blue-200 hover:bg-blue-500/10">Открыть Zigbee2MQTT</a>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2a2b46] bg-[#131522] p-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-gray-100">Zigbee устройства</div>
          <div className="text-xs text-gray-400">Карточка появляется автоматически: имя, статус и управление. Команды JSON и техника — в расширенном режиме.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={advanced}
            onClick={() => setAdvanced((v) => !v)}
            title="Показать модели, адреса и JSON-команды"
            className="flex items-center gap-2 rounded-xl border border-[#2a2b46] bg-[#111322] px-3 py-2 text-sm text-gray-200 hover:bg-[#1b1d31]"
          >
            <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${advanced ? "bg-blue-600" : "bg-[#2a2b46]"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${advanced ? "translate-x-4" : "translate-x-0"}`} />
            </span>
            Расширенный режим
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, модели, методу"
            className="w-full md:w-72 rounded-xl border border-[#2a2b46] bg-[#111322] px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5 text-gray-300">Загрузка Zigbee...</div>
      ) : filteredDevices.length === 0 ? (
        <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5 text-gray-400">Устройств пока нет. Открой pairing и добавь первое Zigbee-устройство.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredDevices.map((device) => <ZigbeeDeviceCard key={device.friendlyName} device={device} advanced={advanced} onCommand={sendCommand} onSetNotify={setNotify} />)}
        </div>
      )}
    </div>
  );
};

export default ZigbeePanel;
