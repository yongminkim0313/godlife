import type { DailyForecast, Region, WeatherCache } from '../types';
import { db } from './db';

/** 날씨 연동 (기획서 3.1). Open-Meteo는 키가 필요 없어 클라이언트에서 바로 호출한다. */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
/** 캐시 유효시간: 3시간. 만료돼도 오프라인이면 만료 캐시를 그대로 쓴다. */
const TTL_MS = 3 * 60 * 60 * 1000;

export const PRESET_REGIONS: Region[] = [
  { name: '서울', latitude: 37.5665, longitude: 126.978 },
  { name: '부산', latitude: 35.1796, longitude: 129.0756 },
  { name: '대구', latitude: 35.8714, longitude: 128.6014 },
  { name: '인천', latitude: 37.4563, longitude: 126.7052 },
  { name: '광주', latitude: 35.1595, longitude: 126.8526 },
  { name: '대전', latitude: 36.3504, longitude: 127.3845 },
  { name: '울산', latitude: 35.5384, longitude: 129.3114 },
  { name: '세종', latitude: 36.48, longitude: 127.289 },
  { name: '수원', latitude: 37.2636, longitude: 127.0286 },
  { name: '성남', latitude: 37.42, longitude: 127.1265 },
  { name: '고양', latitude: 37.6584, longitude: 126.832 },
  { name: '용인', latitude: 37.2411, longitude: 127.1776 },
  { name: '제주', latitude: 33.4996, longitude: 126.5312 },
];

/** WMO weather code -> 아이콘/라벨 */
export function describeWeather(code: number): { icon: string; label: string; wet: boolean } {
  if (code === 0) return { icon: '☀️', label: '맑음', wet: false };
  if (code <= 2) return { icon: '🌤️', label: '구름 조금', wet: false };
  if (code === 3) return { icon: '☁️', label: '흐림', wet: false };
  if (code <= 48) return { icon: '🌫️', label: '안개', wet: false };
  if (code <= 57) return { icon: '🌦️', label: '이슬비', wet: true };
  if (code <= 67) return { icon: '🌧️', label: '비', wet: true };
  if (code <= 77) return { icon: '🌨️', label: '눈', wet: true };
  if (code <= 82) return { icon: '🌧️', label: '소나기', wet: true };
  if (code <= 86) return { icon: '🌨️', label: '눈', wet: true };
  return { icon: '⛈️', label: '뇌우', wet: true };
}

/** 비/눈 예보 여부. 별도 알림(3.1)의 판단 기준. */
export function isWetForecast(forecast: DailyForecast): boolean {
  return describeWeather(forecast.code).wet || forecast.precipProbability >= 60;
}

export function forecastFor(cache: WeatherCache | null, date: string): DailyForecast | undefined {
  return cache?.forecast.find((f) => f.date === date);
}

export function isStale(cache: WeatherCache | null): boolean {
  if (!cache) return true;
  return Date.now() - new Date(cache.cachedAt).getTime() > TTL_MS;
}

export async function searchRegion(query: string): Promise<Region[]> {
  const url = `${GEOCODE}?name=${encodeURIComponent(query)}&count=8&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`지역 검색 실패 (${res.status})`);
  const json = (await res.json()) as { results?: { name: string; admin1?: string; latitude: number; longitude: number }[] };
  return (json.results ?? []).map((r) => ({
    name: r.admin1 && !r.name.includes(r.admin1) ? `${r.name} (${r.admin1})` : r.name,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

/**
 * 예보를 가져와 캐시에 저장한다. 실패하거나 오프라인이면 마지막 캐시를 그대로 돌려준다
 * (오프라인에서도 홈/위젯의 날씨 칸이 비어 보이지 않게).
 */
export async function fetchForecast(region: Region, options: { force?: boolean } = {}): Promise<WeatherCache | null> {
  const cached = db.loadWeather();
  const sameRegion = cached?.region.name === region.name;
  if (!options.force && sameRegion && !isStale(cached)) return cached;
  if (!navigator.onLine) return cached;

  try {
    const url =
      `${ENDPOINT}?latitude=${region.latitude}&longitude=${region.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&forecast_days=16&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`날씨 조회 실패 (${res.status})`);
    const json = (await res.json()) as {
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: (number | null)[];
      };
    };
    const forecast: DailyForecast[] = json.daily.time.map((date, i) => ({
      date,
      code: json.daily.weather_code[i] ?? 0,
      tempMax: Math.round(json.daily.temperature_2m_max[i] ?? 0),
      tempMin: Math.round(json.daily.temperature_2m_min[i] ?? 0),
      precipProbability: json.daily.precipitation_probability_max[i] ?? 0,
    }));
    const cache: WeatherCache = { region, forecast, cachedAt: new Date().toISOString() };
    db.saveWeather(cache);
    return cache;
  } catch (error) {
    console.warn('[weather] 예보를 갱신하지 못해 캐시를 사용합니다.', error);
    return cached;
  }
}
