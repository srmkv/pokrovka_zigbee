// src/components/Weather/WeatherIconMap.ts
// WMO weathercode → имя png из public/images
// файлы: Clear.png, LightCloud.png, HeavyCloud.png, LightRain.png,
// HeavyRain.png, Shower.png, Thunderstorm.png, Sleet.png, Snow.png, Hail.png

export function iconByWmo(code?: number | null): string {
  if (code == null) return "LightCloud.png";

  switch (code) {
    // Ясно / облачность
    case 0: return "Clear.png";          // ясно
    case 1: return "LightCloud.png";     // преимущественно ясно
    case 2: return "LightCloud.png";     // переменная облачность
    case 3: return "HeavyCloud.png";     // пасмурно

    // Туман
    case 45:                             // туман
    case 48: return "LightCloud.png";    // туман с отложением изморози

    // Морось
    case 51: return "LightRain.png";     // слабая морось
    case 53: return "LightRain.png";     // умеренная морось
    case 55: return "LightRain.png";     // сильная морось

    // Ледяная морось
    case 56:                             // слабая
    case 57: return "Sleet.png";         // сильная

    // Дождь
    case 61: return "LightRain.png";     // слабый дождь
    case 63: return "Shower.png";        // дождь
    case 65: return "HeavyRain.png";     // сильный дождь

    // Ледяной дождь
    case 66:                             // слабый
    case 67: return "Sleet.png";         // сильный

    // Снег
    case 71: return "Snow.png";          // слабый снег
    case 73: return "Snow.png";          // снег
    case 75: return "Snow.png";          // сильный снег
    case 77: return "Snow.png";          // снежные зёрна

    // Ливневые дожди
    case 80: return "Shower.png";        // слабые ливни
    case 81: return "Shower.png";        // ливни (можно поменять на HeavyRain.png если хочешь агрессивнее)
    case 82: return "HeavyRain.png";     // сильные ливни

    // Ливневый снег
    case 85:                             // слабый
    case 86: return "Snow.png";          // сильный

    // Гроза
    case 95: return "Thunderstorm.png";  // гроза
    case 96:                             // гроза с небольшим градом
    case 99: return "Hail.png";          // гроза с сильным градом

    default:
      return "LightCloud.png";           // запасной вариант
  }
}
