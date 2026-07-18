import { RAINY_CODES, STORM_CODES } from './constants.js';
import { formatHour } from './formatters.js';

export function getCurrentHourIndex(weather) {
  const currentTime = new Date(weather.current.time).getTime();
  const exactIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() === currentTime);
  if (exactIndex >= 0) return exactIndex;
  const nextIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() > currentTime);
  return nextIndex >= 0 ? nextIndex : 0;
}

export function buildAdvice(current, currentUv, daily, context = 'walk', airQuality) {
  const tips = [];
  const precipitationProbability = daily.precipitation_probability_max?.[0] ?? 0;
  if (current.precipitation > 0 || precipitationProbability >= 45 || RAINY_CODES.includes(current.weather_code)) tips.push('возьми зонт или лёгкий дождевик');
  if (current.temperature_2m >= 28) tips.push('жарко — держи воду под рукой и выбирай лёгкую одежду');
  else if (current.temperature_2m <= 0) tips.push('морозно — утеплись и проверь обувь на скольжение');
  else if (current.temperature_2m <= 10) tips.push('прохладно — лучше надеть слой потеплее');
  else tips.push('температура комфортная для планов на улице');
  if (current.wind_speed_10m >= 35) tips.push('ветер сильный — избегай зон под деревьями и вывесками');
  else if (current.wind_speed_10m >= 20) tips.push('ветрено — капюшон или ветровка пригодятся');
  if (currentUv >= 6) tips.push('UV высокий — используй SPF, очки и головной убор');
  else if (currentUv >= 3) tips.push('UV умеренный — SPF пригодится при долгой прогулке');
  if (current.relative_humidity_2m >= 80 && current.temperature_2m >= 20) tips.push('влажно — выбирай дышащую ткань');
  if ((airQuality?.current?.pm2_5 ?? 0) > 35) tips.push('качество воздуха снижено — интенсивные нагрузки лучше перенести');

  const contextTips = {
    walk: 'для прогулки держи маршрут гибким и ориентируйся на ближайшие 2–3 часа',
    run: current.wind_speed_10m >= 20 || precipitationProbability >= 45 ? 'для пробежки лучше выбрать короткий маршрут или зал' : 'для пробежки условия подходят, но разомнись и возьми воду',
    kids: 'для ребёнка добавь запасной слой одежды и проверь риск осадков перед выходом',
    bike: current.wind_speed_10m >= 20 ? 'для велосипеда ветер заметный — снизь скорость и избегай открытых участков' : 'для велосипеда условия нормальные, проверь видимость и осадки',
    dog: precipitationProbability >= 45 ? 'для прогулки с собакой лучше взять полотенце и выбрать короткий круг' : 'для прогулки с собакой погода подходит',
  };
  tips.push(contextTips[context] || contextTips.walk);
  return `${tips.join('; ')}.`;
}

export function buildAlerts(current, currentUv, daily, airQuality) {
  const alerts = [];
  if (STORM_CODES.includes(current.weather_code)) alerts.push(['danger', '⛈️ Возможна гроза — лучше перенести прогулку и держаться подальше от открытых площадок.']);
  if (current.wind_speed_10m >= 35) alerts.push(['danger', '🌬️ Сильный ветер — будьте осторожны рядом с деревьями и временными конструкциями.']);
  if (current.temperature_2m >= 30) alerts.push(['danger', '🔥 Жара — пейте воду и избегайте перегрева.']);
  if (current.temperature_2m <= -10) alerts.push(['danger', '🥶 Сильный мороз — утеплитесь и сократите время на улице.']);
  if ((daily.precipitation_probability_max?.[0] ?? 0) >= 60) alerts.push(['warn', '☔ Высокий шанс осадков — зонт точно пригодится.']);
  if (currentUv >= 6) alerts.push(['warn', '☀️ Высокий UV — используйте SPF, очки и головной убор.']);
  if ((airQuality?.current?.pm2_5 ?? 0) > 35) alerts.push(['warn', '🏭 Воздух загрязнён — сократите интенсивные активности на улице.']);
  return alerts;
}

export function buildBestTime(weather) {
  const start = getCurrentHourIndex(weather);
  const candidates = weather.hourly.time.slice(start, start + 24).map((time, offset) => {
    const index = start + offset;
    const temperatureScore = Math.max(0, 10 - Math.abs(weather.hourly.temperature_2m[index] - 21));
    const rainScore = 10 - ((weather.hourly.precipitation_probability[index] ?? 0) / 10);
    const uvScore = Math.max(0, 8 - (weather.hourly.uv_index[index] ?? 0));
    const windScore = Math.max(0, 8 - ((weather.hourly.wind_speed_10m?.[index] ?? 0) / 5));
    return { time, score: temperatureScore + rainScore + uvScore + windScore, rain: weather.hourly.precipitation_probability[index] ?? 0, uv: weather.hourly.uv_index[index] ?? 0, t: weather.hourly.temperature_2m[index] };
  }).sort((a, b) => b.score - a.score)[0];
  return candidates;
}

export function buildDayPlan(weather) {
  const start = getCurrentHourIndex(weather);
  const windows = [
    ['Утро', 6, 12], ['День', 12, 18], ['Вечер', 18, 23],
  ];
  return windows.map(([label, from, to]) => {
    const indexes = weather.hourly.time.map((time, index) => ({ hour: new Date(time).getHours(), index }))
      .filter(({ hour, index }) => index >= start && hour >= from && hour < to)
      .slice(0, 6);
    if (!indexes.length) return { label, text: 'данных на этот период уже мало' };
    const avgTemp = indexes.reduce((sum, { index }) => sum + weather.hourly.temperature_2m[index], 0) / indexes.length;
    const maxRain = Math.max(...indexes.map(({ index }) => weather.hourly.precipitation_probability[index] ?? 0));
    const maxUv = Math.max(...indexes.map(({ index }) => weather.hourly.uv_index[index] ?? 0));
    const text = maxRain >= 45 ? `риск осадков до ${maxRain}% — держи зонт рядом` : maxUv >= 6 ? `UV до ${maxUv.toFixed(1)} — нужен SPF` : avgTemp <= 10 ? 'прохладно — лучше добавить слой' : 'условия спокойные для планов';
    return { label, text };
  });
}

export function parseNaturalQuery(query) {
  const normalized = query.trim();
  const cityMatch = normalized.match(/(?:в|во)\s+([а-яёa-z\-\s]+)$/i);
  const intent = /зонт|дожд/i.test(normalized) ? 'rain' : /одет|надеть|куртк/i.test(normalized) ? 'clothes' : /гуля|прогул/i.test(normalized) ? 'walk' : 'weather';
  return { city: cityMatch?.[1]?.trim() || normalized, intent };
}

export function answerQuestion(question, snapshot) {
  if (!snapshot?.weather) return 'Сначала выберите город — тогда я смогу ответить по актуальному прогнозу.';
  const q = question.toLowerCase();
  const { weather, currentUv, advice, bestTimeText } = snapshot;
  const c = weather.current;
  const rain = weather.daily.precipitation_probability_max?.[0] ?? 0;
  if (q.includes('зонт') || q.includes('дожд')) return rain >= 45 || c.precipitation > 0 || RAINY_CODES.includes(c.weather_code) ? `Да, зонт лучше взять: шанс осадков сегодня ${rain}%, сейчас ${c.precipitation} мм.` : `Скорее всего, можно без зонта: шанс осадков сегодня ${rain}%.`;
  if (q.includes('одет') || q.includes('надеть') || q.includes('куртк')) return advice;
  if (q.includes('гуля') || q.includes('прогул')) return bestTimeText;
  if (q.includes('uv') || q.includes('солн') || q.includes('spf')) return currentUv >= 6 ? `UV ${currentUv.toFixed(1)} — SPF обязателен, особенно в середине дня.` : `UV ${currentUv.toFixed(1)} — риск умеренный или низкий, но SPF пригодится при долгой прогулке.`;
  return `${snapshot.description}, сейчас ${snapshot.temperatureText}. ${advice}`;
}

export function formatBestTimeText(best, tempText) {
  return `Лучшее окно — около ${formatHour(best.time)}: ${tempText}, осадки ${best.rain}%, UV ${best.uv.toFixed(1)}.`;
}
