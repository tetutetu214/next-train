// ===== ODPT 生レスポンス → アプリレスポンス変換（純関数）のテスト =====
// 外部APIへの依存なし: mapStations / mapTimetable は純関数のためモック不要。
// フィクスチャは実データ形式で書く:
//   - @id        は urn:ucode 形式（レコード固有の機械ID）
//   - owl:sameAs は odpt.* 形式の正規ID
//   - 参照フィールド（odpt:railway 等）は owl:sameAs 形式の値
// この「@id だけ見ると参照解決が壊れる」構造がバグの再現条件そのものなので、
// @id と owl:sameAs を意図的に食い違わせている。

import { describe, it, expect } from 'vitest';
import {
  mapStations,
  mapTimetable,
  collectDestinationIds,
  type RawStation,
  type RawRailway,
  type RawStationTimetable,
  type RawTrainType,
  type RawRailDirection,
} from '../index';

// ----- 共通フィクスチャ -----

/** 銀座線の路線レコード。上り=浅草方面 / 下り=渋谷方面 */
const GINZA_RAILWAY: RawRailway = {
  '@id': 'urn:ucode:_00001C000000000000010000030B5A12',
  'owl:sameAs': 'odpt.Railway:TokyoMetro.Ginza',
  'dc:title': '銀座線',
  'odpt:ascendingRailDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
  'odpt:descendingRailDirection': 'odpt.RailDirection:TokyoMetro.Shibuya',
};

/** 表参道駅（銀座線）。odpt:railway は owl:sameAs 形式 */
const OMOTESANDO_STATION: RawStation = {
  '@id': 'urn:ucode:_00001C0000000000000100000312A7B0',
  'owl:sameAs': 'odpt.Station:TokyoMetro.Ginza.Omotesando',
  'dc:title': '表参道',
  'geo:lat': 35.6654,
  'geo:long': 139.7126,
  'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
};

/** 渋谷駅（銀座線）。行先名解決の対象 */
const SHIBUYA_STATION: RawStation = {
  '@id': 'urn:ucode:_00001C0000000000000100000312A7C1',
  'owl:sameAs': 'odpt.Station:TokyoMetro.Ginza.Shibuya',
  'dc:title': '渋谷',
  'geo:lat': 35.6581,
  'geo:long': 139.7013,
  'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
};

/** 浅草駅（銀座線）。行先名解決の対象 */
const ASAKUSA_STATION: RawStation = {
  '@id': 'urn:ucode:_00001C0000000000000100000312A7D2',
  'owl:sameAs': 'odpt.Station:TokyoMetro.Ginza.Asakusa',
  'dc:title': '浅草',
  'geo:lat': 35.7148,
  'geo:long': 139.7967,
  'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza',
};

const LOCAL_TRAIN_TYPE: RawTrainType = {
  '@id': 'urn:ucode:_00001C00000000000001000003130001',
  'owl:sameAs': 'odpt.TrainType:TokyoMetro.Local',
  'dc:title': '各駅停車',
};

const ASAKUSA_DIRECTION: RawRailDirection = {
  '@id': 'urn:ucode:_00001C00000000000001000003140001',
  'owl:sameAs': 'odpt.RailDirection:TokyoMetro.Asakusa',
  'dc:title': '浅草方面',
};

const SHIBUYA_DIRECTION: RawRailDirection = {
  '@id': 'urn:ucode:_00001C00000000000001000003140002',
  'owl:sameAs': 'odpt.RailDirection:TokyoMetro.Shibuya',
  'dc:title': '渋谷方面',
};

describe('mapStations', () => {
  it('駅IDに owl:sameAs 形式の正規IDを返す（urn:ucode の @id ではない）', () => {
    const result = mapStations([OMOTESANDO_STATION], [GINZA_RAILWAY]);

    expect(result[0].stationId).toBe('odpt.Station:TokyoMetro.Ginza.Omotesando');
  });

  it('owl:sameAs 形式の odpt:railway 参照から路線名を解決する', () => {
    const result = mapStations([OMOTESANDO_STATION], [GINZA_RAILWAY]);

    // 路線名辞書が owl:sameAs キーで引けないと生IDが出るバグの再現条件
    expect(result[0].railwayTitle).toBe('銀座線');
  });

  it('路線レコードが見つからない参照は生の参照値をフォールバックする', () => {
    // GINZA_RAILWAY を渡さない → 辞書ミス
    const result = mapStations([OMOTESANDO_STATION], []);

    expect(result[0].railwayTitle).toBe('odpt.Railway:TokyoMetro.Ginza');
  });

  it('緯度経度と駅名を ODPT のフィールドからそのまま写し取る', () => {
    const result = mapStations([OMOTESANDO_STATION], [GINZA_RAILWAY]);

    expect(result[0]).toMatchObject({
      stationTitle: '表参道',
      lat: 35.6654,
      lon: 139.7126,
      railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    });
  });

  it('owl:sameAs が欠けるレコードは @id をIDフォールバックに使う', () => {
    // owl:sameAs を意図的に欠落させた異常系レコード
    const broken = { ...OMOTESANDO_STATION } as RawStation;
    // @ts-expect-error owl:sameAs 欠落を模す
    delete broken['owl:sameAs'];

    const result = mapStations([broken], [GINZA_RAILWAY]);

    expect(result[0].stationId).toBe(OMOTESANDO_STATION['@id']);
  });
});

describe('mapTimetable', () => {
  /** 上り（浅草方面）と下り（渋谷方面）の時刻表レコード */
  const timetables: RawStationTimetable[] = [
    {
      // railDirection は owl:sameAs 形式
      'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
      'odpt:stationTimetableObject': [
        {
          'odpt:departureTime': '07:00',
          'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'],
          'odpt:trainType': 'odpt.TrainType:TokyoMetro.Local',
        },
      ],
    },
    {
      'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Shibuya',
      'odpt:stationTimetableObject': [
        {
          'odpt:departureTime': '07:05',
          'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Shibuya'],
          'odpt:trainType': 'odpt.TrainType:TokyoMetro.Local',
        },
      ],
    },
  ];

  const baseParams = {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    calendar: 'Weekday',
    railway: GINZA_RAILWAY,
    stations: [OMOTESANDO_STATION, SHIBUYA_STATION, ASAKUSA_STATION],
    trainTypes: [LOCAL_TRAIN_TYPE],
    directions: [ASAKUSA_DIRECTION, SHIBUYA_DIRECTION],
  };

  it('owl:sameAs 形式の railDirection 参照で上り時刻表を分離する', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result.outbound.map((d) => d.time)).toEqual(['07:00']);
  });

  it('owl:sameAs 形式の railDirection 参照で下り時刻表を分離する', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result.inbound.map((d) => d.time)).toEqual(['07:05']);
  });

  it('owl:sameAs 形式の方面参照から方面名を解決する（上り/下りフォールバックに落ちない）', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result.outboundDirectionName).toBe('浅草方面');
    expect(result.inboundDirectionName).toBe('渋谷方面');
  });

  it('owl:sameAs 形式の destinationStation 参照から行先駅名を解決する', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result.outbound[0].destination).toBe('浅草');
  });

  it('owl:sameAs 形式の trainType 参照から種別名を解決する', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result.outbound[0].trainType).toBe('各駅停車');
  });

  it('destinationStation 未指定の列車は行先不明を返す', () => {
    const noDest: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [{ 'odpt:departureTime': '08:00' }],
      },
    ];

    const result = mapTimetable({ ...baseParams, timetables: noDest });

    expect(result.outbound[0].destination).toBe('行先不明');
  });

  it('trainType 未指定の列車は各停を返す', () => {
    const noType: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [{ 'odpt:departureTime': '08:00' }],
      },
    ];

    const result = mapTimetable({ ...baseParams, timetables: noType });

    expect(result.outbound[0].trainType).toBe('各停');
  });

  it('辞書に存在しない行先参照はID末尾セグメントをフォールバック表示する', () => {
    const unknownDest: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '08:00',
            'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Ueno'],
          },
        ],
      },
    ];

    const result = mapTimetable({ ...baseParams, timetables: unknownDest });

    // 生IDフルではなく末尾セグメントのみ（ODPTガイドライン配慮）
    expect(result.outbound[0].destination).toBe('Ueno');
  });

  it('他社直通の行先IDも駅名辞書にあれば解決する', () => {
    // 千代田線→小田急直通など、他社駅が行先になるケース。
    // 駅一覧は行先IDで直接取得するため、他社駅も辞書に載りうる。
    const honAtsugi: RawStation = {
      '@id': 'urn:ucode:_00001C00000000000001000003150001',
      'owl:sameAs': 'odpt.Station:Odakyu.Odawara.HonAtsugi',
      'dc:title': '本厚木',
      'geo:lat': 35.4386,
      'geo:long': 139.3656,
      'odpt:railway': 'odpt.Railway:Odakyu.Odawara',
    };
    const throughService: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '08:00',
            'odpt:destinationStation': ['odpt.Station:Odakyu.Odawara.HonAtsugi'],
          },
        ],
      },
    ];

    const result = mapTimetable({
      ...baseParams,
      stations: [...baseParams.stations, honAtsugi],
      timetables: throughService,
    });

    expect(result.outbound[0].destination).toBe('本厚木');
  });

  it('行先が複数要素の配列なら駅名を・で連結する（分割運転）', () => {
    const splitService: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '08:00',
            'odpt:destinationStation': [
              'odpt.Station:TokyoMetro.Ginza.Shibuya',
              'odpt.Station:TokyoMetro.Ginza.Asakusa',
            ],
          },
        ],
      },
    ];

    const result = mapTimetable({ ...baseParams, timetables: splitService });

    expect(result.outbound[0].destination).toBe('渋谷・浅草');
  });

  it('行先が空配列の列車は行先不明を返す', () => {
    const emptyDest: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '08:00',
            'odpt:destinationStation': [],
          },
        ],
      },
    ];

    const result = mapTimetable({ ...baseParams, timetables: emptyDest });

    expect(result.outbound[0].destination).toBe('行先不明');
  });

  it('対応する方向の時刻表が無い場合は空配列と方面名フォールバックを返す', () => {
    // 上り（浅草方面）の時刻表のみ → 下りは空
    const onlyOutbound: RawStationTimetable[] = [timetables[0]];

    const result = mapTimetable({ ...baseParams, timetables: onlyOutbound });

    expect(result.inbound).toEqual([]);
    // 方面名は辞書から引けるので渋谷方面のまま（時刻表の有無とは独立）
    expect(result.inboundDirectionName).toBe('渋谷方面');
  });

  it('路線レコードが無い場合は方面名が上り/下りフォールバックになる', () => {
    const result = mapTimetable({
      ...baseParams,
      timetables,
      railway: undefined,
    });

    expect(result.outboundDirectionName).toBe('上り');
    expect(result.inboundDirectionName).toBe('下り');
    // 方向IDが空になるため時刻表も分離できず空
    expect(result.outbound).toEqual([]);
    expect(result.inbound).toEqual([]);
  });

  it('リクエストされた stationId / railwayId / calendar をレスポンスに引き継ぐ', () => {
    const result = mapTimetable({ ...baseParams, timetables });

    expect(result).toMatchObject({
      stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
      railwayId: 'odpt.Railway:TokyoMetro.Ginza',
      calendar: 'Weekday',
    });
  });
});

describe('collectDestinationIds', () => {
  it('複数レコード・複数列車にまたがる行先IDを重複排除して集める', () => {
    const timetables: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '07:00',
            'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'],
          },
          {
            'odpt:departureTime': '07:10',
            // 同じ行先が再登場 → 1件に集約される
            'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Asakusa'],
          },
        ],
      },
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Shibuya',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '07:05',
            'odpt:destinationStation': ['odpt.Station:TokyoMetro.Ginza.Shibuya'],
          },
        ],
      },
    ];

    const result = collectDestinationIds(timetables);

    expect([...result].sort()).toEqual([
      'odpt.Station:TokyoMetro.Ginza.Asakusa',
      'odpt.Station:TokyoMetro.Ginza.Shibuya',
    ]);
  });

  it('配列の複数行先（分割運転）を個別IDとして展開する', () => {
    const timetables: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [
          {
            'odpt:departureTime': '08:00',
            'odpt:destinationStation': [
              'odpt.Station:TokyoMetro.Ginza.Shibuya',
              'odpt.Station:TokyoMetro.Ginza.Asakusa',
            ],
          },
        ],
      },
    ];

    const result = collectDestinationIds(timetables);

    expect([...result].sort()).toEqual([
      'odpt.Station:TokyoMetro.Ginza.Asakusa',
      'odpt.Station:TokyoMetro.Ginza.Shibuya',
    ]);
  });

  it('行先未指定の列車はID集合に寄与しない', () => {
    const timetables: RawStationTimetable[] = [
      {
        'odpt:railDirection': 'odpt.RailDirection:TokyoMetro.Asakusa',
        'odpt:stationTimetableObject': [{ 'odpt:departureTime': '08:00' }],
      },
    ];

    const result = collectDestinationIds(timetables);

    expect(result).toEqual([]);
  });
});
