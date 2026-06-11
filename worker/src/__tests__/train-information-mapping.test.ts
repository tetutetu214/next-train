// ===== mapTrainInformation（運行情報の純関数）のテスト =====
// 外部APIへの依存なし: mapTrainInformation は純関数のためモック不要。
// フィクスチャは 2026-06-10 実測形で書く:
//   - @id        は urn:uuid 形式（レコード固有の機械ID）
//   - owl:sameAs / odpt:railway は odpt.* 形式の正規ID（参照は owl:sameAs）
//   - 平常時は odpt:trainInformationStatus フィールド自体が存在しない
//   - 異常時のみ odpt:trainInformationStatus（{"ja":"遅延"} 等）が付く
//   - odpt:trainInformationText は {"ja": "..."} オブジェクト
// 「平常時に status フィールドが無い」構造が statusLabel=null 判定の肝なので、
// 平常レコードからは意図的にフィールドを欠落させている。

import { describe, it, expect } from 'vitest';
import {
  mapTrainInformation,
  type RawTrainInformation,
  type RawRailway,
} from '../index';

/** 銀座線の路線レコード（路線名解決用） */
const GINZA_RAILWAY: RawRailway = {
  '@id': 'urn:ucode:_00001C000000000000010000030B5A12',
  'owl:sameAs': 'odpt.Railway:TokyoMetro.Ginza',
  'dc:title': '銀座線',
  'odpt:ascendingRailDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
  'odpt:descendingRailDirection': 'odpt.RailDirection:TokyoMetro.Shibuya',
};

/** 千代田線の路線レコード（路線名解決用） */
const CHIYODA_RAILWAY: RawRailway = {
  '@id': 'urn:ucode:_00001C000000000000010000030B5A20',
  'owl:sameAs': 'odpt.Railway:TokyoMetro.Chiyoda',
  'dc:title': '千代田線',
  'odpt:ascendingRailDirection': 'odpt.RailDirection:TokyoMetro.Ayase',
  'odpt:descendingRailDirection': 'odpt.RailDirection:TokyoMetro.Yoyogiuehara',
};

/** 平常時の運行情報レコード（status フィールドは存在しない） */
const NORMAL_GINZA: RawTrainInformation = {
  '@id': 'urn:uuid:11111111-1111-1111-1111-111111111111',
  'owl:sameAs': 'odpt.TrainInformation:TokyoMetro.Ginza',
  'dc:date': '2026-06-10T12:00:00+09:00',
  'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
  'odpt:trainInformationText': { ja: '現在、平常どおり運転しています。' },
};

/** 異常時（遅延）の運行情報レコード */
const DELAYED_CHIYODA: RawTrainInformation = {
  '@id': 'urn:uuid:22222222-2222-2222-2222-222222222222',
  'owl:sameAs': 'odpt.TrainInformation:TokyoMetro.Chiyoda',
  'dc:date': '2026-06-10T12:05:00+09:00',
  'odpt:railway': 'odpt.Railway:TokyoMetro.Chiyoda',
  'odpt:trainInformationStatus': { ja: '遅延' },
  'odpt:trainInformationText': {
    ja: '人身事故の影響で、一部列車に遅れがでています。',
  },
};

describe('mapTrainInformation', () => {
  it('odpt:trainInformationStatus が無い平常レコードは statusLabel を null にする', () => {
    const result = mapTrainInformation([NORMAL_GINZA], [GINZA_RAILWAY]);

    expect(result[0].statusLabel).toBeNull();
  });

  it('odpt:trainInformationStatus がある異常レコードはステータスの ja を statusLabel にする', () => {
    const result = mapTrainInformation([DELAYED_CHIYODA], [CHIYODA_RAILWAY]);

    expect(result[0].statusLabel).toBe('遅延');
  });

  it('owl:sameAs 形式の odpt:railway 参照から路線名を解決する', () => {
    const result = mapTrainInformation([NORMAL_GINZA], [GINZA_RAILWAY]);

    expect(result[0].railwayTitle).toBe('銀座線');
  });

  it('路線レコードが見つからない参照は生の参照値をフォールバックする', () => {
    // Railway 辞書を空にする → 辞書ミス
    const result = mapTrainInformation([NORMAL_GINZA], []);

    expect(result[0].railwayTitle).toBe('odpt.Railway:TokyoMetro.Ginza');
  });

  it('odpt:railway が無い全線共通レコードは railwayId と railwayTitle を null にする', () => {
    const allLines: RawTrainInformation = {
      '@id': 'urn:uuid:33333333-3333-3333-3333-333333333333',
      'owl:sameAs': 'odpt.TrainInformation:TokyoMetro',
      'dc:date': '2026-06-10T12:00:00+09:00',
      'odpt:trainInformationText': { ja: '全線で運転を見合わせています。' },
      'odpt:trainInformationStatus': { ja: '運転見合わせ' },
    };

    const result = mapTrainInformation([allLines], [GINZA_RAILWAY]);

    expect(result[0].railwayId).toBeNull();
    expect(result[0].railwayTitle).toBeNull();
  });

  it('オブジェクト形式の trainInformationText から ja を取り出す', () => {
    const result = mapTrainInformation([NORMAL_GINZA], [GINZA_RAILWAY]);

    expect(result[0].infoText).toBe('現在、平常どおり運転しています。');
  });

  it('文字列形式の trainInformationText はそのまま infoText にする', () => {
    // 古い仕様・他事業者で素の文字列が来るケースの後方互換
    const stringText: RawTrainInformation = {
      '@id': 'urn:uuid:44444444-4444-4444-4444-444444444444',
      'owl:sameAs': 'odpt.TrainInformation:TokyoMetro.Ginza',
      'dc:date': '2026-06-10T12:00:00+09:00',
      'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
      'odpt:trainInformationText': '平常どおり運転しています。',
    };

    const result = mapTrainInformation([stringText], [GINZA_RAILWAY]);

    expect(result[0].infoText).toBe('平常どおり運転しています。');
  });

  it('owl:sameAs キーで辞書を組むので railwayId に owl:sameAs 形式の参照値を返す', () => {
    const result = mapTrainInformation([DELAYED_CHIYODA], [CHIYODA_RAILWAY]);

    expect(result[0].railwayId).toBe('odpt.Railway:TokyoMetro.Chiyoda');
  });

  it('dc:date を date にそのまま引き継ぐ', () => {
    const result = mapTrainInformation([DELAYED_CHIYODA], [CHIYODA_RAILWAY]);

    expect(result[0].date).toBe('2026-06-10T12:05:00+09:00');
  });
});
