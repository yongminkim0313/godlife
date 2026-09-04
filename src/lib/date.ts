/** 날짜 유틸. 앱 전체가 "로컬 타임존 + YYYY-MM-DD 키" 조합으로 동작한다. */

export const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date -> 'YYYY-MM-DD' (로컬 기준) */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> 그 날 00:00의 Date */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' + 'HH:mm' -> Date */
export function atTime(key: string, time: string): Date {
  const [h, min] = time.split(':').map(Number);
  const d = fromDateKey(key);
  d.setHours(h, min, 0, 0);
  return d;
}

export function toTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 달력 그리드용: 해당 월을 감싸는 일요일~토요일 6주 배열. */
export function monthGrid(d: Date): string[][] {
  const first = startOfMonth(d);
  const gridStart = addDays(first, -first.getDay());
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) week.push(toDateKey(addDays(gridStart, w * 7 + i)));
    weeks.push(week);
  }
  return weeks;
}

export function sameDateKey(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** '3월 5일', '오늘 14:30' 같은 사람이 읽는 라벨. */
export function humanDate(key: string, now = new Date()): string {
  const target = fromDateKey(key);
  const diff = Math.round((target.getTime() - fromDateKey(toDateKey(now)).getTime()) / 86_400_000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  return `${target.getMonth() + 1}월 ${target.getDate()}일 (${WEEKDAY_LABEL[target.getDay()]})`;
}

/** '1시간 20분 후' 형태의 남은 시간 표기. */
export function relativeLabel(iso: string, now = new Date()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (diffMin < -60) return '지난 일정';
  if (diffMin < 0) return '진행 중';
  if (diffMin < 60) return `${diffMin}분 후`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return diffMin % 60 === 0 ? `${hours}시간 후` : `${hours}시간 ${diffMin % 60}분 후`;
  return `${Math.floor(hours / 24)}일 후`;
}

export function offsetLabel(minutes: number): string {
  if (minutes >= 1440) return `${minutes / 1440}일 전`;
  if (minutes >= 60) return `${minutes / 60}시간 전`;
  return `${minutes}분 전`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
