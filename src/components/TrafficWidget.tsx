import React, { useEffect, useRef } from "react";

const YANDEX_MAP_KEY = "57233988-ba9e-4570-914d-6bb5102573b3";

const TrafficWidget: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mapInstance: any;

    function loadScript() {
      return new Promise((resolve) => {
        if (document.getElementById("yandex-map-script")) {
          resolve(true);
          return;
        }
        const script = document.createElement("script");
        script.id = "yandex-map-script";
        script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${YANDEX_MAP_KEY}`;
        script.type = "text/javascript";
        script.onload = resolve;
        document.body.appendChild(script);
      });
    }

    async function initMap() {
      await loadScript();
      const ymaps = (window as any).ymaps;
      ymaps.ready(() => {
        if (!mapRef.current) return;
        mapInstance = new ymaps.Map(mapRef.current, {
          center: [56.3269, 44.0059], // Нижний Новгород
          zoom: 12,
          controls: ["zoomControl"],
        });

        // Добавляем слой пробок сразу
        const trafficProvider = new ymaps.traffic.provider.Actual({});
        trafficProvider.setMap(mapInstance);
      });
    }

    initMap();

    // Чистим карту при размонтировании
    return () => {
      if (mapInstance) mapInstance.destroy();
    };
  }, []);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "750px",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 4px 32px #0002",
      }}
    />
  );
};

export default TrafficWidget;
