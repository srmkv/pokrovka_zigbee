// src/components/Weather/conditionMap.ts

// 1) ЛЕГАСИ: поддержка старых импортов из Яндекса
//    key — строковое условие (как раньше), value — ключ для твоих иконок
export const conditionMap: Record<string, string> = {
  // ясно/облачно
  clear: "Clear",
  "partly-cloudy": "LightCloud",
  cloudy: "LightCloud",
  overcast: "HeavyCloud",

  // туман
  fog: "LightCloud",
  "light-fog": "LightCloud",

  // дождь/ливни
  "light-rain": "LightRain",
  rain: "Shower",
  "moderate-rain": "Shower",
  "heavy-rain": "HeavyRain",
  showers: "Shower",

  // снег/мокрый снег/ледяной дождь
  sleet: "Sleet",
  "light-snow": "Snow",
  snow: "Snow",
  "heavy-snow": "Snow",
  "ice-rain": "Sleet",

  // гроза/град
  thunderstorm: "Thunderstorm",
  "thunderstorm-with-hail": "Hail",
};

// 2) НОВОЕ: подписи по WMO для Open-Meteo
export function conditionRuByWmo(code?: number | null): string {
  if (code == null) return "Без данных";
  switch (code) {
    case 0: return "Ясно";
    case 1: return "Преимущественно ясно";
    case 2: return "Переменная облачность";
    case 3: return "Пасмурно";
    case 45:
    case 48: return "Туман";
    case 51:
    case 53:
    case 55: return "Морось";
    case 56:
    case 57: return "Ледяная морось";
    case 61: return "Слабый дождь";
    case 63: return "Дождь";
    case 65: return "Сильный дождь";
    case 66:
    case 67: return "Ледяной дождь";
    case 71: return "Слабый снег";
    case 73: return "Снег";
    case 75: return "Сильный снег";
    case 80: return "Кратковременный дождь";
    case 81: return "Ливень";
    case 82: return "Сильный ливень";
    case 85:
    case 86: return "Снегопад";
    case 95: return "Гроза";
    case 96:
    case 99: return "Гроза с градом";
    default: return "Осадки";
  }
}
