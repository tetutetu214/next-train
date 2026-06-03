// ===== 時刻表・次発抽出ユーティリティ =====
import type { CalendarType, NextDeparture } from '../types';
// japanese-holidays は祝日データをバンドルに含めオフライン判定できる外部ライブラリ。
// CommonJSモジュールだが Vite/Vitest が ESM interop で読み込める。
// 型定義は同梱されないため src/types/japanese-holidays.d.ts で宣言している。
import * as JapaneseHolidays from 'japanese-holidays';

/**
 * 指定日がカレンダー区分 Weekday か SaturdayHoliday かを判定する。
 * 判定ルール:
 * - 土曜 (6) または 日曜 (0) → SaturdayHoliday
 * - 祝日 (japanese-holidays で判定) → SaturdayHoliday
 * - それ以外 → Weekday
 *
 * @param date 判定する日付
 * @returns カレンダー区分
 */
export function getCalendarType(date: Date): CalendarType {
  const dayOfWeek = date.getDay(); // 0=日, 6=土

  // 土日は土休日ダイヤ
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'SaturdayHoliday';
  }

  // japanese-holidays で祝日判定。
  // 祝日なら祝日名(文字列)、非祝日は undefined が返るため truthy 判定する。
  const holidayName = JapaneseHolidays.isHoliday(date);
  if (holidayName) {
    return 'SaturdayHoliday';
  }

  return 'Weekday';
}

/**
 * 時刻文字列 "HH:MM" を当日の分数（深夜表記含む）に変換する。
 * 「25:30」等の24時超表記は翌日0:30 = 1530分として扱う。
 *
 * @param timeStr "HH:MM" 形式の時刻文字列
 * @returns 当日0:00からの分数
 */
function timeStringToMinutes(timeStr: string): number {
  const [hourStr, minuteStr] = timeStr.split(':');
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);
  return hours * 60 + minutes;
}

/**
 * 現在時刻を当日の分数で返す。
 *
 * @param nowDate 現在日時
 * @returns 当日0:00からの分数
 */
function nowToMinutes(nowDate: Date): number {
  return nowDate.getHours() * 60 + nowDate.getMinutes();
}

/**
 * 発車時刻 "HH:MM" から現在時刻までの残り分数を返す。
 * 深夜表記 (25:30 など) は翌日扱いで計算する。
 *
 * @param departureTime "HH:MM" 形式の時刻文字列
 * @param nowDate 現在日時
 * @returns 発車まであと何分（1分未満は 0）
 */
export function minutesUntil(departureTime: string, nowDate: Date): number {
  const depMinutes = timeStringToMinutes(departureTime);
  const nowMinutes = nowToMinutes(nowDate);

  const diff = depMinutes - nowMinutes;
  // 負の場合は0を返す（呼び出し元でフィルタ済みを想定）
  return Math.max(0, diff);
}

/**
 * 時刻文字列のリストから現在時刻以降で最も早い発車を返す。
 * エッジケース:
 * - 空リスト → 終電後として 'ended' を返す
 * - 現在時刻と同じ時刻の電車 → 次発として扱う（=既に乗れないかもしれないが
 *   ODPTの時刻表は発車時刻なので表示上は次発と見なす）
 * - 25:30 等の深夜表記 → 当日の1:30として計算し正しく処理する
 * - 全電車が現在時刻より前 → 終電後として 'ended' を返す
 *
 * @param departures "HH:MM" 形式の発車時刻リスト
 * @param nowDate 現在日時
 * @returns 次発情報
 */
export function getNextDeparture(
  departures: string[],
  nowDate: Date
): NextDeparture {
  // 発車時刻が空の場合は終電後扱い
  if (departures.length === 0) {
    return { time: null, minutesUntil: 'ended' };
  }

  const nowMinutes = nowToMinutes(nowDate);

  // 現在時刻以降の発車を全て抽出し、分数順でソート
  const upcoming = departures
    .map((t) => ({ time: t, minutes: timeStringToMinutes(t) }))
    .filter(({ minutes }) => minutes >= nowMinutes)
    .sort((a, b) => a.minutes - b.minutes);

  // 現在時刻以降の発車がない場合 → 終電後
  if (upcoming.length === 0) {
    return { time: null, minutesUntil: 'ended' };
  }

  const next = upcoming[0];
  const remaining = next.minutes - nowMinutes;

  return {
    time: next.time,
    minutesUntil: remaining,
  };
}
