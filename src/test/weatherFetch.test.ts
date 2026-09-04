import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchForecast } from '../lib/weather';
import { DEFAULT_SETTINGS, db } from '../lib/db';

const region = DEFAULT_SETTINGS.region;

const RESPONSE = {
  daily: {
    time: ['2026-03-02', '2026-03-03'],
    weather_code: [0, 61],
    temperature_2m_max: [14.4, 11.2],
    temperature_2m_min: [3.1, 5.8],
    precipitation_probability_max: [0, null],
  },
};

describe('fetchForecast', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('응답을 일별 예보로 변환해 캐시에 저장한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => RESPONSE })));
    const cache = await fetchForecast(region);
    expect(cache?.forecast).toEqual([
      { date: '2026-03-02', code: 0, tempMax: 14, tempMin: 3, precipProbability: 0 },
      { date: '2026-03-03', code: 61, tempMax: 11, tempMin: 6, precipProbability: 0 },
    ]);
    expect(db.loadWeather()?.region.name).toBe(region.name);
  });

  it('캐시가 신선하면 네트워크를 다시 타지 않는다', async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => RESPONSE }));
    vi.stubGlobal('fetch', spy);
    await fetchForecast(region);
    await fetchForecast(region);
    expect(spy).toHaveBeenCalledTimes(1);
    await fetchForecast(region, { force: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('요청이 실패하면 마지막 캐시를 그대로 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => RESPONSE })));
    await fetchForecast(region);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const cache = await fetchForecast(region, { force: true });
    expect(cache?.forecast).toHaveLength(2);
  });

  it('오프라인이면 요청하지 않고 캐시를 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => RESPONSE })));
    await fetchForecast(region);
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const cache = await fetchForecast(region, { force: true });
    expect(spy).not.toHaveBeenCalled();
    expect(cache?.forecast).toHaveLength(2);
  });
});
