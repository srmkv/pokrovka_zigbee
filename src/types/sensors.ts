export type SensorStatus = "dry" | "leak" | "unknown";
export type DeviceStatus = "online" | "offline" | "unknown";

export interface SensorRuntimeState {
  sensorId: string;
  status: SensorStatus;
  deviceStatus?: DeviceStatus;
  lastTriggerAt?: string | null;
  lastSeenAt?: string | null;
  lastPayload?: unknown;
  resetVersion?: number;
  lastResetAt?: string | null;
  maintenanceUntil?: string | null;
  maintenanceReason?: string | null;
  maintenanceActive?: boolean;
}

export interface SensorItem {
  id: string;
  name: string;
  location: string;
  type: string;
  icon?: "drop" | "washing-machine" | "dishwasher" | string;
  deviceId: string;
  resettable: boolean;
  ip?: string;
  mac?: string;
  firmwareVersion?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  eventEndpoint?: string | null;
  commandEndpoint?: string | null;
  resetEndpoint?: string | null;
  state?: SensorRuntimeState;
}
