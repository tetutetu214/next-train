// ===== Workers プロキシ API クライアント =====
import type {
  CalendarType,
  Station,
  TimetableResponse,
  TrainInformation,
} from '../types';

/** LocalStorage キャッシュキー */
const STATIONS_CACHE_KEY = 'next-train:stations';

/** Workers プロキシの baseURL（開発時は Vite の proxy 経由） */
const API_BASE = '/api';

/**
 * Workers プロキシから東京メトロ全駅一覧を取得する。
 * 駅データは変更が少ないため localStorage にキャッシュし、
 * 起動毎に API を叩かないようにする（ODPTレート制限対策）。
 * エッジケース:
 * - localStorage が利用できない環境（プライベートブラウジング）でも
 *   キャッシュなしで動作継続する
 *
 * @returns 駅リスト
 */
export async function fetchStations(): Promise<Station[]> {
  // キャッシュを確認
  try {
    const cached = localStorage.getItem(STATIONS_CACHE_KEY);
    if (cached !== null) {
      return JSON.parse(cached) as Station[];
    }
  } catch {
    // localStorage が使えない場合はキャッシュをスキップ
  }

  const res = await fetch(`${API_BASE}/stations`);
  if (!res.ok) {
    throw new Error(`駅一覧の取得に失敗しました (HTTP ${res.status})`);
  }

  const stations = (await res.json()) as Station[];

  // キャッシュに保存（失敗してもエラーにしない）
  try {
    localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(stations));
  } catch {
    // ストレージ容量不足などは無視
  }

  return stations;
}

/**
 * 指定駅・路線・カレンダー区分の時刻表を Workers プロキシから取得する。
 * Workers 側でID→自然言語名の変換が行われたレスポンスを返す。
 *
 * @param stationId 駅ID
 * @param railwayId 路線ID
 * @param calendarType カレンダー区分
 * @returns 方面別時刻表
 */
export async function fetchTimetable(
  stationId: string,
  railwayId: string,
  calendarType: CalendarType
): Promise<TimetableResponse> {
  const params = new URLSearchParams({
    station: stationId,
    railway: railwayId,
    calendar: calendarType,
  });

  const res = await fetch(`${API_BASE}/timetable?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`時刻表の取得に失敗しました (HTTP ${res.status})`);
  }

  return res.json() as Promise<TimetableResponse>;
}

/**
 * 東京メトロの運行情報一覧を Workers プロキシから取得する。
 * Workers 側でID→路線名の変換と異常判定（statusLabel）が済んだ形を返す。
 * 失敗してもバナーは補助情報のため、呼び出し側で握り潰して非表示にする想定。
 *
 * @returns 運行情報一覧（路線ごと）
 */
export async function fetchTrainInformation(): Promise<TrainInformation[]> {
  const res = await fetch(`${API_BASE}/train-information`);
  if (!res.ok) {
    throw new Error(`運行情報の取得に失敗しました (HTTP ${res.status})`);
  }

  return res.json() as Promise<TrainInformation[]>;
}
