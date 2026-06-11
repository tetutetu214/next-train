// ===== timetable.ts のテスト =====
// 外部APIへの依存なし:
// - getCalendarType は Date オブジェクトのみ使うため固定日付でテスト可能。
// - getNextDeparture / minutesUntil は純粋関数。
// - japanese-holidays パッケージが利用可能であれば実際のパッケージを使う（本物の祝日データを使うほうが
//   将来の祝日追加や変更を検知できるため）。パッケージが未インストールの場合は
//   祝日判定部分のテストをスキップするか固定日付を使う。

import { describe, it, expect } from 'vitest';
import { getCalendarType, getNextDeparture, minutesUntil } from '../timetable';

// 固定日付を使ってテストを決定論的にする
// 2024-01-01 = 月曜日かつ元日（祝日）
// 2024-01-06 = 土曜日
// 2024-01-08 = 月曜日（成人の日）
// 2024-04-03 = 水曜日（平日）

/** 固定日付を作る（時刻を指定可能） */
function makeDate(
  year: number,
  month: number, // 1-indexed
  day: number,
  hour = 12,
  minute = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe('getCalendarType', () => {
  it('祝日でない土曜は土曜ダイヤを選ぶ', () => {
    const saturday = makeDate(2024, 1, 6); // 2024-01-06 土曜（祝日でない）
    expect(getCalendarType(saturday)).toBe('Saturday');
  });

  it('日曜は日祝ダイヤを選ぶ', () => {
    const sunday = makeDate(2024, 1, 7); // 2024-01-07 日曜
    expect(getCalendarType(sunday)).toBe('Holiday');
  });

  it('平日（水曜）は平日ダイヤを選ぶ', () => {
    const wednesday = makeDate(2024, 4, 3); // 2024-04-03 水曜
    expect(getCalendarType(wednesday)).toBe('Weekday');
  });

  it('平日の祝日（成人の日・月曜）は日祝ダイヤを選ぶ', () => {
    // 2024-01-08 は成人の日（月曜）。平日だが祝日なので Holiday
    const comingOfAge = makeDate(2024, 1, 8);
    expect(getCalendarType(comingOfAge)).toBe('Holiday');
  });

  it('土曜かつ祝日は土曜より日祝を優先して日祝ダイヤを選ぶ', () => {
    // 2024-05-04 は土曜（getDay()===6）かつみどりの日（祝日）。
    // 「土曜かつ祝日でない→Saturday」の条件分岐順序が逆だと Saturday に倒れるため、
    // 優先順位（日祝が土曜より先）を保証する回帰テスト。
    const greeneryDayOnSaturday = makeDate(2024, 5, 4);
    expect(getCalendarType(greeneryDayOnSaturday)).toBe('Holiday');
  });
});

describe('getNextDeparture', () => {
  it('現在時刻以降で最も早い発車を返す', () => {
    // 現在時刻: 12:00
    const now = makeDate(2024, 4, 3, 12, 0);
    const departures = ['11:30', '12:05', '12:20', '12:45'];

    const result = getNextDeparture(departures, now);

    expect(result.time).toBe('12:05');
    expect(result.minutesUntil).toBe(5);
  });

  it('ちょうど今の時刻の電車は次発として扱う', () => {
    // 現在時刻: 12:00 → 12:00発は次発（まもなく）
    const now = makeDate(2024, 4, 3, 12, 0);
    const departures = ['11:30', '12:00', '12:20'];

    const result = getNextDeparture(departures, now);

    expect(result.time).toBe('12:00');
    expect(result.minutesUntil).toBe(0);
  });

  it('終電後（現在時刻以降の発車なし）は運行終了を示す値を返す', () => {
    // 現在時刻: 23:30 → 最終が23:00発のため終電後
    const now = makeDate(2024, 4, 3, 23, 30);
    const departures = ['05:00', '10:00', '23:00'];

    const result = getNextDeparture(departures, now);

    expect(result.time).toBeNull();
    expect(result.minutesUntil).toBe('ended');
  });

  it('発車時刻リストが空のとき運行終了を示す値を返す', () => {
    const now = makeDate(2024, 4, 3, 12, 0);

    const result = getNextDeparture([], now);

    expect(result.time).toBeNull();
    expect(result.minutesUntil).toBe('ended');
  });

  it('日付変更跨ぎ（25時表記）を正しく扱う', () => {
    // 現在時刻: 00:30 → 25:15 = 翌1:15 として計算
    // 0:30 = 30分, 25:15 = 1515分 → diff = 1485分
    const now = makeDate(2024, 4, 3, 0, 30);
    const departures = ['25:15']; // 深夜1:15に発車（25時表記）

    const result = getNextDeparture(departures, now);

    expect(result.time).toBe('25:15');
    // 00:30 から 25:15 = 1:15 まで: 1515 - 30 = 1485分
    expect(result.minutesUntil).toBe(1485);
  });
});

describe('minutesUntil', () => {
  it('発車まであと何分かを正しく計算する', () => {
    const now = makeDate(2024, 4, 3, 12, 0);
    expect(minutesUntil('12:30', now)).toBe(30);
  });

  it('発車時刻が現在時刻と同じとき0を返す', () => {
    const now = makeDate(2024, 4, 3, 12, 0);
    expect(minutesUntil('12:00', now)).toBe(0);
  });

  it('発車時刻が過去でも0以上を返す（負値を出さない）', () => {
    const now = makeDate(2024, 4, 3, 12, 0);
    expect(minutesUntil('11:30', now)).toBe(0);
  });
});
