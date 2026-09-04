import { describe, expect, it } from 'vitest';
import { findDate, findPreparations, findTime, parseMail } from '../lib/mailParser';

const RECEIVED = new Date(2026, 2, 1); // 2026-03-01

describe('findDate', () => {
  it('"3월 5일(목)" 형태를 읽는다', () => {
    const hit = findDate('3월 5일(목) 봄나들이', 2026, 3);
    expect(hit?.date).toBe('2026-03-05');
    expect(hit?.explicitMonth).toBe(true);
    expect(hit?.weekdayOk).toBe(true);
  });

  it('본문 요일이 실제와 다르면 표시한다', () => {
    expect(findDate('3월 5일(월) 봄나들이', 2026, 3)?.weekdayOk).toBe(false);
  });

  it('"5(목)" 처럼 일자만 있으면 헤더의 월을 쓴다', () => {
    const hit = findDate('5(목) | 소방훈련', 2026, 3);
    expect(hit?.date).toBe('2026-03-05');
    expect(hit?.explicitMonth).toBe(false);
  });

  it('3/5 형태를 읽고 시각과 혼동하지 않는다', () => {
    expect(findDate('3/5 견학', 2026, 3)?.date).toBe('2026-03-05');
    expect(findDate('행사 14:30 시작', 2026, 3)).toBeNull();
  });

  it('존재하지 않는 날짜는 버린다', () => {
    expect(findDate('2월 30일 행사', 2026, 2)).toBeNull();
  });

  it('12월 계획표가 이듬해로 넘어가지 않게 연도를 보정한다', () => {
    expect(findDate('1월 5일 신년행사', 2026, 12)?.date).toBe('2027-01-05');
  });
});

describe('findTime', () => {
  it.each([
    ['10:00 텃밭', '10:00'],
    ['오전 9시 30분 등원', '09:30'],
    ['오후 2시 하원', '14:00'],
    ['오후 12시 점심', '12:00'],
    ['오전 12시 자정', '00:00'],
    ['14시 견학', '14:00'],
  ])('%s -> %s', (line, expected) => {
    expect(findTime(line)?.value).toBe(expected);
  });

  it('시간이 없으면 null', () => {
    expect(findTime('봄 소풍')).toBeNull();
  });
});

describe('findPreparations', () => {
  it('쉼표·가운뎃점으로 나눈다', () => {
    expect(findPreparations('봄 소풍 준비물: 도시락, 물통 · 돗자리').values).toEqual(['도시락', '물통', '돗자리']);
  });

  it('"준비해 주세요" 같은 서술형 어미를 떼어낸다', () => {
    expect(findPreparations('생일 파티 (흰색 상의 준비해 주세요)').values).toEqual(['흰색 상의']);
  });

  it('준비물이 없으면 빈 배열', () => {
    expect(findPreparations('소방 대피 훈련').values).toEqual([]);
  });
});

describe('parseMail', () => {
  const mail = [
    '2026년 3월 유치원 월간 교육계획표',
    '안녕하세요, 한 달 일정 안내드립니다.',
    '',
    '3월 5일(목) 10:00 텃밭 가꾸기 - 준비물: 장화, 모자',
    '3월 9일(월) 09:30 소방 대피 훈련',
    '3월 12일(목) 오전 10시 봄 소풍 / 준비물: 도시락, 물통',
    '3월 20일(금) 생일 파티 (흰색 상의 준비해 주세요)',
    '',
    '감사합니다. 원장 올림',
  ].join('\n');

  it('일정 후보를 날짜순으로 뽑는다', () => {
    const items = parseMail(mail, { receivedAt: RECEIVED });
    expect(items.map((i) => i.date)).toEqual(['2026-03-05', '2026-03-09', '2026-03-12', '2026-03-20']);
    expect(items.map((i) => i.title)).toEqual(['텃밭 가꾸기', '소방 대피 훈련', '봄 소풍', '생일 파티']);
  });

  it('시간과 준비물을 함께 추출한다', () => {
    const items = parseMail(mail, { receivedAt: RECEIVED });
    expect(items[0].time).toBe('10:00');
    expect(items[0].preparations).toEqual(['장화', '모자']);
    expect(items[2].time).toBe('10:00');
    expect(items[2].preparations).toEqual(['도시락', '물통']);
    expect(items[3].time).toBeUndefined();
    expect(items[3].preparations).toEqual(['흰색 상의']);
  });

  it('헤더에서 기관을 잡아낸다', () => {
    expect(parseMail(mail, { receivedAt: RECEIVED }).every((i) => i.institution === 'kindergarten')).toBe(true);
    const daycare = parseMail('2026년 3월 어린이집 계획표\n3월 5일(목) 10:00 물놀이', { receivedAt: RECEIVED });
    expect(daycare[0].institution).toBe('daycare');
  });

  it('인사말·서명 줄은 후보로 만들지 않는다', () => {
    const items = parseMail(mail, { receivedAt: RECEIVED });
    expect(items.some((i) => i.title.includes('감사'))).toBe(false);
    expect(items.some((i) => i.title.includes('안녕하세요'))).toBe(false);
  });

  it('요일이 어긋난 줄은 낮은 confidence로 표시한다', () => {
    const [ok] = parseMail('2026년 3월 유치원\n3월 5일(목) 10:00 텃밭', { receivedAt: RECEIVED });
    const [bad] = parseMail('2026년 3월 유치원\n3월 5일(월) 10:00 텃밭', { receivedAt: RECEIVED });
    expect(bad.confidence).toBeLessThan(ok.confidence);
    expect(bad.confidence).toBeLessThan(0.6);
  });

  it('모든 항목은 기본으로 선택되고 원문 줄을 보관한다', () => {
    for (const item of parseMail(mail, { receivedAt: RECEIVED })) {
      expect(item.selected).toBe(true);
      expect(item.sourceLine.length).toBeGreaterThan(0);
    }
  });

  it('같은 날 같은 일정이 두 줄이면 준비물을 합친다', () => {
    const items = parseMail(
      ['2026년 3월 유치원', '3월 5일(목) 10:00 봄 소풍 준비물: 도시락', '3월 5일(목) 10:00 봄 소풍 준비물: 물통'].join('\n'),
      { receivedAt: RECEIVED },
    );
    expect(items).toHaveLength(1);
    expect(items[0].preparations).toEqual(['도시락', '물통']);
  });

  it('일정이 없는 본문은 빈 배열', () => {
    expect(parseMail('안녕하세요. 별다른 안내가 없습니다.', { receivedAt: RECEIVED })).toEqual([]);
  });
});
