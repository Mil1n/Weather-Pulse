const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const statusEl = document.getElementById('status');
const weatherCard = document.getElementById('weatherCard');
const suggestionsEl = document.getElementById('suggestions');
const metricBtn = document.getElementById('metricBtn');
const imperialBtn = document.getElementById('imperialBtn');
const recentCitiesEl = document.getElementById('recentCities');
const favoriteCitiesEl = document.getElementById('favoriteCities');
const favoriteBtn = document.getElementById('favoriteBtn');
const alertsEl = document.getElementById('alerts');
const bestTimeEl = document.getElementById('bestTime');
const chartEl = document.getElementById('chart');
const chatLogEl = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const chatBtn = document.getElementById('chatBtn');

const cityNameEl = document.getElementById('cityName');
const weatherDescriptionEl = document.getElementById('weatherDescription');
const weatherIconEl = document.getElementById('weatherIcon');
const temperatureEl = document.getElementById('temperature');
const feelsLikeEl = document.getElementById('feelsLike');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind');
const windDirectionEl = document.getElementById('windDirection');
const pressureEl = document.getElementById('pressure');
const visibilityEl = document.getElementById('visibility');
const cloudCoverEl = document.getElementById('cloudCover');
const precipitationEl = document.getElementById('precipitation');
const uvIndexEl = document.getElementById('uvIndex');
const sunCycleEl = document.getElementById('sunCycle');
const weatherAdviceEl = document.getElementById('weatherAdvice');
const hourlyListEl = document.getElementById('hourlyList');
const weeklyListEl = document.getElementById('weeklyList');

let selectedSuggestion = null;
let suggestTimer;
let activeSuggestionIndex = -1;
let currentRequestController = null;
let unitSystem = localStorage.getItem('weatherPulseUnits') || 'metric';
let recentCities = JSON.parse(localStorage.getItem('weatherPulseRecent') || '[]');
let favoriteCities = JSON.parse(localStorage.getItem('weatherPulseFavorites') || '[]');
let lastWeather = null;
let lastPlace = null;

const weatherCodeMap = {
  0: ['Ясно', '☀️'], 1: ['Преимущественно ясно', '🌤️'], 2: ['Переменная облачность', '⛅'], 3: ['Пасмурно', '☁️'],
  45: ['Туман', '🌫️'], 48: ['Инейный туман', '🌫️'], 51: ['Лёгкая морось', '🌦️'], 53: ['Морось', '🌦️'], 55: ['Сильная морось', '🌧️'],
  61: ['Небольшой дождь', '🌦️'], 63: ['Дождь', '🌧️'], 65: ['Сильный дождь', '⛈️'], 71: ['Небольшой снег', '🌨️'], 73: ['Снег', '🌨️'],
  75: ['Сильный снег', '❄️'], 80: ['Кратковременный дождь', '🌧️'], 81: ['Ливень', '🌧️'], 82: ['Сильный ливень', '⛈️'],
  95: ['Гроза', '⛈️'], 96: ['Гроза с градом', '⛈️'], 99: ['Сильная гроза с градом', '⛈️'],
};

const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
const stormCodes = [95, 96, 99];
const snowyCodes = [71, 73, 75];

function toF(c) { return (c * 9 / 5) + 32; }
function toMph(kmh) { return kmh / 1.609344; }
function temp(value) { return `${Math.round(unitSystem === 'metric' ? value : toF(value))}°${unitSystem === 'metric' ? 'C' : 'F'}`; }
function speed(value) { return `${Math.round(unitSystem === 'metric' ? value : toMph(value))} ${unitSystem === 'metric' ? 'км/ч' : 'mph'}`; }
function distance(meters) { return unitSystem === 'metric' ? `${Math.round((meters || 0) / 1000)} км` : `${Math.round(((meters || 0) / 1000) / 1.609344)} mi`; }
function placeLabel(city) { return `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}${city.country ? `, ${city.country}` : ''}`; }
function cityKey(city) { return `${city.name}|${city.latitude}|${city.longitude}`; }
function formatDirection(deg) { const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']; return dirs[Math.round((deg % 360) / 45) % 8]; }
function formatDay(dateString) { return new Date(dateString).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }); }
function describeUv(uv) { if (uv == null) return '—'; if (uv < 3) return `${uv.toFixed(1)} низкий`; if (uv < 6) return `${uv.toFixed(1)} умеренный`; if (uv < 8) return `${uv.toFixed(1)} высокий`; if (uv < 11) return `${uv.toFixed(1)} очень высокий`; return `${uv.toFixed(1)} экстремальный`; }
function getCurrentHourIndex(weather) { const currentTime = new Date(weather.current.time).getTime(); const exactIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() === currentTime); if (exactIndex >= 0) return exactIndex; const nextIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() > currentTime); return nextIndex >= 0 ? nextIndex : 0; }

async function fetchJson(url, message, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(message);
  return res.json();
}
async function getCoordinates(city, count = 1, signal) { const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=${count}&language=ru&format=json`; return (await fetchJson(url, 'Не удалось найти город. Проверьте интернет и попробуйте ещё раз.', signal)).results || []; }
async function reverseGeocode(lat, lon, signal) { const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=ru&format=json`; return (await fetchJson(url, 'Не удалось определить город по геолокации.', signal)).results?.[0] || null; }
async function getWeather(lat, lon, signal) {
  const current = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,visibility,cloud_cover,precipitation';
  const hourly = 'temperature_2m,weather_code,precipitation_probability,uv_index';
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${current}&hourly=${hourly}&daily=${daily}&forecast_days=7&timezone=auto`;
  return fetchJson(url, 'Сервис погоды временно недоступен. Попробуйте повторить запрос позже.', signal);
}

function buildAdvice(current, currentUv, daily) {
  const tips = [];
  const precipitationProbability = daily.precipitation_probability_max?.[0] ?? 0;
  const weatherCode = current.weather_code;
  if (current.precipitation > 0 || precipitationProbability >= 45 || rainyCodes.includes(weatherCode)) tips.push('возьми зонт или лёгкий дождевик');
  if (current.temperature_2m >= 28) tips.push('жарко — держи под рукой воду и выбирай лёгкую одежду');
  else if (current.temperature_2m <= 0) tips.push('морозно — утеплись и проверь обувь на скольжение');
  else if (current.temperature_2m <= 10) tips.push('прохладно — лучше надеть слой потеплее');
  else tips.push('температура комфортная для прогулки');
  if (current.wind_speed_10m >= 35) tips.push('ветер сильный — избегай зон под деревьями и вывесками');
  else if (current.wind_speed_10m >= 20) tips.push('ветрено — капюшон или ветровка пригодятся');
  if (currentUv >= 6) tips.push('UV высокий — используй SPF и очки');
  else if (currentUv >= 3) tips.push('UV умеренный — SPF пригодится при долгой прогулке');
  if (current.relative_humidity_2m >= 80 && current.temperature_2m >= 20) tips.push('влажно — выбирай дышащую ткань');
  return `${tips.join('; ')}.`;
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  geoBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? 'Загрузка…' : 'Показать погоду';
  if (isLoading && !lastWeather) statusEl.innerHTML = document.getElementById('skeletonTemplate').innerHTML;
}

function updateUnitButtons() {
  metricBtn.classList.toggle('active', unitSystem === 'metric');
  imperialBtn.classList.toggle('active', unitSystem === 'imperial');
}

function saveCity(list, storageKey, city, limit = 6) {
  const normalized = { name: city.name, admin1: city.admin1, country: city.country, latitude: city.latitude, longitude: city.longitude };
  const next = [normalized, ...list.filter((item) => cityKey(item) !== cityKey(normalized))].slice(0, limit);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

function renderCityChips() {
  const render = (el, cities, emptyText) => {
    el.innerHTML = '';
    if (!cities.length) { el.innerHTML = `<span class="hint">${emptyText}</span>`; return; }
    cities.forEach((city) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = city.name;
      chip.title = placeLabel(city);
      chip.addEventListener('click', () => { selectedSuggestion = city; cityInput.value = placeLabel(city); handleSearch(); });
      el.appendChild(chip);
    });
  };
  render(recentCitiesEl, recentCities, 'пока пусто');
  render(favoriteCitiesEl, favoriteCities, 'пока пусто');
}

function renderSuggestions(cities) {
  suggestionsEl.innerHTML = '';
  activeSuggestionIndex = -1;
  cityInput.setAttribute('aria-expanded', cities.length ? 'true' : 'false');
  if (!cities.length) return suggestionsEl.classList.add('hidden');
  cities.forEach((city, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.id = `suggestion-${index}`;
    item.role = 'option';
    item.textContent = placeLabel(city);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', () => selectSuggestion(city, item.textContent));
    suggestionsEl.appendChild(item);
  });
  suggestionsEl.classList.remove('hidden');
}
function selectSuggestion(city, label) { selectedSuggestion = city; cityInput.value = label; suggestionsEl.classList.add('hidden'); cityInput.setAttribute('aria-expanded', 'false'); handleSearch(); }
function moveSuggestion(delta) {
  const items = [...suggestionsEl.querySelectorAll('.suggestion-item')];
  if (!items.length || suggestionsEl.classList.contains('hidden')) return;
  activeSuggestionIndex = (activeSuggestionIndex + delta + items.length) % items.length;
  items.forEach((item, index) => item.classList.toggle('active', index === activeSuggestionIndex));
  cityInput.setAttribute('aria-activedescendant', items[activeSuggestionIndex].id);
}

function buildAlerts(current, currentUv, daily) {
  const alerts = [];
  if (stormCodes.includes(current.weather_code)) alerts.push(['danger', '⛈️ Возможна гроза — лучше перенести прогулку и держаться подальше от открытых площадок.']);
  if (current.wind_speed_10m >= 35) alerts.push(['danger', '🌬️ Сильный ветер — будьте осторожны рядом с деревьями и временными конструкциями.']);
  if (current.temperature_2m >= 30) alerts.push(['danger', '🔥 Жара — пейте воду и избегайте перегрева.']);
  if (current.temperature_2m <= -10) alerts.push(['danger', '🥶 Сильный мороз — утеплитесь и сократите время на улице.']);
  if ((daily.precipitation_probability_max?.[0] ?? 0) >= 60) alerts.push(['warn', '☔ Высокий шанс осадков — зонт точно пригодится.']);
  if (currentUv >= 6) alerts.push(['warn', '☀️ Высокий UV — используйте SPF, очки и головной убор.']);
  alertsEl.innerHTML = alerts.map(([type, text]) => `<div class="alert ${type === 'danger' ? 'danger' : ''}">${text}</div>`).join('');
  alertsEl.classList.toggle('hidden', !alerts.length);
}

function setWeatherTheme(code) {
  document.body.className = '';
  if (stormCodes.includes(code)) document.body.classList.add('theme-storm');
  else if (snowyCodes.includes(code)) document.body.classList.add('theme-snow');
  else if (rainyCodes.includes(code)) document.body.classList.add('theme-rain');
  else if ([2, 3, 45, 48].includes(code)) document.body.classList.add('theme-cloudy');
  else document.body.classList.add('theme-clear');
}

function renderHourly(weather) {
  hourlyListEl.innerHTML = '';
  const { time, temperature_2m, weather_code, precipitation_probability, uv_index } = weather.hourly;
  const startIndex = getCurrentHourIndex(weather);
  for (let i = startIndex; i < Math.min(startIndex + 8, time.length); i += 1) {
    const hour = new Date(time[i]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const [, icon] = weatherCodeMap[weather_code[i]] || ['—', '❔'];
    const item = document.createElement('div');
    item.className = 'hourly-item';
    item.innerHTML = `<strong>${hour}</strong><div>${icon} ${temp(temperature_2m[i])}</div><small>Осадки: ${precipitation_probability[i] ?? 0}%</small><small>UV: ${(uv_index[i] ?? 0).toFixed(1)}</small>`;
    hourlyListEl.appendChild(item);
  }
}

function renderWeekly(weather) {
  weeklyListEl.innerHTML = '';
  const daily = weather.daily;
  daily.time.forEach((day, index) => {
    const [desc, icon] = weatherCodeMap[daily.weather_code[index]] || ['Неизвестно', '❔'];
    const rainChance = daily.precipitation_probability_max[index] ?? 0;
    const dayAdvice = rainChance >= 45 ? 'Зонт пригодится' : daily.uv_index_max[index] >= 6 ? 'Не забудь SPF' : daily.wind_speed_10m_max[index] >= 35 ? 'Осторожно, ветер' : 'Хороший день для планов';
    const item = document.createElement('article');
    item.className = 'weekly-item';
    item.innerHTML = `<strong>${formatDay(day)}</strong><span class="weekly-icon">${icon}</span><p>${desc}</p><small>🌡️ ${temp(daily.temperature_2m_min[index])} / ${temp(daily.temperature_2m_max[index])}</small><small>☔ ${rainChance}% · ☀️ UV ${Math.round(daily.uv_index_max[index] ?? 0)}</small><em>${dayAdvice}</em>`;
    weeklyListEl.appendChild(item);
  });
}

function renderChart(weather) {
  const start = getCurrentHourIndex(weather);
  const temps = weather.hourly.temperature_2m.slice(start, start + 24);
  const rains = weather.hourly.precipitation_probability.slice(start, start + 24).map((value) => value ?? 0);
  const labels = weather.hourly.time.slice(start, start + 24).map((time) => new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit' }));
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const width = 900;
  const height = 260;
  const pad = 34;
  const step = (width - pad * 2) / Math.max(temps.length - 1, 1);
  const y = (value) => height - pad - ((value - min) / Math.max(max - min, 1)) * 130;
  const points = temps.map((value, index) => `${pad + index * step},${y(value)}`).join(' ');
  const bars = rains.map((value, index) => {
    const barHeight = value * 0.85;
    const x = pad + index * step - 8;
    return `<rect x="${x}" y="${height - pad - barHeight}" width="16" height="${barHeight}" rx="4" fill="rgba(56,189,248,.35)" />`;
  }).join('');
  const marks = temps.map((value, index) => index % 4 === 0 ? `<text class="chart-label" x="${pad + index * step - 10}" y="${height - 8}">${labels[index]}</text>` : '').join('');
  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><title>Температура и шанс осадков на ближайшие 24 часа</title>${bars}<polyline points="${points}" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />${temps.map((value, index) => `<circle cx="${pad + index * step}" cy="${y(value)}" r="4" fill="#d1fae5"><title>${labels[index]}: ${temp(value)}, осадки ${rains[index]}%</title></circle>`).join('')}<text class="chart-label" x="${pad}" y="22">${temp(max)}</text><text class="chart-label" x="${pad}" y="${height - 42}">${temp(min)}</text>${marks}</svg>`;
}

function renderBestTime(weather) {
  const start = getCurrentHourIndex(weather);
  const candidates = weather.hourly.time.slice(start, start + 24).map((time, offset) => {
    const index = start + offset;
    const temperatureScore = Math.max(0, 10 - Math.abs(weather.hourly.temperature_2m[index] - 21));
    const rainScore = 10 - ((weather.hourly.precipitation_probability[index] ?? 0) / 10);
    const uvScore = Math.max(0, 8 - (weather.hourly.uv_index[index] ?? 0));
    return { time, score: temperatureScore + rainScore + uvScore, rain: weather.hourly.precipitation_probability[index] ?? 0, uv: weather.hourly.uv_index[index] ?? 0, t: weather.hourly.temperature_2m[index] };
  }).sort((a, b) => b.score - a.score)[0];
  const label = new Date(candidates.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  bestTimeEl.textContent = `Лучшее окно — около ${label}: ${temp(candidates.t)}, осадки ${candidates.rain}%, UV ${candidates.uv.toFixed(1)}.`;
}

function updateFavoriteButton() {
  if (!lastPlace) return;
  const active = favoriteCities.some((city) => cityKey(city) === cityKey(lastPlace));
  favoriteBtn.textContent = active ? '★' : '☆';
  favoriteBtn.setAttribute('aria-label', active ? 'Убрать город из избранного' : 'Добавить город в избранное');
}

function renderWeather(city, weatherData) {
  const c = weatherData.current;
  const [desc, icon] = weatherCodeMap[c.weather_code] || ['Неизвестно', '❔'];
  const currentHourIndex = getCurrentHourIndex(weatherData);
  const currentUv = weatherData.hourly.uv_index[currentHourIndex] ?? 0;
  cityNameEl.textContent = `${city.name}${city.country ? `, ${city.country}` : ''}`;
  weatherDescriptionEl.textContent = desc;
  weatherIconEl.textContent = icon;
  temperatureEl.textContent = temp(c.temperature_2m);
  feelsLikeEl.textContent = `Ощущается как: ${temp(c.apparent_temperature)}`;
  humidityEl.textContent = `${c.relative_humidity_2m}%`;
  windEl.textContent = speed(c.wind_speed_10m);
  windDirectionEl.textContent = `${formatDirection(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)`;
  pressureEl.textContent = `${Math.round(c.surface_pressure)} гПа`;
  visibilityEl.textContent = distance(c.visibility);
  cloudCoverEl.textContent = `${c.cloud_cover}%`;
  precipitationEl.textContent = `${c.precipitation} мм`;
  uvIndexEl.textContent = describeUv(currentUv);
  weatherAdviceEl.textContent = buildAdvice(c, currentUv, weatherData.daily);
  const sunrise = new Date(weatherData.daily.sunrise[0]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(weatherData.daily.sunset[0]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  sunCycleEl.textContent = `${sunrise} / ${sunset}`;
  buildAlerts(c, currentUv, weatherData.daily);
  renderBestTime(weatherData);
  renderChart(weatherData);
  renderHourly(weatherData);
  renderWeekly(weatherData);
  setWeatherTheme(c.weather_code);
  updateFavoriteButton();
  weatherCard.classList.remove('hidden');
}

async function handleSearch() {
  const raw = cityInput.value.trim();
  if (!raw && !selectedSuggestion) { statusEl.textContent = 'Введите название города.'; return; }
  currentRequestController?.abort();
  currentRequestController = new AbortController();
  setLoading(true);
  statusEl.textContent = 'Загружаем данные о погоде...';
  try {
    const place = selectedSuggestion || (await getCoordinates(raw, 1, currentRequestController.signal))[0];
    if (!place) throw new Error('Город не найден. Попробуйте уточнить название или выбрать вариант из подсказок.');
    const weather = await getWeather(place.latitude, place.longitude, currentRequestController.signal);
    lastWeather = weather;
    lastPlace = place;
    renderWeather(place, weather);
    recentCities = saveCity(recentCities, 'weatherPulseRecent', place);
    renderCityChips();
    statusEl.textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;
    selectedSuggestion = null;
  } catch (error) {
    if (error.name !== 'AbortError') statusEl.textContent = error.message || 'Что-то пошло не так. Попробуйте ещё раз.';
  } finally {
    setLoading(false);
  }
}

function handleGeolocation() {
  if (!navigator.geolocation) { statusEl.textContent = 'Геолокация не поддерживается вашим браузером.'; return; }
  setLoading(true);
  statusEl.textContent = 'Определяем ваше местоположение...';
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (!city?.name) throw new Error('Не удалось найти ближайший город.');
      selectedSuggestion = city;
      cityInput.value = placeLabel(city);
      await handleSearch();
    } catch (error) {
      statusEl.textContent = error.message;
      setLoading(false);
    }
  }, () => {
    statusEl.textContent = 'Доступ к геолокации не получен. Введите город вручную.';
    setLoading(false);
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

function addChatMessage(text, type = 'bot') {
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;
  chatLogEl.appendChild(message);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}
function answerQuestion(question) {
  if (!lastWeather) return 'Сначала выберите город — тогда я смогу ответить по актуальному прогнозу.';
  const q = question.toLowerCase();
  const c = lastWeather.current;
  const uv = lastWeather.hourly.uv_index[getCurrentHourIndex(lastWeather)] ?? 0;
  const rain = lastWeather.daily.precipitation_probability_max?.[0] ?? 0;
  if (q.includes('зонт') || q.includes('дожд')) return rain >= 45 || c.precipitation > 0 || rainyCodes.includes(c.weather_code) ? `Да, зонт лучше взять: шанс осадков сегодня ${rain}%, сейчас ${c.precipitation} мм.` : `Скорее всего, можно без зонта: шанс осадков сегодня ${rain}%.`;
  if (q.includes('одет') || q.includes('надеть') || q.includes('куртк')) return buildAdvice(c, uv, lastWeather.daily);
  if (q.includes('гуля') || q.includes('прогул')) return bestTimeEl.textContent;
  if (q.includes('uv') || q.includes('солн') || q.includes('spf')) return uv >= 6 ? `UV ${uv.toFixed(1)} — SPF обязателен, особенно в середине дня.` : `UV ${uv.toFixed(1)} — риск умеренный или низкий, но SPF пригодится при долгой прогулке.`;
  return `${weatherDescriptionEl.textContent}, сейчас ${temperatureEl.textContent}, ощущается как ${feelsLikeEl.textContent.replace('Ощущается как: ', '')}. ${weatherAdviceEl.textContent}`;
}

cityInput.addEventListener('input', () => {
  selectedSuggestion = null;
  clearTimeout(suggestTimer);
  const q = cityInput.value.trim();
  if (q.length < 2) { suggestionsEl.classList.add('hidden'); cityInput.setAttribute('aria-expanded', 'false'); return; }
  suggestTimer = setTimeout(async () => {
    try { renderSuggestions(await getCoordinates(q, 6)); } catch { suggestionsEl.classList.add('hidden'); }
  }, 250);
});
cityInput.addEventListener('blur', () => setTimeout(() => { suggestionsEl.classList.add('hidden'); cityInput.setAttribute('aria-expanded', 'false'); }, 120));
cityInput.addEventListener('focus', () => { if (suggestionsEl.children.length) { suggestionsEl.classList.remove('hidden'); cityInput.setAttribute('aria-expanded', 'true'); } });
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
  else if (e.key === 'Escape') { suggestionsEl.classList.add('hidden'); cityInput.setAttribute('aria-expanded', 'false'); }
  else if (e.key === 'Enter') {
    const active = suggestionsEl.querySelector('.suggestion-item.active');
    if (active) { e.preventDefault(); active.click(); } else handleSearch();
  }
});
searchBtn.addEventListener('click', handleSearch);
geoBtn.addEventListener('click', handleGeolocation);
metricBtn.addEventListener('click', () => { unitSystem = 'metric'; localStorage.setItem('weatherPulseUnits', unitSystem); updateUnitButtons(); if (lastWeather && lastPlace) renderWeather(lastPlace, lastWeather); });
imperialBtn.addEventListener('click', () => { unitSystem = 'imperial'; localStorage.setItem('weatherPulseUnits', unitSystem); updateUnitButtons(); if (lastWeather && lastPlace) renderWeather(lastPlace, lastWeather); });
favoriteBtn.addEventListener('click', () => {
  if (!lastPlace) return;
  const exists = favoriteCities.some((city) => cityKey(city) === cityKey(lastPlace));
  favoriteCities = exists ? favoriteCities.filter((city) => cityKey(city) !== cityKey(lastPlace)) : saveCity(favoriteCities, 'weatherPulseFavorites', lastPlace, 8);
  localStorage.setItem('weatherPulseFavorites', JSON.stringify(favoriteCities));
  renderCityChips();
  updateFavoriteButton();
});
chatBtn.addEventListener('click', () => { const question = chatInput.value.trim(); if (!question) return; addChatMessage(question, 'user'); addChatMessage(answerQuestion(question), 'bot'); chatInput.value = ''; });
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') chatBtn.click(); });

updateUnitButtons();
renderCityChips();
addChatMessage('Привет! Выбери город, а потом спроси, нужен ли зонт, как одеться или когда лучше гулять.');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
