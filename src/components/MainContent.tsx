import React, { useState } from "react";
import LightSlider from "./Light/LightSlider";
import BlindsControlRoom from "./Blinds/BlindsControlRoom";
import BlindsControlKitchen from "./Blinds/BlindsControlKitchen";
import BlindsControlHoll from "./Blinds/BlindsControlHoll";
import LightEffects from "./Light/LightEffects";
import FloorHeatingWidget from "./Floor/FloorHeatingWidget";
import FloorHeatingWidgetBath from "./Floor/FloorHeatingWidgetBath";
import TrafficWidget from "./TrafficWidget";
import WaterValves from "./Water/WaterValves";
import WeatherTab from "./Weather/WeatherTab";
import LeakSensorsRow from "./Water/LeakSensorsRow";
import LampBulbPrihozhaya from "./LightOsn/LampBulbPrihozhaya";
import LampBulbHoll from "./LightOsn/LampBulbHoll";
import LampBulbKitchen from "./LightOsn/LampBulbKitchen";
import LampBulbBath from "./LightOsn/LampBulbBath";
import LampBulbGarderob from "./LightOsn/LampBulbGarderob";
import AutomationOverview from "./Automation/AutomationOverview";
import ScenarioPanel from "./Automation/ScenarioPanel";
import RulesPanel from "./Automation/RulesPanel";
import DeviceHeartbeatPanel from "./Automation/DeviceHeartbeatPanel";
import EventLogPanel from "./Automation/EventLogPanel";
import SensorAdminPanel from "./Automation/SensorAdminPanel";
import SensorsGrid from "./Water/SensorsGrid";
import HomeStatusChips from "./HomeStatusChips";
import NotificationBell from "./NotificationBell";
import SystemPanel from "./System/SystemPanel";
import TelegramSettingsPanel from "./Settings/TelegramSettingsPanel";
import VpnSettingsPanel from "./Settings/VpnSettingsPanel";
import ZigbeePanel, { DeviceLinksPanel } from "./Zigbee/ZigbeePanel";
import IrRemotesPanel from "./IR/IrRemotesPanel";
import IrControls from "./IR/IrControls";

type TabId = "weather" | "control" | "automation" | "sensors" | "system" | "settings" | "traffic";

const TABS: { id: TabId; label: string }[] = [
  { id: "weather", label: "Погода" },
  { id: "control", label: "Управление" },
  { id: "automation", label: "Автоматизация" },
  { id: "sensors", label: "Датчики" },
  { id: "system", label: "Система" },
  { id: "settings", label: "Настройки" },
  { id: "traffic", label: "Пробки" },
];

interface MainContentProps {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  onOpenNav?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({ theme, setTheme, onOpenNav }) => {
  const [tab, setTab] = useState<TabId>("weather");
  const [sensorsSection, setSensorsSection] = useState<"zigbee" | "ir" | "arduino">("zigbee");
  const [sensorTab, setSensorTab] = useState<"list" | "add">("list");

  return (
    <div className="app-content text-gray-150 p-3 sm:p-4 h-screen flex flex-col overflow-hidden">
      {/* Верхняя панель: на мобиле — меню+индикаторы+уведомления, лента вкладок отдельной строкой;
          на десктопе (lg) — одна строка, как раньше (индикаторы слева, вкладки+колокольчик справа). */}
      <div className="mb-3 sm:mb-4 shrink-0 flex flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap lg:gap-4">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Погода и меню"
          className="order-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#232445] bg-[#1a1b2d] text-gray-200 transition hover:border-blue-500 hover:text-white lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="order-2 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar sm:gap-3">
          <LeakSensorsRow />
          <HomeStatusChips />
        </div>
        <div className="order-3 shrink-0 lg:order-4">
          <NotificationBell />
        </div>
        <div className="order-4 -mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 no-scrollbar lg:order-3 lg:mx-0 lg:w-auto lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 lg:justify-end">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all duration-150
                ${tab === t.id
                  ? "bg-blue-700 border-blue-400 shadow-xl text-gray-100"
                  : "bg-[#1a1b2d] border-[#232445] text-gray-350 hover:bg-blue-900 hover:border-blue-500"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
      {tab === "weather" ? (
        <WeatherTab />
      ) : tab === "control" ? (
        <div className="h-full min-h-0 overflow-auto pr-1">
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Освещение</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-start">
                <LampBulbPrihozhaya />
                <LampBulbHoll />
                <LampBulbKitchen />
                <LampBulbBath />
                <LampBulbGarderob />
              </div>
            </div>

            <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Подсветка</div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
                <div className="h-full">
                  <LightSlider />
                </div>
                <div className="h-full">
                  <LightEffects />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Тёплый пол</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FloorHeatingWidget />
                <FloorHeatingWidgetBath />
              </div>
            </div>

            <IrControls />

            <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Жалюзи</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <BlindsControlKitchen />
                <BlindsControlHoll />
                <BlindsControlRoom />
              </div>
            </div>

            <WaterValves />
          </div>
        </div>
      ) : tab === "automation" ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scroll flex flex-col gap-3 pr-1">
          <AutomationOverview />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="h-[58vh]"><ScenarioPanel /></div>
            <div className="h-[58vh]"><RulesPanel /></div>
          </div>
          <DeviceLinksPanel />
          <div className="h-[55vh]"><EventLogPanel /></div>
        </div>
      ) : tab === "sensors" ? (
        <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
          <div className="shrink-0 flex items-center justify-between gap-3 rounded-2xl border border-[#2a2b46] bg-[#131522] p-3">
            <div>
              <div className="text-lg font-bold text-gray-150">Датчики</div>
              <div className="text-xs text-gray-400 mt-0.5">Zigbee-устройства и датчики Arduino в одном разделе.</div>
            </div>
            <div className="flex gap-2 rounded-xl border border-[#2a2b46] bg-[#111322] p-1">
              <button
                type="button"
                onClick={() => setSensorsSection("zigbee")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  sensorsSection === "zigbee"
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-350 hover:bg-[#1b1d31] hover:text-gray-100"
                }`}
              >
                Zigbee
              </button>
              <button
                type="button"
                onClick={() => setSensorsSection("ir")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  sensorsSection === "ir"
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-350 hover:bg-[#1b1d31] hover:text-gray-100"
                }`}
              >
                ИК устройства
              </button>
              <button
                type="button"
                onClick={() => setSensorsSection("arduino")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  sensorsSection === "arduino"
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-350 hover:bg-[#1b1d31] hover:text-gray-100"
                }`}
              >
                Датчики Arduino
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {sensorsSection === "zigbee" ? (
              <ZigbeePanel />
            ) : sensorsSection === "ir" ? (
              <div className="h-full min-h-0 overflow-auto pr-1">
                <IrRemotesPanel />
              </div>
            ) : (
              <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
                <div className="shrink-0 flex items-center justify-between gap-3 rounded-2xl border border-[#2a2b46] bg-[#131522] p-3">
                  <div>
                    <div className="text-lg font-bold text-gray-150">Датчики Arduino</div>
                    <div className="text-xs text-gray-400 mt-0.5">Состояние датчиков отдельно от добавления и настройки новых устройств.</div>
                  </div>
                  <div className="flex gap-2 rounded-xl border border-[#2a2b46] bg-[#111322] p-1">
                    <button
                      type="button"
                      onClick={() => setSensorTab("list")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        sensorTab === "list"
                          ? "bg-blue-600 text-white shadow"
                          : "text-gray-350 hover:bg-[#1b1d31] hover:text-gray-100"
                      }`}
                    >
                      Список
                    </button>
                    <button
                      type="button"
                      onClick={() => setSensorTab("add")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        sensorTab === "add"
                          ? "bg-blue-600 text-white shadow"
                          : "text-gray-350 hover:bg-[#1b1d31] hover:text-gray-100"
                      }`}
                    >
                      Добавить датчик
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  {sensorTab === "list" ? (
                    <div className="h-full min-h-0 overflow-auto pr-1">
                      <SensorsGrid />
                    </div>
                  ) : (
                    <div className="h-full min-h-0 overflow-hidden">
                      <SensorAdminPanel />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === "system" ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scroll flex flex-col gap-3 pr-1">
          <div className="h-[78vh] shrink-0"><SystemPanel /></div>
          <div className="h-[62vh] shrink-0"><DeviceHeartbeatPanel /></div>
        </div>
      ) : tab === "settings" ? (
        <div className="h-full min-h-0 overflow-auto py-4">
          <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="rounded-2xl border border-[#2a2b46] bg-darkblue p-6 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-150">Настройки интерфейса</h3>
            <p className="text-sm text-gray-400 mt-2">Выбери тему отображения панели управления.</p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`rounded-2xl border p-5 text-left transition ${theme === "dark" ? "border-blue-500 bg-[#1b1d31] shadow-lg" : "border-[#2a2b46] bg-[#131522]"}`}
              >
                <div className="text-lg font-semibold text-gray-150">Тёмная тема</div>
                <div className="text-sm text-gray-400 mt-1">Текущая базовая тема панели.</div>
                <div className="mt-4 rounded-xl border border-[#2a2b46] bg-[#181825] p-4">
                  <div className="h-3 w-24 rounded bg-blue-500 mb-3"></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg bg-[#22243c]"></div>
                    <div className="h-16 rounded-lg bg-[#22243c]"></div>
                    <div className="h-16 rounded-lg bg-[#22243c]"></div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`rounded-2xl border p-5 text-left transition ${theme === "light" ? "border-blue-500 bg-[#f8fbff] shadow-lg" : "border-[#2a2b46] bg-[#131522]"}`}
              >
                <div className="text-lg font-semibold text-gray-150">Светлая тема</div>
                <div className="text-sm text-gray-400 mt-1">Светлый интерфейс для дневной работы.</div>
                <div className="mt-4 rounded-xl border border-[#d7dce5] bg-white p-4">
                  <div className="h-3 w-24 rounded bg-blue-400 mb-3"></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg bg-[#eef3f8]"></div>
                    <div className="h-16 rounded-lg bg-[#eef3f8]"></div>
                    <div className="h-16 rounded-lg bg-[#eef3f8]"></div>
                  </div>
                </div>
              </button>
            </div>
          </div>
          <div className="settings-stack">
            <VpnSettingsPanel />
            <TelegramSettingsPanel />
          </div>
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0 overflow-hidden">
          <TrafficWidget />
        </div>
      )}
      </div>
    </div>
  );
};

export default MainContent;
