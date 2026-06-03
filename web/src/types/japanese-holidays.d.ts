// japanese-holidays の型宣言。
// パッケージに型定義が同梱されないため自前で用意する。
declare module 'japanese-holidays' {
  /** 指定日が祝日なら祝日名(文字列)、そうでなければ undefined を返す */
  export function isHoliday(date: Date): string | undefined;
  /** 振替休日・国民の休日も含めて判定し、祝日名 or undefined を返す */
  export function isHolidayAt(date: Date): string | undefined;
}
