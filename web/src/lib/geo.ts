// ===== 位置情報・距離計算ユーティリティ =====
import type { Station } from '../types';

/** 地球の半径 (km) */
const EARTH_RADIUS_KM = 6371;

/**
 * Haversine公式で2点間の距離をkm単位で計算する。
 * 数十km以内の近距離では地球の曲率による誤差は無視できる精度。
 *
 * @param lat1 点1の緯度 (度)
 * @param lon1 点1の経度 (度)
 * @param lat2 点2の緯度 (度)
 * @param lon2 点2の経度 (度)
 * @returns 2点間の距離 (km)
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // 度をラジアンに変換
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * ブラウザのGeolocation APIをPromiseでラップする。
 * エッジケース:
 * - ユーザーが位置情報を拒否した場合 → reject (GeolocationPositionError)
 * - HTTPSでない環境や対応していないブラウザ → reject (Error)
 *
 * @returns 現在位置のGeolocationCoordinatesを解決するPromise
 */
export function getCurrentPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    // ブラウザがGeolocationに対応していない場合
    if (!navigator.geolocation) {
      reject(new Error('このブラウザはGeolocationに対応していません'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => reject(error),
      {
        // 精度優先・タイムアウト10秒
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // 30秒以内のキャッシュは再利用
      }
    );
  });
}

/**
 * 駅一覧から指定座標の半径 radiusKm 以内の駅を距離順（昇順）で返す。
 * エッジケース:
 * - 近傍0駅の場合 → 空配列を返す
 * - 日本国外の座標 → 計算は動くが駅がヒットしないため空配列になる
 *
 * @param stations 全駅リスト
 * @param lat 現在地の緯度
 * @param lon 現在地の経度
 * @param radiusKm 検索半径 (km)
 * @returns 半径内の駅を距離昇順にソートしたリスト
 */
export function filterNearbyStations(
  stations: Station[],
  lat: number,
  lon: number,
  radiusKm: number
): Station[] {
  // 距離を計算してフィルタリング
  const withDistance = stations
    .map((station) => ({
      station,
      distanceKm: haversineKm(lat, lon, station.lat, station.lon),
    }))
    .filter(({ distanceKm }) => distanceKm <= radiusKm);

  // 距離昇順でソート
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  return withDistance.map(({ station }) => station);
}
