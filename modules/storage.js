import { CACHE_TTL_MS } from './constants.js';
import { cityKey } from './formatters.js';

export function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
export function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
export function saveCity(list, storageKey, city, limit = 6) {
  const normalized = { name: city.name, admin1: city.admin1, country: city.country, latitude: city.latitude, longitude: city.longitude };
  const next = [normalized, ...list.filter((item) => cityKey(item) !== cityKey(normalized))].slice(0, limit);
  writeJson(storageKey, next);
  return next;
}
export function getForecastCache(city) {
  const cached = readJson(`weatherPulseForecast:${cityKey(city)}`, null);
  if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) return null;
  return cached;
}
export function setForecastCache(city, weather, airQuality) {
  writeJson(`weatherPulseForecast:${cityKey(city)}`, { savedAt: Date.now(), weather, airQuality });
}
