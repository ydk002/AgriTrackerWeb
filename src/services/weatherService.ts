import type { WeatherData, WeatherAlert } from '../types';

export function getWeatherConditionText(code: number): string {
  if (code === 0) return 'Clear Sky ☀️';
  if (code >= 1 && code <= 3) return 'Partly Cloudy ⛅';
  if (code === 45 || code === 48) return 'Foggy 🌫️';
  if (code >= 51 && code <= 57) return 'Drizzle 🌦️';
  if (code >= 61 && code <= 67) return 'Rainy 🌧️';
  if (code >= 71 && code <= 77) return 'Snowing ❄️';
  if (code >= 80 && code <= 82) return 'Rain Showers 🌧️';
  if (code === 85 || code === 86) return 'Snow Showers 🌨️';
  if (code === 95) return 'Thunderstorm ⛈️';
  if (code === 96 || code === 99) return 'Thunderstorm with Hail ⛈️';
  return 'Overcast ☁️';
}

export function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 3) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '☁️';
}

export async function fetchFarmWeather(latitude: number, longitude: number): Promise<{
  data: WeatherData;
  alerts: WeatherAlert[];
}> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch weather from Open-Meteo');
  }

  const json = await res.json();
  const current = json.current;
  const daily = json.daily;

  const weatherData: WeatherData = {
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    humidity: current.relative_humidity_2m,
    precipitation: current.precipitation ?? 0,
    daily: daily?.time?.map((date: string, i: number) => ({
      date,
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      weatherCode: daily.weather_code[i],
      precipProbability: daily.precipitation_probability_max[i] ?? 0,
    })),
  };

  const alerts: WeatherAlert[] = [];
  const temp = weatherData.temperature;
  const code = weatherData.weatherCode;
  const wind = weatherData.windSpeed;

  if (code === 95 || code === 96 || code === 99) {
    alerts.push({
      type: 'storm',
      severity: 'danger',
      message: 'Severe Storm Alert: Thunderstorms detected in this farm area. Shelter livestock and secure open field equipment.',
    });
  }

  if (temp <= -5) {
    alerts.push({
      type: 'frost',
      severity: 'danger',
      message: `Extreme Frost Warning (${temp}°C): Protect cold-sensitive crops and check animal water sources.`,
    });
  } else if (temp <= 2) {
    alerts.push({
      type: 'frost',
      severity: 'warning',
      message: `Near-Freezing Temperatures (${temp}°C): Frost risk for sensitive crops.`,
    });
  }

  if (temp >= 35) {
    alerts.push({
      type: 'heat',
      severity: 'danger',
      message: `Extreme Heat Warning (${temp}°C): High heat stress risk for livestock and rapid soil drying. Ensure water supply.`,
    });
  }

  if (wind >= 50) {
    alerts.push({
      type: 'storm',
      severity: 'warning',
      message: `High Wind Advisory (${wind} km/h): Secure greenhouse covers and lightweight farm structures.`,
    });
  }

  return { data: weatherData, alerts };
}
