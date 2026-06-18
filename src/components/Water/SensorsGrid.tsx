import React from "react";
import { useSensorsRegistry } from "../../hooks/useSensorsRegistry";
import UniversalSensorCard from "./UniversalSensorCard";

const SensorsGrid: React.FC = () => {
  const { sensors, loading, error } = useSensorsRegistry();

  if (loading) {
    return <div className="rounded-2xl border border-[#2a2b46] bg-[#131522] p-4 text-gray-300">Загрузка датчиков...</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-red-500/50 bg-[#311b22] p-4 text-red-200">Не удалось загрузить датчики: {error}</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sensors.map((sensor) => (
        <UniversalSensorCard key={sensor.id} sensor={sensor} compact />
      ))}
    </div>
  );
};

export default SensorsGrid;
