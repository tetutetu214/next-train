// ===== filterActiveTrainInformation のテスト =====
// 外部APIへの依存なし: 純関数のためフィクスチャ入力だけでテストできる。
// バナー表示判定の振る舞い（表示駅の路線に異常があるか）を保証する。

import { describe, it, expect } from 'vitest';
import { filterActiveTrainInformation } from '../trainInformation';
import type { Station, TrainInformation } from '../../types';

/** 表参道（銀座線）の表示駅 */
const GINZA_STATION: Station = {
  stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
  stationTitle: '表参道',
  lat: 35.6654,
  lon: 139.7126,
  railwayId: 'odpt.Railway:TokyoMetro.Ginza',
  railwayTitle: '銀座線',
};

/** 表参道（千代田線）の表示駅 */
const CHIYODA_STATION: Station = {
  stationId: 'odpt.Station:TokyoMetro.Chiyoda.Omotesando',
  stationTitle: '表参道',
  lat: 35.6654,
  lon: 139.7126,
  railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
  railwayTitle: '千代田線',
};

/** 銀座線=平常の運行情報 */
const GINZA_NORMAL: TrainInformation = {
  railwayId: 'odpt.Railway:TokyoMetro.Ginza',
  railwayTitle: '銀座線',
  statusLabel: null,
  infoText: '現在、平常どおり運転しています。',
  date: '2026-06-10T12:00:00+09:00',
};

/** 千代田線=遅延の運行情報 */
const CHIYODA_DELAYED: TrainInformation = {
  railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
  railwayTitle: '千代田線',
  statusLabel: '遅延',
  infoText: '人身事故の影響で、一部列車に遅れがでています。',
  date: '2026-06-10T12:05:00+09:00',
};

describe('filterActiveTrainInformation', () => {
  it('表示駅の路線に異常がある運行情報だけを残す', () => {
    const result = filterActiveTrainInformation(
      [GINZA_NORMAL, CHIYODA_DELAYED],
      [GINZA_STATION, CHIYODA_STATION]
    );

    expect(result).toEqual([CHIYODA_DELAYED]);
  });

  it('すべて平常なら空配列を返す（バナーを出さない）', () => {
    const result = filterActiveTrainInformation(
      [GINZA_NORMAL],
      [GINZA_STATION]
    );

    expect(result).toEqual([]);
  });

  it('表示駅と無関係な路線の異常はバナー対象から除外する', () => {
    // 千代田線が遅延だが、表示駅は銀座線のみ
    const result = filterActiveTrainInformation(
      [CHIYODA_DELAYED],
      [GINZA_STATION]
    );

    expect(result).toEqual([]);
  });

  it('railwayId が null の全線共通レコードは異常でも除外する', () => {
    const allLinesSuspended: TrainInformation = {
      railwayId: null,
      railwayTitle: null,
      statusLabel: '運転見合わせ',
      infoText: '全線で運転を見合わせています。',
      date: '2026-06-10T12:00:00+09:00',
    };

    const result = filterActiveTrainInformation(
      [allLinesSuspended],
      [GINZA_STATION]
    );

    expect(result).toEqual([]);
  });

  it('表示駅が無いときは空配列を返す', () => {
    const result = filterActiveTrainInformation([CHIYODA_DELAYED], []);

    expect(result).toEqual([]);
  });

  it('同一路線に複数の異常レコードがあればすべて残す', () => {
    const chiyodaSecond: TrainInformation = {
      railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
      railwayTitle: '千代田線',
      statusLabel: '運転再開',
      infoText: '運転を再開しました。',
      date: '2026-06-10T12:30:00+09:00',
    };

    const result = filterActiveTrainInformation(
      [CHIYODA_DELAYED, chiyodaSecond],
      [CHIYODA_STATION]
    );

    expect(result).toEqual([CHIYODA_DELAYED, chiyodaSecond]);
  });
});
