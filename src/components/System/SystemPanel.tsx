import React, { useEffect, useMemo, useState } from "react";

type SystemStatus = any;

function formatDuration(sec?: number) {
  const total = Math.max(0, Math.floor(sec || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d} д ${h} ч ${m} мин`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function StatCard({ label, value, hint, tone = "normal" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "normal" | "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "border-emerald-500/40 bg-emerald-500/10" : tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : tone === "bad" ? "border-red-500/50 bg-red-500/10" : "border-[#2a2b46] bg-[#131522]";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

const SystemPanel: React.FC = () => {
  const API_BASE = useMemo(() => (process.env.REACT_APP_API_BASE || "/api").replace(/\/$/, ""), []);
  const [data, setData] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const resp = await fetch(`${API_BASE}/system/status`);
        if (!resp.ok) throw new Error(String(resp.status));
        const json = await resp.json();
        if (!mounted) return;
        setData(json);
        setError(null);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Ошибка загрузки статуса системы");
      }
    }
    load();
    const interval = window.setInterval(load, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [API_BASE]);

  if (error) {
    return <div className="rounded-2xl border border-red-500/50 bg-[#311b22] p-5 text-red-100">Не удалось загрузить систему: {error}</div>;
  }

  if (!data) {
    return <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5 text-gray-300">Загрузка статуса NanoPi...</div>;
  }

  const summary = data.summary || {};
  const memory = data.nanopi?.memory || {};
  const disk = data.nanopi?.disk || {};
  const load = Array.isArray(data.nanopi?.loadavg) ? data.nanopi.loadavg : [];

  return (
    <div className="h-full min-h-0 overflow-auto pr-1 space-y-4">
      <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-100">{data.name || "NanoPi"}</div>
            <div className="mt-1 text-sm text-gray-400">{data.location || "Дом"} · {data.hostname} · {data.platform}/{data.arch}</div>
          </div>
          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">Backend online</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Статус дома" value={summary.overallStatus || "normal"} tone={summary.overallStatus === "critical" ? "bad" : summary.overallStatus === "warning" ? "warn" : "good"} hint={`тревог: ${summary.activeLeaks || 0}`} />
        <StatCard label="Устройства online" value={`${summary.onlineDevices || 0}/${summary.totalDevices || 0}`} tone={(summary.offlineDevices || 0) > 0 ? "warn" : "good"} hint={`offline: ${summary.offlineDevices || 0}`} />
        <StatCard label="Uptime NanoPi" value={formatDuration(data.nanopi?.uptimeSeconds)} hint={`backend: ${formatDuration(data.backend?.uptimeSeconds)}`} />
        <StatCard label="Температура CPU" value={data.nanopi?.cpuTempC == null ? "—" : `${data.nanopi.cpuTempC}°C`} tone={data.nanopi?.cpuTempC > 75 ? "warn" : "normal"} hint={data.nanopi?.cpuModel || "CPU"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5">
          <div className="text-lg font-bold text-gray-100">Ресурсы</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-300"><span>RAM</span><span>{memory.usedMb} / {memory.totalMb} МБ · {memory.usedPercent}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-[#22243c]"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(memory.usedPercent || 0, 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm text-gray-300"><span>Disk</span><span>{disk.usedGb} / {disk.sizeGb} ГБ · {disk.usePercent}</span></div>
              <div className="mt-2 h-2 rounded-full bg-[#22243c]"><div className="h-2 rounded-full bg-emerald-500" style={{ width: disk.usePercent || "0%" }} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm text-gray-300">
              <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Load 1m</div><div className="font-semibold">{Number(load[0] || 0).toFixed(2)}</div></div>
              <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Load 5m</div><div className="font-semibold">{Number(load[1] || 0).toFixed(2)}</div></div>
              <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Load 15m</div><div className="font-semibold">{Number(load[2] || 0).toFixed(2)}</div></div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-5">
          <div className="text-lg font-bold text-gray-100">Файлы и версии</div>
          <div className="mt-4 space-y-3 text-sm text-gray-300">
            <div className="flex justify-between gap-4"><span className="text-gray-500">Node.js</span><span>{data.nodeVersion}</span></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">API port</span><span>{data.backend?.port}</span></div>
            <div className="break-all rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">state.json</div>{data.paths?.statePath}</div>
            <div className="break-all rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">sensors.json</div>{data.paths?.sensorsPath}</div>
            <div className="rounded-xl bg-[#181825] p-3"><div className="text-xs text-gray-500">Последнее событие</div>{summary.lastEvent?.title || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemPanel;
