// ===== 駅×路線カードコンポーネント =====
import type { Station, TimetableResponse } from '../types';
import { getNextDeparture } from '../lib/timetable';

interface StationCardProps {
  /** 駅情報 */
  station: Station;
  /** 時刻表データ (取得前は null) */
  timetable: TimetableResponse | null;
  /** 現在時刻 */
  now: Date;
  /** ローディング中フラグ */
  isLoading?: boolean;
}

/**
 * 「あと何分」のテキストを返す。
 * 1分未満は「まもなく」、終電後は '終電を過ぎました'。
 */
function formatMinutesUntil(minutesUntil: number | 'ended'): string {
  if (minutesUntil === 'ended') return '終電を過ぎました';
  if (minutesUntil < 1) return 'まもなく';
  return `あと${minutesUntil}分`;
}

/**
 * 1方向（上りまたは下り）の次発ブロックをレンダリングする。
 */
function DirectionBlock({
  label,
  directionName,
  departureTimes,
  now,
  isLoading,
  hasTimetable,
}: {
  label: '▲' | '▼';
  directionName: string;
  departureTimes: string[];
  now: Date;
  isLoading: boolean;
  hasTimetable: boolean;
}) {
  // 上り(▲)=アンバーLED、下り(▼)=グリーンLED の色分け用クラス
  const variantClass = label === '▲' ? 'direction-block--up' : 'direction-block--down';

  if (isLoading) {
    return (
      <div className={`direction-block ${variantClass}`}>
        <span className="direction-label">{label}</span>
        <span className="direction-name">{directionName}</span>
        <span className="status-text">データ取得中</span>
      </div>
    );
  }

  if (!hasTimetable) {
    return (
      <div className={`direction-block ${variantClass}`}>
        <span className="direction-label">{label}</span>
        <span className="direction-name">—</span>
        <span className="status-text">近傍データなし</span>
      </div>
    );
  }

  const next = getNextDeparture(departureTimes, now);

  if (next.minutesUntil === 'ended') {
    return (
      <div className={`direction-block ${variantClass}`}>
        <span className="direction-label">{label}</span>
        <span className="direction-name">{directionName}</span>
        <span className="status-text ended">終電を過ぎました</span>
      </div>
    );
  }

  return (
    <div className="direction-block">
      <span className="direction-label">{label}</span>
      <span className="direction-name">{directionName}</span>
      <span className="departure-time">{next.time}</span>
      {next.destination !== undefined && (
        <span className="destination">{next.destination}</span>
      )}
      {next.trainType !== undefined && (
        <span className="train-type">{next.trainType}</span>
      )}
      <span className="minutes-until">{formatMinutesUntil(next.minutesUntil)}</span>
    </div>
  );
}

/**
 * 駅×路線カードコンポーネント。
 * 上り（▲）と下り（▼）の2ブロックで次発を表示する。
 */
export function StationCard({ station, timetable, now, isLoading = false }: StationCardProps) {
  const hasTimetable = timetable !== null;

  // 上り・下りの発車時刻リストを抽出（行先と種別は次発のものを使う）
  const outboundTimes = hasTimetable
    ? timetable.outbound.map((d) => d.time)
    : [];
  const inboundTimes = hasTimetable
    ? timetable.inbound.map((d) => d.time)
    : [];

  // 次発の行先・種別を取得
  const nextOutbound = hasTimetable
    ? getNextDeparture(outboundTimes, now)
    : null;
  const nextInbound = hasTimetable
    ? getNextDeparture(inboundTimes, now)
    : null;

  // 次発の詳細情報を付与
  if (nextOutbound !== null && nextOutbound.time !== null && hasTimetable) {
    const dep = timetable.outbound.find((d) => d.time === nextOutbound.time);
    if (dep !== undefined) {
      nextOutbound.destination = dep.destination;
      nextOutbound.trainType = dep.trainType;
    }
  }
  if (nextInbound !== null && nextInbound.time !== null && hasTimetable) {
    const dep = timetable.inbound.find((d) => d.time === nextInbound.time);
    if (dep !== undefined) {
      nextInbound.destination = dep.destination;
      nextInbound.trainType = dep.trainType;
    }
  }

  return (
    <div className="station-card">
      <div className="station-header">
        <span className="station-mark">◆</span>
        <span className="station-name">{station.stationTitle}</span>
        <span className="railway-name">{station.railwayTitle}</span>
      </div>

      {/* 上り方面 */}
      <DirectionBlock
        label="▲"
        directionName={hasTimetable ? timetable.outboundDirectionName : '上り'}
        departureTimes={outboundTimes}
        now={now}
        isLoading={isLoading}
        hasTimetable={hasTimetable}
      />

      {/* 下り方面 */}
      <DirectionBlock
        label="▼"
        directionName={hasTimetable ? timetable.inboundDirectionName : '下り'}
        departureTimes={inboundTimes}
        now={now}
        isLoading={isLoading}
        hasTimetable={hasTimetable}
      />
    </div>
  );
}
