const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const weatherCard = document.getElementById('weatherCard');
const suggestionsEl = document.getElementById('suggestions');
const geoPromptEl = document.getElementById('geoPrompt');
const geoPromptTextEl = document.getElementById('geoPromptText');
const geoUseBtn = document.getElementById('geoUseBtn');
const geoDismissBtn = document.getElementById('geoDismissBtn');

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
let detectedCity = null;

const weatherCodeMap = {
  0: ['Ясно', '☀️'],
  1: ['Преимущественно ясно', '🌤️'],
  2: ['Переменная облачность', '⛅'],
  3: ['Пасмурно', '☁️'],
  45: ['Туман', '🌫️'],
  48: ['Инейный туман', '🌫️'],
  51: ['Лёгкая морось', '🌦️'],
  53: ['Морось', '🌦️'],
  55: ['Сильная морось', '🌧️'],
  61: ['Небольшой дождь', '🌦️'],
  63: ['Дождь', '🌧️'],
  65: ['Сильный дождь', '⛈️'],
  71: ['Небольшой снег', '🌨️'],
  73: ['Снег', '🌨️'],
  75: ['Сильный снег', '❄️'],
  80: ['Кратковременный дождь', '🌧️'],
  81: ['Ливень', '🌧️'],
  82: ['Сильный ливень', '⛈️'],
  95: ['Гроза', '⛈️'],
  96: ['Гроза с градом', '⛈️'],
  99: ['Сильная гроза с градом', '⛈️'],
};

function formatDirection(deg) {
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

function formatDay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function describeUv(uv) {
  if (uv == null) return '—';
  if (uv < 3) return `${uv.toFixed(1)} низкий`;
  if (uv < 6) return `${uv.toFixed(1)} умеренный`;
  if (uv < 8) return `${uv.toFixed(1)} высокий`;
  if (uv < 11) return `${uv.toFixed(1)} очень высокий`;
  return `${uv.toFixed(1)} экстремальный`;
}

function getCurrentHourIndex(weather) {
  const currentTime = new Date(weather.current.time).getTime();
  const exactIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() === currentTime);
  if (exactIndex >= 0) return exactIndex;
  const nextIndex = weather.hourly.time.findIndex((time) => new Date(time).getTime() > currentTime);
  return nextIndex >= 0 ? nextIndex : 0;
}

function buildAdvice(current, currentUv, daily) {
  const tips = [];
  const precipitationProbability = daily.precipitation_probability_max?.[0] ?? 0;
  const weatherCode = current.weather_code;

  if (current.precipitation > 0 || precipitationProbability >= 45 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode)) {
    tips.push('возьми зонт или лёгкий дождевик');
  }

  if (current.temperature_2m >= 28) tips.push('жарко — держи под рукой воду и выбирай лёгкую одежду');
  else if (current.temperature_2m <= 0) tips.push('морозно — утеплись и проверь обувь на скольжение');
  else if (current.temperature_2m <= 10) tips.push('прохладно — лучше надеть слой потеплее');
  else tips.push('температура комфортная для прогулки');

  if (current.wind_speed_10m >= 35) tips.push('ветер сильный — избегай зон под деревьями и вывесками');
  else if (current.wind_speed_10m >= 20) tips.push('ветрено — капюшон или ветровка пригодятся');

  if (currentUv >= 6) tips.push('UV высокий — используй SPF и очки');
  else if (currentUv >= 3) tips.push('UV умеренный — SPF пригодится при долгой прогулке');

  if (current.relative_humidity_2m >= 80 && current.temperature_2m >= 20) tips.push('влажно — выбирай дышащую ткань');

  return tips.join('; ') + '.';
}

async function getCoordinates(city, count = 1) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=${count}&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось найти город.');
  const data = await res.json();
  return data.results || [];
}

async function reverseGeocode(lat, lon) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось определить город по геолокации.');
  const data = await res.json();
  return data.results?.[0] || null;
}

async function getWeather(lat, lon) {
  const current = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,visibility,cloud_cover,precipitation';
  const hourly = 'temperature_2m,weather_code,precipitation_probability,uv_index';
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${current}&hourly=${hourly}&daily=${daily}&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ошибка запроса погоды.');
  return res.json();
}

function renderSuggestions(cities) {
  suggestionsEl.innerHTML = '';
  if (!cities.length) return suggestionsEl.classList.add('hidden');
  cities.forEach((city) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}${city.country ? `, ${city.country}` : ''}`;
    item.addEventListener('click', () => {
      selectedSuggestion = city;
      cityInput.value = item.textContent;
      suggestionsEl.classList.add('hidden');
      handleSearch();
    });
    suggestionsEl.appendChild(item);
  });
  suggestionsEl.classList.remove('hidden');
}

function renderHourly(weather) {
  hourlyListEl.innerHTML = '';
  const { time, temperature_2m, weather_code, precipitation_probability, uv_index } = weather.hourly;
  const startIndex = getCurrentHourIndex(weather);
  for (let i = startIndex; i < Math.min(startIndex + 8, time.length); i += 1) {
    const hour = new Date(time[i]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const [_, icon] = weatherCodeMap[weather_code[i]] || ['—', '❔'];
    const item = document.createElement('div');
    item.className = 'hourly-item';
    item.innerHTML = `<strong>${hour}</strong><div>${icon} ${Math.round(temperature_2m[i])}°C</div><small>Осадки: ${precipitation_probability[i] ?? 0}%</small><small>UV: ${(uv_index[i] ?? 0).toFixed(1)}</small>`;
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
    item.innerHTML = `
      <strong>${formatDay(day)}</strong>
      <span class="weekly-icon">${icon}</span>
      <p>${desc}</p>
      <small>🌡️ ${Math.round(daily.temperature_2m_min[index])}° / ${Math.round(daily.temperature_2m_max[index])}°C</small>
      <small>☔ ${rainChance}% · ☀️ UV ${Math.round(daily.uv_index_max[index] ?? 0)}</small>
      <em>${dayAdvice}</em>
    `;
    weeklyListEl.appendChild(item);
  });
}

function renderWeather(city, weatherData) {
  const c = weatherData.current;
  const [desc, icon] = weatherCodeMap[c.weather_code] || ['Неизвестно', '❔'];
  const currentHourIndex = getCurrentHourIndex(weatherData);
  const currentUv = weatherData.hourly.uv_index[currentHourIndex] ?? 0;

  cityNameEl.textContent = `${city.name}${city.country ? `, ${city.country}` : ''}`;
  weatherDescriptionEl.textContent = desc;
  weatherIconEl.textContent = icon;
  temperatureEl.textContent = `${Math.round(c.temperature_2m)}°C`;
  feelsLikeEl.textContent = `Ощущается как: ${Math.round(c.apparent_temperature)}°C`;
  humidityEl.textContent = `${c.relative_humidity_2m}%`;
  windEl.textContent = `${c.wind_speed_10m} км/ч`;
  windDirectionEl.textContent = `${formatDirection(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)`;
  pressureEl.textContent = `${Math.round(c.surface_pressure)} гПа`;
  visibilityEl.textContent = `${Math.round((c.visibility || 0) / 1000)} км`;
  cloudCoverEl.textContent = `${c.cloud_cover}%`;
  precipitationEl.textContent = `${c.precipitation} мм`;
  uvIndexEl.textContent = describeUv(currentUv);
  weatherAdviceEl.textContent = buildAdvice(c, currentUv, weatherData.daily);

  const sunrise = new Date(weatherData.daily.sunrise[0]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(weatherData.daily.sunset[0]).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  sunCycleEl.textContent = `${sunrise} / ${sunset}`;
  renderHourly(weatherData);
  renderWeekly(weatherData);
  weatherCard.classList.remove('hidden');
}

async function handleSearch() {
  const raw = cityInput.value.trim();
  if (!raw && !selectedSuggestion) return (statusEl.textContent = 'Введите название города.');
  statusEl.textContent = 'Загружаем данные о погоде...';
  try {
    const place = selectedSuggestion || (await getCoordinates(raw, 1))[0];
    if (!place) throw new Error('Город не найден. Попробуйте уточнить название.');
    const weather = await getWeather(place.latitude, place.longitude);
    renderWeather(place, weather);
    statusEl.textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;
    selectedSuggestion = null;
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

function showGeoPrompt(city) {
  detectedCity = city;
  geoPromptTextEl.textContent = `Вы находитесь в городе "${city.name}"?`;
  geoPromptEl.classList.remove('hidden');
}

function initGeolocationPrompt() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (city?.name) showGeoPrompt(city);
    } catch {
      // silent fallback
    }
  }, () => {
    // user denied or unavailable
  }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
}

cityInput.addEventListener('input', () => {
  selectedSuggestion = null;
  clearTimeout(suggestTimer);
  const q = cityInput.value.trim();
  if (q.length < 2) return suggestionsEl.classList.add('hidden');
  suggestTimer = setTimeout(async () => {
    try { renderSuggestions(await getCoordinates(q, 6)); } catch { suggestionsEl.classList.add('hidden'); }
  }, 250);
});
cityInput.addEventListener('blur', () => setTimeout(() => suggestionsEl.classList.add('hidden'), 120));
cityInput.addEventListener('focus', () => { if (suggestionsEl.children.length) suggestionsEl.classList.remove('hidden'); });
searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSearch(); });
geoUseBtn.addEventListener('click', async () => {
  if (!detectedCity) return;
  selectedSuggestion = detectedCity;
  cityInput.value = `${detectedCity.name}${detectedCity.country ? `, ${detectedCity.country}` : ''}`;
  geoPromptEl.classList.add('hidden');
  await handleSearch();
});
geoDismissBtn.addEventListener('click', () => geoPromptEl.classList.add('hidden'));

initGeolocationPrompt();
