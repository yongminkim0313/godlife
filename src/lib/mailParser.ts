import type { InstitutionKind, ParsedItem } from '../types';
import { WEEKDAY_LABEL, fromDateKey, pad, uid } from './date';

/**
 * 어린이집·유치원 월 계획표 메일을 일정 후보로 변환한다.
 *
 * 여기서 나온 결과는 절대 바로 등록되지 않는다. 반드시 AI 파싱 검토 화면(기획서 3.3)을
 * 거쳐 사용자가 승인해야 일정이 된다. 그래서 파서는 "확실하지 않으면 낮은 confidence를
 * 붙여서라도 후보를 남기는" 쪽으로 동작한다 — 놓치는 것보다 사용자가 지우는 편이 낫다.
 */

const PREP_KEYWORDS = ['준비물', '준비 물', '지참', '가져오', '가져올', '챙겨', '챙길', '준비해'];
const SKIP_KEYWORDS = ['월간계획표', '월 계획표', '가정통신문', '드립니다', '감사합니다', '원장', '올림', '배상'];

export interface ParseOptions {
  /** 메일 수신 시각. 연/월이 본문에 없을 때 기준으로 쓴다. */
  receivedAt?: Date;
  /** 본문에서 기관을 못 찾았을 때의 기본값 */
  defaultInstitution?: InstitutionKind;
}

export function parseMail(raw: string, options: ParseOptions = {}): ParsedItem[] {
  const receivedAt = options.receivedAt ?? new Date();
  const header = detectHeader(raw, receivedAt);
  const institution = detectInstitution(raw) ?? options.defaultInstitution ?? 'kindergarten';

  const items: ParsedItem[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SKIP_KEYWORDS.some((k) => line.includes(k)) && !PREP_KEYWORDS.some((k) => line.includes(k))) continue;

    const found = findDate(line, header.year, header.month);
    if (!found) continue;

    const time = findTime(line);
    const preparations = findPreparations(line);
    const title = cleanTitle(line, found.matched, time?.matched, preparations.matched);
    if (!title) continue;

    const lineInstitution = detectInstitution(line) ?? institution;
    items.push({
      id: uid('item'),
      title,
      date: found.date,
      time: time?.value,
      institution: lineInstitution,
      preparations: preparations.values,
      confidence: score({ found, hasTime: Boolean(time), title, preparations: preparations.values }),
      sourceLine: line,
      selected: true,
    });
  }

  return dedupe(items);
}

/** 본문 상단의 '2026년 3월' 같은 표기에서 기준 연/월을 잡는다. */
function detectHeader(raw: string, receivedAt: Date): { year: number; month: number } {
  const ym = raw.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월/);
  if (ym) return { year: Number(ym[1]), month: Number(ym[2]) };

  const monthOnly = raw.match(/(?:^|\s)(\d{1,2})\s*월\s*(?:교육|보육)?\s*(?:계획|일정|행사)/);
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    // 12월 계획표가 11월에 오는 식이라, 수신월보다 이르면 다음 해로 본다.
    const year = month < receivedAt.getMonth() + 1 - 6 ? receivedAt.getFullYear() + 1 : receivedAt.getFullYear();
    return { year, month };
  }
  return { year: receivedAt.getFullYear(), month: receivedAt.getMonth() + 1 };
}

export function detectInstitution(text: string): InstitutionKind | null {
  if (text.includes('어린이집')) return 'daycare';
  if (text.includes('유치원')) return 'kindergarten';
  return null;
}

interface DateHit {
  date: string;
  matched: string;
  /** 본문에 월까지 명시됐는지 (일자만 있으면 헤더의 월을 추정해 쓴 것) */
  explicitMonth: boolean;
  /** 본문에 적힌 요일과 실제 요일이 어긋나면 false */
  weekdayOk: boolean | null;
}

export function findDate(line: string, year: number, month: number): DateHit | null {
  // 3월 5일 / 3월 5일(수)
  let m = line.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\(\s*([월화수목금토일])\s*\))?/);
  if (m) return build(Number(m[1]), Number(m[2]), m[3], m[0], true);

  // 3/5 · 03-05 · 3.5 (연도 없는 표기)
  m = line.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*\(\s*([월화수목금토일])\s*\))?(?![\d:])/);
  if (m) return build(Number(m[1]), Number(m[2]), m[3], m[0].trim(), true);

  // 5일(수) · 5(수)  — 월간 계획표 표에서 흔한 형태
  m = line.match(/(?:^|[^\d])(\d{1,2})\s*일?\s*\(\s*([월화수목금토일])\s*\)/);
  if (m) return build(month, Number(m[1]), m[2], m[0].trim(), false);

  return null;

  function build(mm: number, dd: number, weekday: string | undefined, matched: string, explicitMonth: boolean): DateHit | null {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const yy = explicitMonth && mm < month - 6 ? year + 1 : year;
    const date = `${yy}-${pad(mm)}-${pad(dd)}`;
    const parsed = fromDateKey(date);
    if (parsed.getMonth() + 1 !== mm || parsed.getDate() !== dd) return null; // 2월 30일 같은 값 차단
    const weekdayOk = weekday ? WEEKDAY_LABEL[parsed.getDay()] === weekday : null;
    return { date, matched, explicitMonth, weekdayOk };
  }
}

export function findTime(line: string): { value: string; matched: string } | null {
  // 14:30 / 14시 30분
  let m = line.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m) return normalize(Number(m[1]), Number(m[2]), null, m[0]);

  // 오전 10시 / 오후 2시 30분 / 10시
  m = line.match(/(오전|오후)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  if (m) return normalize(Number(m[2]), Number(m[3] ?? 0), m[1] ?? null, m[0]);

  return null;

  function normalize(h: number, min: number, meridiem: string | null, matched: string) {
    let hour = h;
    if (meridiem === '오후' && hour < 12) hour += 12;
    if (meridiem === '오전' && hour === 12) hour = 0;
    if (hour > 23 || min > 59) return null;
    return { value: `${pad(hour)}:${pad(min)}`, matched: matched.trim() };
  }
}

/**
 * 준비물 추출. 계획표 문장은 두 가지 형태로 나온다.
 *   - 명사형: "준비물: 도시락, 물통"        -> 키워드 뒤가 준비물
 *   - 서술형: "(흰색 상의 준비해 주세요)"    -> 키워드 앞이 준비물
 * 두 방향을 모두 본다. matched는 제목에서 걷어낼 구간이다.
 */
export function findPreparations(line: string): { values: string[]; matched?: string } {
  const noun = line.match(/(?:준비물|지참물|준비\s*물)\s*[:：\-–]?\s*/);
  if (noun?.index !== undefined) {
    const values = splitItems(firstClause(line.slice(noun.index + noun[0].length)));
    if (values.length > 0) return { values, matched: line.slice(trimBackToBoundary(line, noun.index)) };
  }

  const verb = line.match(/(?:준비해|챙겨|가져오|가져와|지참해|준비)\s*(?:주세요|주시기\s*바랍니다|주십시오|오세요|와\s*주세요)?/);
  if (verb?.index !== undefined) {
    const head = line.slice(0, verb.index);
    const start = clauseStart(head);
    const values = splitItems(head.slice(start));
    // 여는 괄호까지 함께 지워야 제목에 "(" 가 남지 않는다.
    if (values.length > 0) return { values, matched: line.slice(trimBackToBoundary(line, start > 0 ? start - 1 : 0)) };
  }

  return { values: [] };
}

/** 문장 끝 또는 다음 구분자까지만 준비물 구간으로 본다. */
function firstClause(text: string): string {
  return text.split(/[.。)\]]\s|\s{2,}/)[0] ?? text;
}

/** 서술형에서 준비물이 시작되는 위치: 마지막 여는 괄호/구분자 다음. */
function clauseStart(head: string): number {
  const boundary = Math.max(...['(', '[', ',', '·', '/', '|', '-'].map((c) => head.lastIndexOf(c)));
  return boundary >= 0 ? boundary + 1 : 0;
}

/** 명사형에서 앞쪽 구분자까지 함께 지워야 제목에 "/" 같은 찌꺼기가 남지 않는다. */
function trimBackToBoundary(line: string, index: number): number {
  let start = index;
  while (start > 0 && /[\s/·\-–—|,(]/.test(line[start - 1])) start -= 1;
  return start;
}

const LEADING_NOISE = /^(?:내일|오늘|모레|다음\s*주|이번\s*주|각자|전원|반드시|꼭)\s+/;

function splitItems(segment: string): string[] {
  return segment
    .split(/[,،·、/]|\s및\s|\s그리고\s/)
    .map((s) => s.replace(/[()[\]]/g, '').trim())
    .map((s) => s.replace(LEADING_NOISE, '').trim())
    .map((s) => s.replace(/(?:을|를|이|가|은|는)$/, '').trim())
    .map((s) =>
      s
        .replace(/(?:준비해|챙겨|가져오|가져와|지참해|준비)?\s*(?:주세요|주시기\s*바랍니다|주십시오|오세요|필요합니다|필요)\s*$/, '')
        .trim(),
    )
    .filter((s) => s.length > 0 && s.length <= 30);
}

function cleanTitle(line: string, ...remove: (string | undefined)[]): string {
  let title = line;
  for (const token of remove) if (token) title = title.replace(token, ' ');
  return title
    .replace(/^[\s\-–—*•·|>[\]]+/, '')
    .replace(/[|\t]+/g, ' ')
    .replace(/[\s:：\-–—/·|,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function score(input: { found: DateHit; hasTime: boolean; title: string; preparations: string[] }): number {
  let value = 0.5;
  if (input.found.explicitMonth) value += 0.2;
  if (input.hasTime) value += 0.15;
  if (input.preparations.length > 0) value += 0.05;
  if (input.title.length >= 3) value += 0.1;
  if (input.title.length <= 1) value -= 0.3;
  // 본문 요일과 실제 요일이 어긋나면 AI/원본 어느 쪽이든 오독 가능성이 높다.
  if (input.found.weekdayOk === false) value -= 0.35;
  else if (input.found.weekdayOk === true) value += 0.1;
  return Math.max(0.05, Math.min(1, Number(value.toFixed(2))));
}

/** 같은 날 같은 제목이 여러 줄에 걸쳐 나오면 준비물만 합친다. */
function dedupe(items: ParsedItem[]): ParsedItem[] {
  const map = new Map<string, ParsedItem>();
  for (const item of items) {
    const key = `${item.date}|${item.title}|${item.time ?? ''}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    existing.preparations = [...new Set([...existing.preparations, ...item.preparations])];
    existing.confidence = Math.max(existing.confidence, item.confidence);
  }
  return [...map.values()].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

export const LOW_CONFIDENCE = 0.6;
