'use strict';

const WEATHER_CACHE_DURATION_MS = 30 * 60 * 1000;

async function fetchJsonWithTimeout(url, options = {}) {
  const fetcher = typeof options.fetcher === 'function' ? options.fetcher : globalThis.fetch;
  if (typeof fetcher !== 'function') throw new TypeError('Weather context requires fetch.');
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { 'User-Agent': 'MaiSakurajima/2.3.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function weatherContext(weather) {
  if (!weather) return '';
  return [
    '\n以下是用户授权城市的公开实时天气：',
    `地点：${weather.locationName || weather.city}；天气：${weather.description}；`,
    `气温：${weather.temperature}℃；体感：${weather.apparentTemperature}℃；风速：${weather.windSpeed} km/h。`,
    '把它作为双方所在现实生活的天气背景；除非对话已经说明你正在户外，否则不要说成自己刚刚亲眼看到的天气。'
  ].join('');
}

function sameCity(left, right) {
  return String(left || '').trim().toLocaleLowerCase('zh-CN')
    === String(right || '').trim().toLocaleLowerCase('zh-CN');
}

function createChatRealityContext(options = {}) {
  for (const name of ['getSettings', 'getMemoryState', 'getDataGeneration', 'getSettingsGeneration', 'isDataWritable', 'saveMemory']) {
    if (typeof options[name] !== 'function') {
      throw new TypeError(`Chat reality context requires ${name}.`);
    }
  }
  const fetcher = typeof options.fetcher === 'function' ? options.fetcher : globalThis.fetch;
  const describeWeather = typeof options.weatherDescription === 'function'
    ? options.weatherDescription
    : ((code) => `天气代码 ${Number(code)}`);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const inFlight = new Map();

  function readConfiguration() {
    const deepseek = options.getSettings()?.deepseek || {};
    const city = String(deepseek.weatherCity || '').trim().slice(0, 80);
    return {
      enabled: deepseek.weatherEnabled === true,
      city,
      dataGeneration: options.getDataGeneration(),
      settingsGeneration: options.getSettingsGeneration()
    };
  }

  function currentConfigurationMatches(captured) {
    const current = readConfiguration();
    return current.enabled === captured.enabled
      && current.city === captured.city
      && current.dataGeneration === captured.dataGeneration
      && current.settingsGeneration === captured.settingsGeneration;
  }

  function requestIsCurrent(requestOptions = {}) {
    if (requestOptions.signal?.aborted) return false;
    if (typeof requestOptions.isCurrent === 'function' && !requestOptions.isCurrent()) return false;
    if (typeof requestOptions.assertRequestCurrent === 'function') {
      try { requestOptions.assertRequestCurrent(); }
      catch { return false; }
    }
    return true;
  }

  function isLeaseCurrent(lease) {
    return lease
      && currentConfigurationMatches(lease.configuration)
      && options.isDataWritable()
      && requestIsCurrent(lease.requestOptions);
  }

  async function fetchCityWeather(city) {
    const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodeUrl.searchParams.set('name', city);
    geocodeUrl.searchParams.set('count', '1');
    geocodeUrl.searchParams.set('language', 'zh');
    geocodeUrl.searchParams.set('format', 'json');
    const geocode = await fetchJsonWithTimeout(geocodeUrl.toString(), { fetcher });
    const location = geocode?.results?.[0];
    if (!location) throw new Error(`没有找到城市“${city}”，请检查名称。`);

    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.searchParams.set('latitude', String(location.latitude));
    weatherUrl.searchParams.set('longitude', String(location.longitude));
    weatherUrl.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
    );
    weatherUrl.searchParams.set('timezone', 'auto');
    const forecast = await fetchJsonWithTimeout(weatherUrl.toString(), { fetcher });
    const current = forecast?.current;
    if (!current) throw new Error('天气服务没有返回当前天气。');
    return {
      city,
      locationName: [location.name, location.admin1, location.country]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · ')
        .slice(0, 100),
      temperature: Number(current.temperature_2m),
      apparentTemperature: Number(current.apparent_temperature),
      weatherCode: Number(current.weather_code),
      description: describeWeather(current.weather_code),
      windSpeed: Number(current.wind_speed_10m),
      fetchedAt: now()
    };
  }

  async function fetchShared(configuration) {
    const key = `${configuration.settingsGeneration}:${configuration.city.toLocaleLowerCase('zh-CN')}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = fetchCityWeather(configuration.city);
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  }

  function createLease(configuration, requestOptions, weather, candidate = null) {
    const lease = { configuration, requestOptions, weather, candidate };
    lease.text = weatherContext(weather);
    lease.isCurrent = () => isLeaseCurrent(lease);
    return lease;
  }

  async function prepare(requestOptions = {}) {
    const configuration = readConfiguration();
    if (!configuration.enabled || !configuration.city) {
      return createLease(configuration, requestOptions, null);
    }
    const cached = options.getMemoryState().reality?.weather || null;
    if (
      requestOptions.force !== true
      && cached
      && sameCity(cached.city, configuration.city)
      && now() - Number(cached.fetchedAt || 0) < WEATHER_CACHE_DURATION_MS
    ) {
      return createLease(configuration, requestOptions, cached);
    }
    try {
      const weather = await fetchShared(configuration);
      if (!currentConfigurationMatches(configuration)) {
        return createLease(configuration, requestOptions, null);
      }
      return createLease(configuration, requestOptions, weather, weather);
    } catch (error) {
      if (requestOptions.force === true) throw error;
      options.onError?.(error);
      const fallback = options.getMemoryState().reality?.weather || null;
      const usableFallback = currentConfigurationMatches(configuration)
        && fallback
        && sameCity(fallback.city, configuration.city)
        ? fallback
        : null;
      return createLease(configuration, requestOptions, usableFallback);
    }
  }

  function commit(lease) {
    if (!lease?.candidate) return Boolean(lease?.isCurrent?.());
    if (!isLeaseCurrent(lease)) return false;
    const state = options.getMemoryState();
    state.reality = { ...(state.reality || {}), weather: lease.candidate };
    return true;
  }

  async function fetchWeather(force = false) {
    const lease = await prepare({ force });
    if (force) {
      if (!lease.weather || !commit(lease)) {
        throw Object.assign(new Error('天气设置或本地数据状态已变化，请重新刷新天气。'), {
          code: 'CHAT_WEATHER_CONTEXT_STALE'
        });
      }
      options.saveMemory();
    }
    return lease.weather;
  }

  return { commit, fetchWeather, prepare };
}

module.exports = {
  WEATHER_CACHE_DURATION_MS,
  createChatRealityContext,
  fetchJsonWithTimeout,
  weatherContext
};
