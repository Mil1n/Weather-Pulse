const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const weatherCard = document.getElementById('weatherCard');

const cityNameEl = document.getElementById('cityName');
const weatherDescriptionEl = document.getElementById('weatherDescription');
const weatherIconEl = document.getElementById('weatherIcon');
const temperatureEl = document.getElementById('temperature');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind');
const pressureEl = document.getElementById('pressure');
const visibilityEl = document.getElementById('visibility');

const weatherCodeMap = {
  0: { desc: 'Ясно', icon: '☀️' },
  1: { desc: 'Преимущественно ясно', icon: '🌤️' },
  2: { desc: 'Переменная облачность', icon: '⛅' },
  3: { desc: 'Пасмурно', icon: '☁️' },
  45: { desc: 'Туман', icon: '🌫️' },
  48: { desc: 'Инейный туман', icon: '🌫️' },
  51: { desc: 'Морось', icon: '🌦️' },
  53: { desc: 'Умеренная морось', icon: '🌦️' },
  55: { desc: 'Сильная морось', icon: '🌧️' },
  61: { desc: 'Небольшой дождь', icon: '🌦️' },
  63: { desc: 'Дождь', icon: '🌧️' },
  65: { desc: 'Сильный дождь', icon: '⛈️' },
  71: { desc: 'Снег', icon: '🌨️' },
  80: { desc: 'Ливень', icon: '🌧️' },
  95: { desc: 'Гроза', icon: '⛈️' }
};

async function getCoordinates(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось найти город.');
  const data = await res.json();
  if (!data.results || !data.results.length) {
    throw new Error('Город не найден. Попробуйте уточнить название.');
  }
  return data.results[0];
}

async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,visibility&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ошибка запроса погоды.');
  return res.json();
}

function renderWeather(city, weatherData) {
  const current = weatherData.current;
  const weatherMeta = weatherCodeMap[current.weather_code] || { desc: 'Неизвестно', icon: '❔' };

  cityNameEl.textContent = `${city.name}${city.country ? `, ${city.country}` : ''}`;
  weatherDescriptionEl.textContent = weatherMeta.desc;
  weatherIconEl.textContent = weatherMeta.icon;

  temperatureEl.textContent = `${Math.round(current.temperature_2m)}°C`;
  humidityEl.textContent = `${current.relative_humidity_2m}%`;
  windEl.textContent = `${current.wind_speed_10m} км/ч`;
  pressureEl.textContent = `${Math.round(current.surface_pressure)} гПа`;
  visibilityEl.textContent = `${Math.round((current.visibility || 0) / 1000)} км`;

  weatherCard.classList.remove('hidden');
}

async function handleSearch() {
  const city = cityInput.value.trim();
  if (!city) {
    statusEl.textContent = 'Введите название города.';
    return;
  }

  statusEl.textContent = 'Загружаем данные о погоде...';

  try {
    const place = await getCoordinates(city);
    const weather = await getWeather(place.latitude, place.longitude);
    renderWeather(place, weather);
    statusEl.textContent = `Обновлено: ${new Date().toLocaleString()}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearch();
});
