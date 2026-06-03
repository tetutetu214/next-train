// ===== geo.ts のテスト =====
// 外部APIへの依存なし: haversineKm と filterNearbyStations は純粋関数のためモック不要。
// getCurrentPosition はブラウザのGeolocation APIに依存するため Vitest/Node環境では
// 実行できない。このテストではその関数の単体テストは対象外とし、
// 純粋計算ロジックのみを検証する。

import { describe, it, expect } from 'vitest';
import { haversineKm, filterNearbyStations } from '../geo';
import type { Station } from '../../types';

/** テスト用の駅データを生成するヘルパー */
function makeStation(
  id: string,
  lat: number,
  lon: number
): Station {
  return {
    stationId: id,
    stationTitle: id,
    lat,
    lon,
    railwayId: 'test-railway',
    railwayTitle: 'テスト路線',
  };
}

describe('haversineKm', () => {
  it('Haversine式で東京〜大阪間の既知の距離（約400km）を正しく算出する', () => {
    // 東京駅: 35.6812, 139.7671
    // 大阪駅: 34.7025, 135.4959
    // 実際の直線距離は約400km
    const distance = haversineKm(35.6812, 139.7671, 34.7025, 135.4959);
    // 10km の誤差許容（球面近似のため）
    expect(distance).toBeGreaterThan(390);
    expect(distance).toBeLessThan(415);
  });

  it('同一地点の距離は0を返す', () => {
    const distance = haversineKm(35.6812, 139.7671, 35.6812, 139.7671);
    expect(distance).toBe(0);
  });

  it('近傍の短距離（表参道〜外苑前 約0.8km）を正しく算出する', () => {
    // 表参道: 35.6654, 139.7126
    // 外苑前: 35.6697, 139.7169
    const distance = haversineKm(35.6654, 139.7126, 35.6697, 139.7169);
    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThan(1.0);
  });
});

describe('filterNearbyStations', () => {
  // 現在地: 表参道付近 (35.6654, 139.7126)
  const ORIGIN_LAT = 35.6654;
  const ORIGIN_LON = 139.7126;

  it('1km以内の駅のみを返す（1.5km先の駅は含まない）', () => {
    // 約0.5km先の駅（表参道〜外苑前相当）
    const nearStation = makeStation('near', 35.6697, 139.7169);
    // 約1.5km先の駅（この距離は1kmを超える）
    const farStation = makeStation('far', 35.6654 + 0.015, 139.7126); // 緯度差0.015度≒1.67km

    const result = filterNearbyStations(
      [nearStation, farStation],
      ORIGIN_LAT,
      ORIGIN_LON,
      1.0
    );

    const ids = result.map((s) => s.stationId);
    expect(ids).toContain('near');
    expect(ids).not.toContain('far');
  });

  it('距離順（昇順）でソートされた結果を返す', () => {
    const stationA = makeStation('A', 35.6654 + 0.005, 139.7126); // 約0.55km
    const stationB = makeStation('B', 35.6654 + 0.002, 139.7126); // 約0.22km

    const result = filterNearbyStations(
      [stationA, stationB],
      ORIGIN_LAT,
      ORIGIN_LON,
      1.0
    );

    // B（近い）→ A（遠い）の順になること
    expect(result[0].stationId).toBe('B');
    expect(result[1].stationId).toBe('A');
  });

  it('近傍0駅のとき空配列を返す', () => {
    // 半径1km以内に駅がない状況
    const distantStation = makeStation('distant', 35.6654 + 0.1, 139.7126); // 約11km

    const result = filterNearbyStations(
      [distantStation],
      ORIGIN_LAT,
      ORIGIN_LON,
      1.0
    );

    expect(result).toHaveLength(0);
  });

  it('駅一覧が空のとき空配列を返す', () => {
    const result = filterNearbyStations([], ORIGIN_LAT, ORIGIN_LON, 1.0);
    expect(result).toHaveLength(0);
  });
});
