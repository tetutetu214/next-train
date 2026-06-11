// ===== メインアプリコンポーネント =====
import { useState, useEffect, useCallback } from 'react';
import type { Station, TimetableResponse, TrainInformation } from './types';
import { getCurrentPosition, filterNearbyStations } from './lib/geo';
import { getCalendarType } from './lib/timetable';
import { filterActiveTrainInformation } from './lib/trainInformation';
import {
  fetchStations,
  fetchTimetable,
  fetchTrainInformation,
} from './api/client';
import { StationCard } from './components/StationCard';
import './App.css';

/** 位置情報取得の状態 */
type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'located'; lat: number; lon: number; accuracy: number }
  | { status: 'error'; message: string };

/** 表参道駅付近の固定座標（デモモード用） */
const DEMO_COORDS = { lat: 35.6654, lon: 139.7126 };

/** 近傍駅の検索半径 (km) */
const SEARCH_RADIUS_KM = 1.0;

/** 表示する最大駅数 */
const MAX_STATIONS = 5;

export default function App() {
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' });
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [nearbyStations, setNearbyStations] = useState<Station[]>([]);
  const [timetables, setTimetables] = useState<Map<string, TimetableResponse>>(new Map());
  const [loadingTimetables, setLoadingTimetables] = useState<Set<string>>(new Set());
  // 運行情報（路線ごと）。バナー表示判定に使う
  const [trainInfos, setTrainInfos] = useState<TrainInformation[]>([]);
  const [now, setNow] = useState(() => new Date());

  // 1分ごとに現在時刻を更新（「あと何分」の再計算のため）
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * 位置情報を取得して近傍駅を絞り込む。
   */
  const locateAndFilter = useCallback(
    async (lat: number, lon: number, accuracy?: number) => {
      setLocationState({
        status: 'located',
        lat,
        lon,
        accuracy: accuracy ?? 0,
      });

      try {
        const stations = await fetchStations();
        const nearby = filterNearbyStations(stations, lat, lon, SEARCH_RADIUS_KM).slice(
          0,
          MAX_STATIONS
        );
        setNearbyStations(nearby);

        // 運行情報を取得（バナー表示用）。
        // 主機能（時刻表表示）を阻害しないよう、失敗しても静かに非表示にする。
        try {
          const infos = await fetchTrainInformation();
          setTrainInfos(infos);
        } catch (infoErr) {
          console.error('運行情報の取得に失敗しました', infoErr);
          setTrainInfos([]);
        }

        // 各駅の時刻表を並行取得
        const calendar = getCalendarType(new Date());
        const loadingKeys = new Set(nearby.map((s) => `${s.stationId}:${s.railwayId}`));
        setLoadingTimetables(loadingKeys);

        await Promise.allSettled(
          nearby.map(async (station) => {
            const key = `${station.stationId}:${station.railwayId}`;
            try {
              const tt = await fetchTimetable(station.stationId, station.railwayId, calendar);
              setTimetables((prev) => new Map(prev).set(key, tt));
            } catch (err) {
              console.error(`時刻表の取得に失敗: ${key}`, err);
            } finally {
              setLoadingTimetables((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            }
          })
        );
      } catch (err) {
        console.error('駅一覧の取得に失敗しました', err);
      }
    },
    []
  );

  /**
   * ブラウザの位置情報を取得する。
   */
  const handleGetLocation = useCallback(async () => {
    setLocationState({ status: 'locating' });
    try {
      const coords = await getCurrentPosition();
      await locateAndFilter(coords.latitude, coords.longitude, coords.accuracy);
    } catch (err) {
      const message =
        err instanceof GeolocationPositionError
          ? err.code === GeolocationPositionError.PERMISSION_DENIED
            ? '位置情報の使用が許可されていません。ブラウザの設定を確認してください。'
            : '位置情報の取得がタイムアウトしました。'
          : '位置情報の取得に失敗しました。';
      setLocationState({ status: 'error', message });
    }
  }, [locateAndFilter]);

  /**
   * デモモードのトグル。
   * ON にすると表参道付近の固定座標で近傍駅を表示する。
   */
  const handleDemoToggle = useCallback(async () => {
    const next = !isDemoMode;
    setIsDemoMode(next);
    if (next) {
      await locateAndFilter(DEMO_COORDS.lat, DEMO_COORDS.lon);
    } else {
      // デモモードをOFFにしたら状態をリセット
      setLocationState({ status: 'idle' });
      setNearbyStations([]);
      setTimetables(new Map());
      setTrainInfos([]);
    }
  }, [isDemoMode, locateAndFilter]);

  // 表示中の駅の路線に異常がある運行情報だけを抽出（平常時は空 → バナー非表示）
  const activeTrainInfos = filterActiveTrainInformation(trainInfos, nearbyStations);

  return (
    <div className="app">
      {/* ヘッダー */}
      <header className="app-header">
        <h1>next-train</h1>
        <button
          type="button"
          className="refresh-button"
          onClick={handleGetLocation}
          disabled={locationState.status === 'locating'}
        >
          位置情報を更新
        </button>
      </header>

      {/* デモモードトグル（開発・Geolocation未許可時用） */}
      <div className="demo-toggle">
        <label>
          <input
            type="checkbox"
            checked={isDemoMode}
            onChange={() => void handleDemoToggle()}
          />
          <span> デモモード（表参道付近の固定座標）</span>
        </label>
      </div>

      {/* 位置情報の状態表示 */}
      <div className="location-status">
        {locationState.status === 'idle' && (
          <p className="status-message">
            「位置情報を更新」を押すか、デモモードをONにしてください。
          </p>
        )}
        {locationState.status === 'locating' && (
          <p className="status-message">現在地を取得中...</p>
        )}
        {locationState.status === 'located' && (
          <p className="status-message">
            現在地: 取得済み（誤差 ±{Math.round(locationState.accuracy)}m）
          </p>
        )}
        {locationState.status === 'error' && (
          <p className="status-message error">{locationState.message}</p>
        )}
      </div>

      {/* 「位置情報を取得」ボタン（初期表示） */}
      {locationState.status === 'idle' && !isDemoMode && (
        <div className="get-location-prompt">
          <button type="button" className="get-location-button" onClick={handleGetLocation}>
            現在地から近くの駅を探す
          </button>
        </div>
      )}

      {/* 運行情報バナー（表示駅の路線に異常があるときだけ出す） */}
      {activeTrainInfos.length > 0 && (
        <div className="train-info-banner" role="status">
          {activeTrainInfos.map((info) => (
            <p key={`${info.railwayId ?? ''}:${info.date}`} className="train-info-line">
              <span className="train-info-icon" aria-hidden="true">
                ⚠
              </span>
              <span className="train-info-railway">{info.railwayTitle}</span>
              <span className="train-info-status">{info.statusLabel}</span>
              {info.infoText !== '' && (
                <span className="train-info-text">— {info.infoText}</span>
              )}
            </p>
          ))}
        </div>
      )}

      {/* 近傍駅リスト */}
      <main className="stations-list">
        {locationState.status === 'located' && nearbyStations.length === 0 && (
          <p className="no-stations">近くに対象駅がありません（半径1km以内）</p>
        )}

        {nearbyStations.map((station) => {
          const key = `${station.stationId}:${station.railwayId}`;
          const timetable = timetables.get(key) ?? null;
          const isLoading = loadingTimetables.has(key);

          return (
            <StationCard
              key={key}
              station={station}
              timetable={timetable}
              now={now}
              isLoading={isLoading}
            />
          );
        })}
      </main>

      {/* フッター（出典クレジット・注意書き） */}
      <footer className="app-footer">
        <p>
          データ提供: 公共交通オープンデータセンター（東京メトロ・東京都交通局・横浜市交通局・首都圏新都市鉄道・ゆりかもめ・多摩都市モノレール・東京臨海高速鉄道）
        </p>
        <p>
          各データは各事業者により CC BY 4.0 で提供されています。コンテンツは必ずしも正確・完全とは限りません。
        </p>
        <p className="disclaimer">
          ※表示時刻は時刻表に基づきます。遅延時の時刻補正はしていません（運行情報は参考表示）
        </p>
      </footer>
    </div>
  );
}
