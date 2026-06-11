// ===== 共通型定義 =====

/** カレンダー区分: 平日 or 土休日 */
export type CalendarType = 'Weekday' | 'SaturdayHoliday';

/** 方向: 上り or 下り */
export type DirectionType = 'Outbound' | 'Inbound';

/** 次発情報。終電後は minutesUntil が 'ended' になる */
export interface NextDeparture {
  /** 発車時刻文字列 (HH:MM)。終電後は null */
  time: string | null;
  /** 発車まであと何分。終電後は 'ended' */
  minutesUntil: number | 'ended';
  /** 行先駅名 */
  destination?: string;
  /** 列車種別（各停・急行など） */
  trainType?: string;
}

/** 駅情報 */
export interface Station {
  /** ODPT形式の駅ID (例: odpt.Station:TokyoMetro.Ginza.Omotesando) */
  stationId: string;
  /** 駅名 (例: 表参道) */
  stationTitle: string;
  /** 緯度 */
  lat: number;
  /** 経度 */
  lon: number;
  /** 所属路線ID */
  railwayId: string;
  /** 路線名 (例: 銀座線) */
  railwayTitle: string;
}

/** 方面ごとの発車情報 */
export interface Departure {
  /** 発車時刻 (HH:MM 形式。日付跨ぎは 25:30 等の表記も含む) */
  time: string;
  /** 行先駅名 */
  destination: string;
  /** 列車種別 */
  trainType: string;
  /** 方面名 (例: 渋谷方面) */
  railDirection: string;
}

/** Workers から返る運行情報レスポンス */
export interface TrainInformation {
  /** 路線ID（owl:sameAs 形式）。全線共通レコードは null */
  railwayId: string | null;
  /** 路線名 (例: 銀座線)。解決不能・路線参照なしは null */
  railwayTitle: string | null;
  /** 異常ステータス (例: 遅延)。平常時は null。バナー表示判定に使う */
  statusLabel: string | null;
  /** 運行情報の説明文 */
  infoText: string;
  /** 情報時刻 (ISO 8601) */
  date: string;
}

/** Workers から返る方面別時刻表レスポンス */
export interface TimetableResponse {
  /** 駅ID */
  stationId: string;
  /** 路線ID */
  railwayId: string;
  /** カレンダー区分 */
  calendar: CalendarType;
  /** 上り方面の時刻一覧 */
  outbound: Departure[];
  /** 下り方面の時刻一覧 */
  inbound: Departure[];
  /** 上り方面名 (例: 渋谷方面) */
  outboundDirectionName: string;
  /** 下り方面名 (例: 浅草方面) */
  inboundDirectionName: string;
}
