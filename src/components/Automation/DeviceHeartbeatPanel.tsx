import React, { useEffect, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, "");

interface DeviceItem {
  id: string;
  name: string;
  source: string;
  effectiveStatus?: "online" | "offline" | "unknown";
  lastSeenAt?: string;
}

const DeviceHeartbeatPanel: React.FC = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);

  useEffect(() => {
    let mounted = true;
    async function fetchDevices() {
      try {
        const resp = await fetch(`${API_BASE}/devices`);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        if (mounted) setDevices(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setDevices([]);
      }
    }
    fetchDevices();
    const timer = window.setInterval(fetchDevices, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="h-full min-h-0 rounded-xl border border-[#2a2b46] bg-darkblue p-4 shadow-sm flex flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h3 className="text-lg font-bold text-gray-150">Heartbeat устройств</h3>
        <p className="text-xs text-gray-400 mt-1">Последняя активность и доступность</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {devices.length === 0 && <div className="text-sm text-gray-400">Устройства пока не зарегистрированы</div>}
        {devices.map((device) => (
          <div key={device.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#2a2b46] bg-[#1b1d31] px-3 py-2.5">
            <div>
              <div className="font-semibold text-gray-150 truncate">{device.name || device.id}</div>
              <div className="text-xs text-gray-500 mt-1">{device.source} • {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("ru-RU") : "нет heartbeat"}</div>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${device.effectiveStatus === "online" ? "bg-emerald-500/20 text-emerald-300" : device.effectiveStatus === "offline" ? "bg-amber-500/20 text-amber-200" : "bg-gray-500/20 text-gray-300"}`}>
              {device.effectiveStatus || "unknown"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceHeartbeatPanel;
