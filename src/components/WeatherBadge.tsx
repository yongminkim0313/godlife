import type { DailyForecast } from '../types';
import { describeWeather, isWetForecast } from '../lib/weather';

export function WeatherBadge({ forecast }: { forecast?: DailyForecast }) {
  if (!forecast) return null;
  const { icon, label } = describeWeather(forecast.code);
  const wet = isWetForecast(forecast);
  return (
    <span className={`badge ${wet ? 'warn' : ''}`}>
      {icon} {label} {forecast.tempMin}°/{forecast.tempMax}°
      {forecast.precipProbability > 0 ? ` · 강수 ${forecast.precipProbability}%` : ''}
    </span>
  );
}
