import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvice, buildAlerts, buildBestTime, parseNaturalQuery } from '../modules/rules.js';

const weather = {
  current: {
    time: '2026-07-18T10:00', temperature_2m: 31, relative_humidity_2m: 50,
    precipitation: 0, weather_code: 0, wind_speed_10m: 12,
  },
  hourly: {
    time: ['2026-07-18T10:00', '2026-07-18T11:00', '2026-07-18T12:00'],
    temperature_2m: [31, 23, 20], precipitation_probability: [10, 5, 60], uv_index: [7, 4, 2], wind_speed_10m: [12, 8, 20],
  },
  daily: { precipitation_probability_max: [65] },
};

test('buildAdvice includes context-specific outdoor guidance', () => {
  const advice = buildAdvice(weather.current, 7, weather.daily, 'run');
  assert.match(advice, /SPF/);
  assert.match(advice, /пробеж/);
});

test('buildAlerts flags heat, rain and UV risks', () => {
  const alerts = buildAlerts(weather.current, 7, weather.daily, null).map(([, text]) => text).join(' ');
  assert.match(alerts, /Жара/);
  assert.match(alerts, /осадков/);
  assert.match(alerts, /UV/);
});

test('buildBestTime prefers lower rain and comfortable temperature', () => {
  const best = buildBestTime(weather);
  assert.equal(best.time, '2026-07-18T11:00');
});

test('parseNaturalQuery extracts city and intent from a natural phrase', () => {
  assert.deepEqual(parseNaturalQuery('Будет ли дождь завтра в Сочи'), { city: 'Сочи', intent: 'rain' });
});
