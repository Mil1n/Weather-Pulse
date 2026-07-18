export async function fetchJson(url, message, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(message);
  return res.json();
}
export async function getCoordinates(city, count = 1, signal) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=${count}&language=ru&format=json`;
  return (await fetchJson(url, 'Не удалось найти город. Проверьте интернет и попробуйте ещё раз.', signal)).results || [];
}
export async function reverseGeocode(lat, lon, signal) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=ru&format=json`;
  return (await fetchJson(url, 'Не удалось определить город по геолокации.', signal)).results?.[0] || null;
}
export async function getWeather(lat, lon, signal) {
  const current = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,visibility,cloud_cover,precipitation';
  const hourly = 'temperature_2m,weather_code,precipitation_probability,uv_index,wind_speed_10m';
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${current}&hourly=${hourly}&daily=${daily}&forecast_days=7&timezone=auto`;
  return fetchJson(url, 'Сервис погоды временно недоступен. Попробуйте повторить запрос позже.', signal);
}
export async function getAirQuality(lat, lon, signal) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,ozone&timezone=auto`;
  return fetchJson(url, 'Данные о качестве воздуха сейчас недоступны.', signal);
}
