export function toF(celsius) { return (celsius * 9 / 5) + 32; }
export function toMph(kmh) { return kmh / 1.609344; }
export function temp(value, unitSystem = 'metric') { return `${Math.round(unitSystem === 'metric' ? value : toF(value))}°${unitSystem === 'metric' ? 'C' : 'F'}`; }
export function speed(value, unitSystem = 'metric') { return `${Math.round(unitSystem === 'metric' ? value : toMph(value))} ${unitSystem === 'metric' ? 'км/ч' : 'mph'}`; }
export function distance(meters, unitSystem = 'metric') { return unitSystem === 'metric' ? `${Math.round((meters || 0) / 1000)} км` : `${Math.round(((meters || 0) / 1000) / 1.609344)} mi`; }
export function placeLabel(city) { return `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}${city.country ? `, ${city.country}` : ''}`; }
export function cityKey(city) { return `${city.name}|${city.latitude}|${city.longitude}`; }
export function formatDirection(deg) { const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']; return dirs[Math.round((deg % 360) / 45) % 8]; }
export function formatDay(dateString) { return new Date(dateString).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }); }
export function formatHour(dateString) { return new Date(dateString).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
export function describeUv(uv) { if (uv == null) return '—'; if (uv < 3) return `${uv.toFixed(1)} низкий`; if (uv < 6) return `${uv.toFixed(1)} умеренный`; if (uv < 8) return `${uv.toFixed(1)} высокий`; if (uv < 11) return `${uv.toFixed(1)} очень высокий`; return `${uv.toFixed(1)} экстремальный`; }
export function describeAqi(pm25) { if (pm25 == null) return 'нет данных'; if (pm25 <= 5) return 'отличный воздух'; if (pm25 <= 15) return 'нормальный воздух'; if (pm25 <= 35) return 'повышенное загрязнение'; return 'грязный воздух — лучше сократить активность на улице'; }
