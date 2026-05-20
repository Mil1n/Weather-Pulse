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
const sunCycleEl = document.getElementById('sunCycle');
const hourlyListEl = document.getElementById('hourlyList');

let selectedSuggestion = null;
let suggestTimer;
let detectedCity = null;

const weatherCodeMap = { 0:['Ясно','☀️'],1:['Преимущественно ясно','🌤️'],2:['Переменная облачность','⛅'],3:['Пасмурно','☁️'],45:['Туман','🌫️'],51:['Морось','🌦️'],61:['Небольшой дождь','🌦️'],63:['Дождь','🌧️'],65:['Сильный дождь','⛈️'],71:['Снег','🌨️'],80:['Ливень','🌧️'],95:['Гроза','⛈️'] };

function formatDirection(deg) {
  const dirs = ['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'];
  return dirs[Math.round((deg % 360) / 45) % 8];
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,visibility,cloud_cover,precipitation&hourly=temperature_2m,weather_code,precipitation_probability&daily=sunrise,sunset&forecast_days=1&timezone=auto`;
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
  const { time, temperature_2m, weather_code, precipitation_probability } = weather.hourly;
  const nowHour = new Date().getHours();
  for (let i = nowHour; i < Math.min(nowHour + 8, time.length); i += 1) {
    const hour = new Date(time[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const [_, icon] = weatherCodeMap[weather_code[i]] || ['—', '❔'];
    const item = document.createElement('div');
    item.className = 'hourly-item';
    item.innerHTML = `<strong>${hour}</strong><div>${icon} ${Math.round(temperature_2m[i])}°C</div><small>Осадки: ${precipitation_probability[i] ?? 0}%</small>`;
    hourlyListEl.appendChild(item);
  }
}

function renderWeather(city, weatherData) {
  const c = weatherData.current;
  const [desc, icon] = weatherCodeMap[c.weather_code] || ['Неизвестно', '❔'];
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
  const sunrise = new Date(weatherData.daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(weatherData.daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  sunCycleEl.textContent = `${sunrise} / ${sunset}`;
  renderHourly(weatherData);
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
    statusEl.textContent = `Обновлено: ${new Date().toLocaleString()}`;
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
