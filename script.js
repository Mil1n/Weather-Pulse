import { getAirQuality, getCoordinates, getWeather, reverseGeocode } from './modules/api.js';
import { RAINY_CODES, SNOWY_CODES, STORM_CODES, WEATHER_CODE_MAP } from './modules/constants.js';
import { cityKey, describeAqi, describeUv, distance, formatDay, formatDirection, formatHour, placeLabel, speed, temp } from './modules/formatters.js';
import { answerQuestion, buildAdvice, buildAlerts, buildBestTime, buildDayPlan, formatBestTimeText, getCurrentHourIndex, parseNaturalQuery } from './modules/rules.js';
import { getForecastCache, readJson, saveCity, setForecastCache, writeJson } from './modules/storage.js';

const $ = (id) => document.getElementById(id);
const els = {
  cityInput: $('cityInput'), searchBtn: $('searchBtn'), geoBtn: $('geoBtn'), voiceBtn: $('voiceBtn'), status: $('status'), weatherCard: $('weatherCard'), suggestions: $('suggestions'),
  metricBtn: $('metricBtn'), imperialBtn: $('imperialBtn'), recentCities: $('recentCities'), favoriteCities: $('favoriteCities'), favoriteBtn: $('favoriteBtn'), alerts: $('alerts'),
  bestTime: $('bestTime'), dayPlan: $('dayPlan'), chart: $('chart'), chart24Btn: $('chart24Btn'), chart7Btn: $('chart7Btn'), compareBtn: $('compareBtn'), compareList: $('compareList'),
  chatLog: $('chatLog'), chatInput: $('chatInput'), chatBtn: $('chatBtn'), shareBtn: $('shareBtn'), notifyBtn: $('notifyBtn'), contextSelect: $('contextSelect'), airQuality: $('airQuality'),
  cityName: $('cityName'), weatherDescription: $('weatherDescription'), weatherIcon: $('weatherIcon'), temperature: $('temperature'), feelsLike: $('feelsLike'), humidity: $('humidity'), wind: $('wind'),
  windDirection: $('windDirection'), pressure: $('pressure'), visibility: $('visibility'), cloudCover: $('cloudCover'), precipitation: $('precipitation'), uvIndex: $('uvIndex'), sunCycle: $('sunCycle'),
  weatherAdvice: $('weatherAdvice'), hourlyList: $('hourlyList'), weeklyList: $('weeklyList'),
};

const state = {
  selectedSuggestion: null,
  suggestTimer: null,
  activeSuggestionIndex: -1,
  requestController: null,
  unitSystem: localStorage.getItem('weatherPulseUnits') || 'metric',
  recentCities: readJson('weatherPulseRecent', []),
  favoriteCities: readJson('weatherPulseFavorites', []),
  place: null,
  weather: null,
  airQuality: null,
  chartRange: '24h',
  lastAssistantIntent: 'weather',
};

function setStatus(message, kind = 'info') {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
}

function setLoading(isLoading) {
  els.searchBtn.disabled = isLoading;
  els.geoBtn.disabled = isLoading;
  els.voiceBtn.disabled = isLoading;
  els.searchBtn.textContent = isLoading ? 'Загрузка…' : 'Показать погоду';
  if (isLoading && !state.weather) els.status.innerHTML = $('skeletonTemplate').innerHTML;
}

function setWeatherTheme(code) {
  document.body.className = '';
  if (STORM_CODES.includes(code)) document.body.classList.add('theme-storm');
  else if (SNOWY_CODES.includes(code)) document.body.classList.add('theme-snow');
  else if (RAINY_CODES.includes(code)) document.body.classList.add('theme-rain');
  else if ([2, 3, 45, 48].includes(code)) document.body.classList.add('theme-cloudy');
  else document.body.classList.add('theme-clear');
}

function updateUnitButtons() {
  els.metricBtn.classList.toggle('active', state.unitSystem === 'metric');
  els.imperialBtn.classList.toggle('active', state.unitSystem === 'imperial');
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
      chip.addEventListener('click', () => { state.selectedSuggestion = city; els.cityInput.value = placeLabel(city); handleSearch(); });
      el.appendChild(chip);
    });
  };
  render(els.recentCities, state.recentCities, 'пока пусто');
  render(els.favoriteCities, state.favoriteCities, 'пока пусто');
}

function renderSuggestions(cities) {
  els.suggestions.innerHTML = '';
  state.activeSuggestionIndex = -1;
  els.cityInput.setAttribute('aria-expanded', cities.length ? 'true' : 'false');
  if (!cities.length) { els.suggestions.classList.add('hidden'); return; }
  cities.forEach((city, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.id = `suggestion-${index}`;
    item.role = 'option';
    item.setAttribute('aria-selected', 'false');
    item.textContent = placeLabel(city);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', () => selectSuggestion(city, item.textContent));
    els.suggestions.appendChild(item);
  });
  els.suggestions.classList.remove('hidden');
}

function selectSuggestion(city, label) {
  state.selectedSuggestion = city;
  els.cityInput.value = label;
  els.suggestions.classList.add('hidden');
  els.cityInput.setAttribute('aria-expanded', 'false');
  handleSearch();
}

function moveSuggestion(delta) {
  const items = [...els.suggestions.querySelectorAll('.suggestion-item')];
  if (!items.length || els.suggestions.classList.contains('hidden')) return;
  state.activeSuggestionIndex = (state.activeSuggestionIndex + delta + items.length) % items.length;
  items.forEach((item, index) => {
    const active = index === state.activeSuggestionIndex;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  els.cityInput.setAttribute('aria-activedescendant', items[state.activeSuggestionIndex].id);
}

async function loadForecast(place, signal) {
  const cached = getForecastCache(place);
  if (cached) return { ...cached, fromCache: true };
  const [weather, airQuality] = await Promise.all([
    getWeather(place.latitude, place.longitude, signal),
    getAirQuality(place.latitude, place.longitude, signal).catch(() => null),
  ]);
  setForecastCache(place, weather, airQuality);
  return { weather, airQuality, fromCache: false };
}

function currentSnapshot() {
  if (!state.weather) return null;
  const currentUv = state.weather.hourly.uv_index[getCurrentHourIndex(state.weather)] ?? 0;
  const [description] = WEATHER_CODE_MAP[state.weather.current.weather_code] || ['Неизвестно', '❔'];
  return {
    weather: state.weather,
    currentUv,
    description,
    temperatureText: temp(state.weather.current.temperature_2m, state.unitSystem),
    advice: els.weatherAdvice.textContent,
    bestTimeText: els.bestTime.textContent,
  };
}

function renderAlerts(currentUv) {
  const alerts = buildAlerts(state.weather.current, currentUv, state.weather.daily, state.airQuality);
  els.alerts.innerHTML = alerts.map(([type, text]) => `<div class="alert ${type === 'danger' ? 'danger' : ''}">${text}</div>`).join('');
  els.alerts.classList.toggle('hidden', !alerts.length);
}

function renderHourly() {
  els.hourlyList.innerHTML = '';
  const { time, temperature_2m, weather_code, precipitation_probability, uv_index } = state.weather.hourly;
  const startIndex = getCurrentHourIndex(state.weather);
  for (let i = startIndex; i < Math.min(startIndex + 8, time.length); i += 1) {
    const [, icon] = WEATHER_CODE_MAP[weather_code[i]] || ['—', '❔'];
    const item = document.createElement('div');
    item.className = 'hourly-item';
    item.innerHTML = `<strong>${formatHour(time[i])}</strong><div>${icon} ${temp(temperature_2m[i], state.unitSystem)}</div><small>Осадки: ${precipitation_probability[i] ?? 0}%</small><small>UV: ${(uv_index[i] ?? 0).toFixed(1)}</small>`;
    els.hourlyList.appendChild(item);
  }
}

function renderWeekly() {
  els.weeklyList.innerHTML = '';
  const daily = state.weather.daily;
  daily.time.forEach((day, index) => {
    const [desc, icon] = WEATHER_CODE_MAP[daily.weather_code[index]] || ['Неизвестно', '❔'];
    const rainChance = daily.precipitation_probability_max[index] ?? 0;
    const dayAdvice = rainChance >= 45 ? 'Зонт пригодится' : daily.uv_index_max[index] >= 6 ? 'Не забудь SPF' : daily.wind_speed_10m_max[index] >= 35 ? 'Осторожно, ветер' : 'Хороший день для планов';
    const item = document.createElement('article');
    item.className = 'weekly-item';
    item.innerHTML = `<strong>${formatDay(day)}</strong><span class="weekly-icon">${icon}</span><p>${desc}</p><small>🌡️ ${temp(daily.temperature_2m_min[index], state.unitSystem)} / ${temp(daily.temperature_2m_max[index], state.unitSystem)}</small><small>☔ ${rainChance}% · ☀️ UV ${Math.round(daily.uv_index_max[index] ?? 0)}</small><em>${dayAdvice}</em>`;
    els.weeklyList.appendChild(item);
  });
}

function renderChart() {
  const width = 900;
  const height = 260;
  const pad = 34;
  let temps;
  let rains;
  let labels;
  if (state.chartRange === '7d') {
    temps = state.weather.daily.temperature_2m_max;
    rains = state.weather.daily.precipitation_probability_max.map((value) => value ?? 0);
    labels = state.weather.daily.time.map((date) => formatDay(date));
  } else {
    const start = getCurrentHourIndex(state.weather);
    temps = state.weather.hourly.temperature_2m.slice(start, start + 24);
    rains = state.weather.hourly.precipitation_probability.slice(start, start + 24).map((value) => value ?? 0);
    labels = state.weather.hourly.time.slice(start, start + 24).map((time) => new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit' }));
  }
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const step = (width - pad * 2) / Math.max(temps.length - 1, 1);
  const y = (value) => height - pad - ((value - min) / Math.max(max - min, 1)) * 130;
  const points = temps.map((value, index) => `${pad + index * step},${y(value)}`).join(' ');
  const bars = rains.map((value, index) => `<rect x="${pad + index * step - 8}" y="${height - pad - (value * 0.85)}" width="16" height="${value * 0.85}" rx="4" fill="rgba(56,189,248,.35)"><title>${labels[index]}: осадки ${value}%</title></rect>`).join('');
  const marks = temps.map((_, index) => index % (state.chartRange === '7d' ? 1 : 4) === 0 ? `<text class="chart-label" x="${pad + index * step - 10}" y="${height - 8}">${labels[index]}</text>` : '').join('');
  els.chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><title>Температура и шанс осадков</title>${bars}<polyline points="${points}" fill="none" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />${temps.map((value, index) => `<circle cx="${pad + index * step}" cy="${y(value)}" r="5" fill="#d1fae5"><title>${labels[index]}: ${temp(value, state.unitSystem)}, осадки ${rains[index]}%</title></circle>`).join('')}<line x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" stroke="rgba(203,213,225,.25)"/><text class="chart-label" x="${pad}" y="22">${temp(max, state.unitSystem)}</text><text class="chart-label" x="${pad}" y="${height - 42}">${temp(min, state.unitSystem)}</text>${marks}</svg>`;
}

function renderDayPlan() {
  els.dayPlan.innerHTML = buildDayPlan(state.weather).map((item) => `<article><strong>${item.label}</strong><span>${item.text}</span></article>`).join('');
}

function renderAdviceAndBestTime() {
  const currentUv = state.weather.hourly.uv_index[getCurrentHourIndex(state.weather)] ?? 0;
  els.weatherAdvice.textContent = buildAdvice(state.weather.current, currentUv, state.weather.daily, els.contextSelect.value, state.airQuality);
  const best = buildBestTime(state.weather);
  els.bestTime.textContent = formatBestTimeText(best, temp(best.t, state.unitSystem));
  renderAlerts(currentUv);
}

function updateFavoriteButton() {
  if (!state.place) return;
  const active = state.favoriteCities.some((city) => cityKey(city) === cityKey(state.place));
  els.favoriteBtn.textContent = active ? '★' : '☆';
  els.favoriteBtn.setAttribute('aria-label', active ? 'Убрать город из избранного' : 'Добавить город в избранное');
}

function renderWeather() {
  const c = state.weather.current;
  const [desc, icon] = WEATHER_CODE_MAP[c.weather_code] || ['Неизвестно', '❔'];
  const currentUv = state.weather.hourly.uv_index[getCurrentHourIndex(state.weather)] ?? 0;
  els.cityName.textContent = `${state.place.name}${state.place.country ? `, ${state.place.country}` : ''}`;
  els.weatherDescription.textContent = desc;
  els.weatherIcon.textContent = icon;
  els.temperature.textContent = temp(c.temperature_2m, state.unitSystem);
  els.feelsLike.textContent = `Ощущается как: ${temp(c.apparent_temperature, state.unitSystem)}`;
  els.humidity.textContent = `${c.relative_humidity_2m}%`;
  els.wind.textContent = speed(c.wind_speed_10m, state.unitSystem);
  els.windDirection.textContent = `${formatDirection(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)`;
  els.pressure.textContent = `${Math.round(c.surface_pressure)} гПа`;
  els.visibility.textContent = distance(c.visibility, state.unitSystem);
  els.cloudCover.textContent = `${c.cloud_cover}%`;
  els.precipitation.textContent = `${c.precipitation} мм`;
  els.uvIndex.textContent = describeUv(currentUv);
  const pm25 = state.airQuality?.current?.pm2_5;
  els.airQuality.textContent = pm25 == null ? 'нет данных' : `PM2.5 ${pm25} мкг/м³ · ${describeAqi(pm25)}`;
  els.sunCycle.textContent = `${formatHour(state.weather.daily.sunrise[0])} / ${formatHour(state.weather.daily.sunset[0])}`;
  renderAdviceAndBestTime();
  renderDayPlan();
  renderChart();
  renderHourly();
  renderWeekly();
  setWeatherTheme(c.weather_code);
  updateFavoriteButton();
  els.weatherCard.classList.remove('hidden');
}

async function handleSearch() {
  const raw = els.cityInput.value.trim();
  if (!raw && !state.selectedSuggestion) { setStatus('Введите название города.', 'error'); return; }
  state.requestController?.abort();
  state.requestController = new AbortController();
  setLoading(true);
  setStatus('Загружаем данные о погоде...');
  try {
    const parsed = parseNaturalQuery(raw);
    state.lastAssistantIntent = parsed.intent;
    const place = state.selectedSuggestion || (await getCoordinates(parsed.city, 1, state.requestController.signal))[0];
    if (!place) throw new Error('Город не найден. Попробуйте уточнить название или выбрать вариант из подсказок.');
    const { weather, airQuality, fromCache, savedAt } = await loadForecast(place, state.requestController.signal);
    state.place = place;
    state.weather = weather;
    state.airQuality = airQuality;
    renderWeather();
    state.recentCities = saveCity(state.recentCities, 'weatherPulseRecent', place);
    renderCityChips();
    if (parsed.intent !== 'weather') addChatMessage(answerQuestion(raw, currentSnapshot()), 'bot');
    setStatus(fromCache ? `Показан кэшированный прогноз от ${new Date(savedAt).toLocaleString('ru-RU')}` : `Обновлено: ${new Date().toLocaleString('ru-RU')}`);
    state.selectedSuggestion = null;
  } catch (error) {
    if (error.name !== 'AbortError') setStatus(error.message || 'Что-то пошло не так. Попробуйте ещё раз.', 'error');
  } finally {
    setLoading(false);
  }
}

function handleGeolocation() {
  if (!navigator.geolocation) { setStatus('Геолокация не поддерживается вашим браузером.', 'error'); return; }
  setLoading(true);
  setStatus('Определяем ваше местоположение...');
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (!city?.name) throw new Error('Не удалось найти ближайший город.');
      state.selectedSuggestion = city;
      els.cityInput.value = placeLabel(city);
      await handleSearch();
    } catch (error) {
      setStatus(error.message, 'error');
      setLoading(false);
    }
  }, () => {
    setStatus('Доступ к геолокации не получен. Введите город вручную.', 'error');
    setLoading(false);
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

function addChatMessage(text, type = 'bot') {
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;
  els.chatLog.appendChild(message);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

async function compareFavorites() {
  const cities = state.favoriteCities.slice(0, 4);
  if (!cities.length) { els.compareList.innerHTML = '<span class="hint">Добавьте города в избранное, чтобы сравнить прогноз.</span>'; return; }
  els.compareList.innerHTML = '<span class="hint">Сравниваем...</span>';
  const rows = await Promise.all(cities.map(async (city) => {
    const { weather } = await loadForecast(city).catch(() => ({}));
    if (!weather) return `<article><strong>${city.name}</strong><span>нет данных</span></article>`;
    const [desc, icon] = WEATHER_CODE_MAP[weather.current.weather_code] || ['—', '❔'];
    return `<article><strong>${city.name}</strong><span>${icon} ${temp(weather.current.temperature_2m, state.unitSystem)}</span><small>${desc} · ☔ ${weather.daily.precipitation_probability_max?.[0] ?? 0}%</small></article>`;
  }));
  els.compareList.innerHTML = rows.join('');
}

async function shareForecast() {
  if (!state.weather) { setStatus('Сначала выберите город.', 'error'); return; }
  const text = `WeatherPulse — ${els.cityName.textContent}\n${els.weatherDescription.textContent}, ${els.temperature.textContent}, ${els.feelsLike.textContent}.\n${els.weatherAdvice.textContent}`;
  if (navigator.share) await navigator.share({ title: 'WeatherPulse', text });
  else {
    await navigator.clipboard.writeText(text);
    setStatus('Прогноз скопирован в буфер обмена.');
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) { setStatus('Уведомления не поддерживаются этим браузером.', 'error'); return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { setStatus('Уведомления не разрешены.', 'error'); return; }
  const alertText = els.alerts.textContent || els.weatherAdvice.textContent || 'Прогноз WeatherPulse обновлён.';
  new Notification('WeatherPulse', { body: alertText.slice(0, 160), icon: 'icon.svg' });
  setStatus('Тестовое уведомление отправлено.');
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setStatus('Голосовой ввод не поддерживается этим браузером.', 'error'); return; }
  const recognition = new Recognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.onresult = (event) => { els.cityInput.value = event.results[0][0].transcript; handleSearch(); };
  recognition.onerror = () => setStatus('Не удалось распознать голосовой запрос.', 'error');
  recognition.start();
  setStatus('Слушаю голосовой запрос...');
}

els.cityInput.addEventListener('input', () => {
  state.selectedSuggestion = null;
  clearTimeout(state.suggestTimer);
  const q = els.cityInput.value.trim();
  if (q.length < 2) { els.suggestions.classList.add('hidden'); els.cityInput.setAttribute('aria-expanded', 'false'); return; }
  state.suggestTimer = setTimeout(async () => {
    try { renderSuggestions(await getCoordinates(q, 6)); } catch { els.suggestions.classList.add('hidden'); }
  }, 250);
});
els.cityInput.addEventListener('blur', () => setTimeout(() => { els.suggestions.classList.add('hidden'); els.cityInput.setAttribute('aria-expanded', 'false'); }, 120));
els.cityInput.addEventListener('focus', () => { if (els.suggestions.children.length) { els.suggestions.classList.remove('hidden'); els.cityInput.setAttribute('aria-expanded', 'true'); } });
els.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
  else if (e.key === 'Escape') { els.suggestions.classList.add('hidden'); els.cityInput.setAttribute('aria-expanded', 'false'); }
  else if (e.key === 'Enter') {
    const active = els.suggestions.querySelector('.suggestion-item.active');
    if (active) { e.preventDefault(); active.click(); } else handleSearch();
  }
});
els.searchBtn.addEventListener('click', handleSearch);
els.geoBtn.addEventListener('click', handleGeolocation);
els.voiceBtn.addEventListener('click', startVoiceInput);
els.metricBtn.addEventListener('click', () => { state.unitSystem = 'metric'; localStorage.setItem('weatherPulseUnits', state.unitSystem); updateUnitButtons(); if (state.weather) renderWeather(); });
els.imperialBtn.addEventListener('click', () => { state.unitSystem = 'imperial'; localStorage.setItem('weatherPulseUnits', state.unitSystem); updateUnitButtons(); if (state.weather) renderWeather(); });
els.contextSelect.addEventListener('change', () => { if (state.weather) renderAdviceAndBestTime(); });
els.chart24Btn.addEventListener('click', () => { state.chartRange = '24h'; els.chart24Btn.classList.add('active'); els.chart7Btn.classList.remove('active'); if (state.weather) renderChart(); });
els.chart7Btn.addEventListener('click', () => { state.chartRange = '7d'; els.chart7Btn.classList.add('active'); els.chart24Btn.classList.remove('active'); if (state.weather) renderChart(); });
els.favoriteBtn.addEventListener('click', () => {
  if (!state.place) return;
  const exists = state.favoriteCities.some((city) => cityKey(city) === cityKey(state.place));
  state.favoriteCities = exists ? state.favoriteCities.filter((city) => cityKey(city) !== cityKey(state.place)) : saveCity(state.favoriteCities, 'weatherPulseFavorites', state.place, 8);
  writeJson('weatherPulseFavorites', state.favoriteCities);
  renderCityChips();
  updateFavoriteButton();
});
els.compareBtn.addEventListener('click', compareFavorites);
els.shareBtn.addEventListener('click', shareForecast);
els.notifyBtn.addEventListener('click', enableNotifications);
els.chatBtn.addEventListener('click', () => {
  const question = els.chatInput.value.trim();
  if (!question) return;
  addChatMessage(question, 'user');
  addChatMessage(answerQuestion(question, currentSnapshot()), 'bot');
  els.chatInput.value = '';
});
els.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.chatBtn.click(); });

updateUnitButtons();
renderCityChips();
addChatMessage('Привет! Можно написать обычный запрос: «Будет ли дождь завтра в Сочи?» или выбрать город и спросить про одежду, прогулку, UV и зонт.');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
