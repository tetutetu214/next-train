// ===== Cloudflare Workers プロキシ: ODPT API v4 中継 =====
// - ODPT_API_KEY が設定されていれば ODPT API を叩く
// - 未設定（開発・キー申請中）の場合はモックデータを返す
// - IDは必ず自然言語名に変換してから返す（ODPTガイドライン要件）
//
// 【ID系統に関する重要な注意】
// ODPT のレコードは ID を2系統持つ:
//   - `@id`        : urn:ucode:_00001C... 形式の機械ID（レコード固有）
//   - `owl:sameAs` : odpt.Railway:TokyoMetro.Ginza 等の正規ID
// リソース間の参照フィールド（odpt:railway / odpt:station /
// odpt:destinationStation / odpt:trainType / odpt:railDirection /
// odpt:ascendingRailDirection 等）はすべて owl:sameAs 形式の値を持つ。
// また ODPT のクエリフィルタ（odpt:station= / odpt:railway= 等）も
// owl:sameAs 形式しかマッチしない。
// そのため辞書のキー・駅IDはすべて owl:sameAs 形式で統一する。
// （@id ベースで組むと参照解決が全ミスして時刻表が空になる）

/** Cloudflare Workers の環境変数型 */
interface Env {
  ODPT_API_KEY: string;
  // web/dist のビルド済みフロントを配信するための静的アセットバインディング
  ASSETS: Fetcher;
}

// ===== ODPT 生レスポンスの型（必要なフィールドのみ） =====

/** ODPT odpt:Station レコード（生） */
export interface RawStation {
  '@id': string;
  'owl:sameAs': string;
  'dc:title': string;
  'geo:lat': number;
  'geo:long': number;
  'odpt:railway': string;
}

/** ODPT odpt:Railway レコード（生） */
export interface RawRailway {
  '@id': string;
  'owl:sameAs': string;
  'dc:title': string;
  'odpt:ascendingRailDirection': string;
  'odpt:descendingRailDirection': string;
}

/** ODPT odpt:StationTimetableObject（1本の列車） */
export interface RawTimetableObject {
  'odpt:departureTime': string;
  // 行先は実データでは配列。分割運転だと複数要素を持つ
  // 例: ["odpt.Station:JR-East.JobanLocal.Abiko"]
  'odpt:destinationStation'?: string[];
  'odpt:trainType'?: string;
}

/** ODPT odpt:StationTimetable レコード（生） */
export interface RawStationTimetable {
  // odpt:calendar は owl:sameAs 形式の参照値（例 'odpt.Calendar:Weekday'）。
  // 都営は路線によって Weekday/SaturdayHoliday の2区分か、
  // Weekday/Saturday/Holiday の3区分かが異なるため、worker 側でこの値を見て
  // カレンダー優先順位で方向ごとにレコードを選ぶ。
  'odpt:calendar': string;
  'odpt:railDirection': string;
  'odpt:stationTimetableObject': RawTimetableObject[];
}

/** ODPT odpt:TrainType レコード（生） */
export interface RawTrainType {
  '@id': string;
  'owl:sameAs': string;
  'dc:title': string;
}

/** ODPT odpt:RailDirection レコード（生） */
export interface RawRailDirection {
  '@id': string;
  'owl:sameAs': string;
  'dc:title': string;
}

/**
 * 多言語テキスト（ja/en）。
 * odpt:trainInformationText は実データではこのオブジェクト形だが、
 * 古い仕様・他事業者では素の文字列のこともあるため両対応にする。
 */
export type LocalizedText = string | { ja?: string; en?: string };

/**
 * ODPT odpt:TrainInformation レコード（生）。
 * 2026-06-10 実測形:
 *   - 平常時は odpt:trainInformationStatus フィールド自体が存在しない
 *   - 異常時のみ odpt:trainInformationStatus（例 {"ja":"遅延"}）が付く
 *   - odpt:railway が無い「全線共通」レコードが来る可能性がある（undefined 許容）
 */
export interface RawTrainInformation {
  '@id': string;
  'owl:sameAs'?: string;
  'dc:date': string;
  // owl:sameAs 形式の路線参照。全線共通レコードでは欠落しうる
  'odpt:railway'?: string;
  // 異常時のみ存在。これを異常判定に使う
  'odpt:trainInformationStatus'?: LocalizedText;
  // 平常時も入る説明文。オブジェクト/文字列両対応
  'odpt:trainInformationText'?: LocalizedText;
}

/** 駅情報（レスポンス型） */
export interface StationResponse {
  stationId: string;
  stationTitle: string;
  lat: number;
  lon: number;
  railwayId: string;
  railwayTitle: string;
}

/** 発車情報（レスポンス型） */
export interface DepartureResponse {
  time: string;
  destination: string;
  trainType: string;
  railDirection: string;
}

/** 時刻表レスポンス型 */
export interface TimetableResponse {
  stationId: string;
  railwayId: string;
  calendar: string;
  outbound: DepartureResponse[];
  inbound: DepartureResponse[];
  outboundDirectionName: string;
  inboundDirectionName: string;
}

/** 運行情報レスポンス型 */
export interface TrainInformationResponse {
  // owl:sameAs 形式の路線ID。全線共通レコードでは null
  railwayId: string | null;
  // 路線名。Railway 辞書で解決。解決不能・路線参照なしは null
  railwayTitle: string | null;
  // 異常ステータス（例 '遅延'）。平常時（フィールド欠落）は null。
  // フロントはこの値の non-null でバナー表示有無を判定する
  statusLabel: string | null;
  // 運行情報の説明文（平常時は「現在、平常どおり運転しています。」等）
  infoText: string;
  // 情報時刻（dc:date をそのまま引き継ぐ）
  date: string;
}

// ===== CORS ヘッダー =====
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** JSON レスポンスを生成する */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

/** エラーレスポンスを生成する */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ===== モックデータ =====
// ODPT_API_KEY が未設定（申請中）の間は以下のモックを返す。
// 表参道付近（銀座線・千代田線）の現実的な発車時刻を含む。

/** モック: 東京メトロ駅一覧 */
const MOCK_STATIONS: StationResponse[] = [
  // 表参道（銀座線）
  {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
    stationTitle: '表参道',
    lat: 35.6654,
    lon: 139.7126,
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    railwayTitle: '銀座線',
  },
  // 表参道（千代田線）
  {
    stationId: 'odpt.Station:TokyoMetro.Chiyoda.Omotesando',
    stationTitle: '表参道',
    lat: 35.6654,
    lon: 139.7126,
    railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
    railwayTitle: '千代田線',
  },
  // 外苑前（銀座線）
  {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Gaienmae',
    stationTitle: '外苑前',
    lat: 35.6697,
    lon: 139.7169,
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    railwayTitle: '銀座線',
  },
  // 明治神宮前（千代田線）
  {
    stationId: 'odpt.Station:TokyoMetro.Chiyoda.MeijiJingumae',
    stationTitle: '明治神宮前',
    lat: 35.6651,
    lon: 139.7037,
    railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
    railwayTitle: '千代田線',
  },
  // 渋谷（銀座線）
  {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Shibuya',
    stationTitle: '渋谷',
    lat: 35.6581,
    lon: 139.7013,
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    railwayTitle: '銀座線',
  },
];

/**
 * モック時刻表を生成する。
 * 6〜24時の範囲で1〜2時間おきに発車時刻を作成する。
 */
function generateMockDepartures(
  startHour: number,
  endHour: number,
  intervalMinutes: number,
  destination: string,
  trainType: string,
  directionName: string
): DepartureResponse[] {
  const departures: DepartureResponse[] = [];
  let hour = startHour;
  let minute = 0;

  while (hour < endHour) {
    const h = hour.toString().padStart(2, '0');
    const m = minute.toString().padStart(2, '0');
    departures.push({
      time: `${h}:${m}`,
      destination,
      trainType,
      railDirection: directionName,
    });

    // 次の時刻を計算
    minute += intervalMinutes;
    if (minute >= 60) {
      minute -= 60;
      hour += 1;
    }
  }

  return departures;
}

/**
 * モック: 表参道（銀座線）平日時刻表
 */
function getMockGinzaOmotesandoWeekday(): TimetableResponse {
  return {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    calendar: 'Weekday',
    outbound: generateMockDepartures(5, 24, 5, '渋谷', '各停', '渋谷方面'),
    inbound: generateMockDepartures(5, 24, 5, '浅草', '各停', '浅草方面'),
    outboundDirectionName: '渋谷方面',
    inboundDirectionName: '浅草方面',
  };
}

/**
 * モック: 表参道（銀座線）土休日時刻表
 */
function getMockGinzaOmotesandoHoliday(): TimetableResponse {
  return {
    stationId: 'odpt.Station:TokyoMetro.Ginza.Omotesando',
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    calendar: 'SaturdayHoliday',
    outbound: generateMockDepartures(5, 24, 7, '渋谷', '各停', '渋谷方面'),
    inbound: generateMockDepartures(5, 24, 7, '浅草', '各停', '浅草方面'),
    outboundDirectionName: '渋谷方面',
    inboundDirectionName: '浅草方面',
  };
}

/**
 * モック: 表参道（千代田線）平日時刻表
 */
function getMockChiyodaOmotesandoWeekday(): TimetableResponse {
  return {
    stationId: 'odpt.Station:TokyoMetro.Chiyoda.Omotesando',
    railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
    calendar: 'Weekday',
    outbound: generateMockDepartures(5, 24, 5, '代々木上原', '各停', '代々木上原方面'),
    inbound: generateMockDepartures(5, 24, 5, '北綾瀬', '各停', '北綾瀬方面'),
    outboundDirectionName: '代々木上原方面',
    inboundDirectionName: '北綾瀬方面',
  };
}

/**
 * モック: 表参道（千代田線）土休日時刻表
 */
function getMockChiyodaOmotesandoHoliday(): TimetableResponse {
  return {
    stationId: 'odpt.Station:TokyoMetro.Chiyoda.Omotesando',
    railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
    calendar: 'SaturdayHoliday',
    outbound: generateMockDepartures(5, 24, 7, '代々木上原', '各停', '代々木上原方面'),
    inbound: generateMockDepartures(5, 24, 7, '北綾瀬', '各停', '北綾瀬方面'),
    outboundDirectionName: '代々木上原方面',
    inboundDirectionName: '北綾瀬方面',
  };
}

/** モック時刻表のルックアップキー → 生成関数のマップ */
const MOCK_TIMETABLE_MAP: Record<string, () => TimetableResponse> = {
  'odpt.Station:TokyoMetro.Ginza.Omotesando:odpt.Railway:TokyoMetro.Ginza:Weekday':
    getMockGinzaOmotesandoWeekday,
  'odpt.Station:TokyoMetro.Ginza.Omotesando:odpt.Railway:TokyoMetro.Ginza:SaturdayHoliday':
    getMockGinzaOmotesandoHoliday,
  'odpt.Station:TokyoMetro.Chiyoda.Omotesando:odpt.Railway:TokyoMetro.Chiyoda:Weekday':
    getMockChiyodaOmotesandoWeekday,
  'odpt.Station:TokyoMetro.Chiyoda.Omotesando:odpt.Railway:TokyoMetro.Chiyoda:SaturdayHoliday':
    getMockChiyodaOmotesandoHoliday,
};

/** モック: 運行情報。
 * モック駅は銀座線・千代田線なので、開発時にバナーが見えるよう
 * 銀座線=平常（statusLabel null）・千代田線=遅延（statusLabel '遅延'）の2件を返す。 */
const MOCK_TRAIN_INFORMATION: TrainInformationResponse[] = [
  {
    railwayId: 'odpt.Railway:TokyoMetro.Ginza',
    railwayTitle: '銀座線',
    statusLabel: null,
    infoText: '現在、平常どおり運転しています。',
    date: '2026-06-10T12:00:00+09:00',
  },
  {
    railwayId: 'odpt.Railway:TokyoMetro.Chiyoda',
    railwayTitle: '千代田線',
    statusLabel: '遅延',
    infoText: '人身事故の影響で、一部列車に遅れがでています。',
    date: '2026-06-10T12:00:00+09:00',
  },
];

// ===== ODPT API 連携（APIキー設定済み時） =====

/** ODPT API のベースURL */
const ODPT_BASE = 'https://api.odpt.org/api/v4';

// ===== 対応事業者 =====
// 通常キーでフル提供（駅座標+時刻表）される7社（計440駅）。
// odpt:operator= フィルタはカンマ区切りで複数指定でき、
// 'odpt.Operator:TokyoMetro,odpt.Operator:Toei' のように結合して1リクエストで取得する。
const SUPPORTED_OPERATORS: string[] = [
  'odpt.Operator:TokyoMetro', // 東京メトロ（186駅）
  'odpt.Operator:Toei', // 東京都交通局（149駅）
  'odpt.Operator:YokohamaMunicipal', // 横浜市交通局（42駅）
  'odpt.Operator:MIR', // 首都圏新都市鉄道（つくばエクスプレス・20駅）
  'odpt.Operator:TamaMonorail', // 多摩都市モノレール（19駅）
  'odpt.Operator:Yurikamome', // ゆりかもめ（16駅）
  'odpt.Operator:TWR', // 東京臨海高速鉄道（りんかい線・8駅）
];

/** odpt:operator= に渡すカンマ結合済みの事業者フィルタ値 */
const SUPPORTED_OPERATORS_FILTER = SUPPORTED_OPERATORS.join(',');

// ===== カレンダー選択 =====
// API の calendar パラメータは 'Weekday' | 'Saturday' | 'Holiday' の3値。
// 後方互換のため旧クライアントの 'SaturdayHoliday' も受ける。
// 1リクエストで calendar フィルタなしに駅+路線の全時刻表を取得し、
// worker 側で方向ごとに「優先順位の先頭で最初にヒットした区分」を採用する。

/** クライアントから受け取りうるカレンダー値 */
export type CalendarParam = 'Weekday' | 'Saturday' | 'Holiday' | 'SaturdayHoliday';

/**
 * 各カレンダー値に対する odpt:calendar 参照値の優先順位。
 * 先頭から順に探し、最初に存在する区分を採用する。
 * - Saturday/Holiday は、その専用区分が無い2区分路線では SaturdayHoliday に落ちる。
 * - 旧 'SaturdayHoliday' は SaturdayHoliday を最優先しつつ、3区分路線でも
 *   土休いずれかのダイヤを返せるよう Saturday/Holiday もフォールバックに含める。
 */
const CALENDAR_PRIORITY: Record<CalendarParam, string[]> = {
  Weekday: ['odpt.Calendar:Weekday'],
  Saturday: ['odpt.Calendar:Saturday', 'odpt.Calendar:SaturdayHoliday'],
  Holiday: ['odpt.Calendar:Holiday', 'odpt.Calendar:SaturdayHoliday'],
  SaturdayHoliday: [
    'odpt.Calendar:SaturdayHoliday',
    'odpt.Calendar:Saturday',
    'odpt.Calendar:Holiday',
  ],
};

/**
 * 受け取った calendar 文字列を既知の CalendarParam に正規化する。
 * 未知の値は安全側で 'Weekday' に倒す。
 *
 * @param calendar クエリで渡されたカレンダー文字列
 * @returns 正規化済みカレンダー値
 */
export function normalizeCalendarParam(calendar: string): CalendarParam {
  if (
    calendar === 'Weekday' ||
    calendar === 'Saturday' ||
    calendar === 'Holiday' ||
    calendar === 'SaturdayHoliday'
  ) {
    return calendar;
  }
  return 'Weekday';
}

/**
 * calendar フィルタなしで取得した時刻表レコード群から、
 * リクエストされたカレンダー区分に対応するレコードを方向ごとに選ぶ。
 *
 * 都営の一部路線は Weekday/Saturday/Holiday の3区分、
 * メトロ等は Weekday/SaturdayHoliday の2区分でデータを持つ。
 * そのため calendar 値ごとの優先順位（CALENDAR_PRIORITY）を先頭から辿り、
 * 「方向ごとに最初にヒットした区分のレコード」を集めて返す。
 * 方向を跨いだ集約はしない（上り/下りで採用区分が違ってもよい）。
 *
 * @param timetables calendar フィルタなしで取得した全時刻表レコード
 * @param calendar   正規化前のカレンダー文字列（内部で正規化する）
 * @returns 方向ごとに優先区分で選ばれた時刻表レコード群
 */
export function selectTimetablesByCalendar(
  timetables: RawStationTimetable[],
  calendar: string
): RawStationTimetable[] {
  const priority = CALENDAR_PRIORITY[normalizeCalendarParam(calendar)];

  // 方向（odpt:railDirection）ごとにグルーピングする。
  const byDirection = new Map<string, RawStationTimetable[]>();
  for (const tt of timetables) {
    const dir = tt['odpt:railDirection'];
    const list = byDirection.get(dir);
    if (list === undefined) {
      byDirection.set(dir, [tt]);
    } else {
      list.push(tt);
    }
  }

  const selected: RawStationTimetable[] = [];
  for (const list of byDirection.values()) {
    // 優先順位の先頭から辿り、その区分を持つレコードがあれば全て採用して打ち切る。
    for (const calendarId of priority) {
      const matches = list.filter((tt) => tt['odpt:calendar'] === calendarId);
      if (matches.length > 0) {
        selected.push(...matches);
        break;
      }
    }
  }

  return selected;
}

/**
 * モックのルックアップキー用にカレンダー値を正規化する。
 * 既存モックは 'Weekday' | 'SaturdayHoliday' の2キーしか持たないため、
 * 3値化後の Saturday/Holiday は SaturdayHoliday に寄せて解決する。
 *
 * @param calendar 正規化前のカレンダー文字列
 * @returns モックキー用のカレンダー文字列（'Weekday' | 'SaturdayHoliday'）
 */
export function mockCalendarKey(calendar: string): 'Weekday' | 'SaturdayHoliday' {
  return normalizeCalendarParam(calendar) === 'Weekday'
    ? 'Weekday'
    : 'SaturdayHoliday';
}

// ===== 純関数: ODPT 生レスポンス → アプリのレスポンス形 =====
// fetch から分離した変換ロジック。単体テスト対象。
// すべての参照解決は owl:sameAs 形式のキーで行う。

/**
 * レコードの正規ID（owl:sameAs）を返す。
 * owl:sameAs が欠けるレコードに備えて @id をフォールバックに使う。
 */
function canonicalId(record: { 'owl:sameAs'?: string; '@id': string }): string {
  return record['owl:sameAs'] ?? record['@id'];
}

/**
 * ODPT 参照ID（owl:sameAs 形式）の末尾セグメントを取り出す。
 * 辞書解決に失敗したときのフォールバック表示に使う。
 * 生IDフル表示は ODPT ガイドライン違反のため、せめて読める形に落とす。
 * 例: 'odpt.Station:Odakyu.Odawara.HonAtsugi' → 'HonAtsugi'
 *
 * @param id owl:sameAs 形式の参照ID
 * @returns 末尾のドット区切りセグメント
 */
function lastIdSegment(id: string): string {
  const segments = id.split('.');
  return segments[segments.length - 1];
}

/**
 * 時刻表レコード群から行先駅IDのユニーク集合を集める。
 * destinationStation は配列（分割運転で複数要素）なので展開して集約する。
 * 行先駅名辞書を「行先IDの直接指定」で取得するための事前抽出。
 *
 * @param timetables 時刻表レコード一覧
 * @returns 重複排除済みの行先駅ID配列
 */
export function collectDestinationIds(
  timetables: RawStationTimetable[]
): string[] {
  const ids = new Set<string>();
  for (const tt of timetables) {
    for (const obj of tt['odpt:stationTimetableObject']) {
      const dests = obj['odpt:destinationStation'];
      if (dests === undefined) {
        continue;
      }
      for (const dest of dests) {
        ids.add(dest);
      }
    }
  }
  return [...ids];
}

/**
 * ODPT の Station/Railway 生レコードをアプリの駅レスポンスに変換する。
 * - 駅IDは owl:sameAs（odpt.Station:... 形式）を使う。
 *   フロントはこの値を /api/timetable?station= にそのまま渡すため、
 *   ODPT の odpt:station= フィルタにマッチする正規ID でなければならない。
 * - station['odpt:railway'] は owl:sameAs 形式なので、路線名辞書も
 *   owl:sameAs キーで構築してルックアップする。
 *
 * @param rawStations 駅レコード一覧
 * @param rawRailways 路線レコード一覧（路線名の解決に使う）
 * @returns 整形済み駅レスポンス一覧
 */
export function mapStations(
  rawStations: RawStation[],
  rawRailways: RawRailway[]
): StationResponse[] {
  // owl:sameAs（正規路線ID）→ 路線名 の辞書
  const railwayTitleMap = new Map(
    rawRailways.map((r) => [canonicalId(r), r['dc:title']])
  );

  return rawStations.map((station) => {
    const railwayRef = station['odpt:railway'];
    return {
      stationId: canonicalId(station),
      stationTitle: station['dc:title'],
      lat: station['geo:lat'],
      lon: station['geo:long'],
      railwayId: railwayRef,
      // 辞書にない場合は生の参照値をそのまま使う（@id ではなく参照値）
      railwayTitle: railwayTitleMap.get(railwayRef) ?? railwayRef,
    };
  });
}

/**
 * ODPT の時刻表まわりの生レコード群をアプリの時刻表レスポンスに変換する。
 * - 行先駅・列車種別・方面名はすべて owl:sameAs 形式の参照値を辞書で解決する。
 * - 辞書にヒットしない参照値は生のままフォールバックする（'各停'/'上り' 等の
 *   既定値は値が欠落している場合のみ）。
 *
 * @param params.stationId  リクエストされた駅ID（owl:sameAs 形式）
 * @param params.railwayId  リクエストされた路線ID（owl:sameAs 形式）
 * @param params.calendar   カレンダー区分
 * @param params.timetables 当該駅・路線・カレンダーの時刻表レコード
 * @param params.railway    対象路線レコード（上り/下り方向IDの取得に使う）
 * @param params.stations   行先駅名解決用の駅レコード一覧
 * @param params.trainTypes 列車種別レコード一覧
 * @param params.directions 方面（RailDirection）レコード一覧
 * @returns 整形済み時刻表レスポンス
 */
export function mapTimetable(params: {
  stationId: string;
  railwayId: string;
  calendar: string;
  timetables: RawStationTimetable[];
  railway: RawRailway | undefined;
  stations: RawStation[];
  trainTypes: RawTrainType[];
  directions: RawRailDirection[];
}): TimetableResponse {
  const {
    stationId,
    railwayId,
    calendar,
    timetables,
    railway,
    stations,
    trainTypes,
    directions,
  } = params;

  // owl:sameAs（正規駅ID）→ 駅名（destinationStation の解決用）
  const stationTitleMap = new Map(
    stations.map((s) => [canonicalId(s), s['dc:title']])
  );
  // owl:sameAs（正規種別ID）→ 種別名
  const trainTypeTitleMap = new Map(
    trainTypes.map((t) => [canonicalId(t), t['dc:title']])
  );
  // owl:sameAs（正規方面ID）→ 方面名
  const directionTitleMap = new Map(
    directions.map((d) => [canonicalId(d), d['dc:title']])
  );

  // 上り・下りの方向ID（これらも owl:sameAs 形式の参照値）
  const ascendingId = railway?.['odpt:ascendingRailDirection'] ?? '';
  const descendingId = railway?.['odpt:descendingRailDirection'] ?? '';

  // 上り・下り時刻表を分離（odpt:railDirection は owl:sameAs 形式）
  const outboundRaw = timetables.find(
    (t) => t['odpt:railDirection'] === ascendingId
  );
  const inboundRaw = timetables.find(
    (t) => t['odpt:railDirection'] === descendingId
  );

  const toDepResponse = (
    items: RawTimetableObject[],
    dirName: string
  ): DepartureResponse[] =>
    items.map((item) => {
      const dests = item['odpt:destinationStation'];
      const type = item['odpt:trainType'];
      return {
        time: item['odpt:departureTime'],
        // 行先: 配列の各要素を辞書解決し、複数要素なら '・' で連結（分割運転対応）。
        // 辞書ミス時は生IDフルではなく末尾セグメントをフォールバック表示する。
        // 空配列・未指定は '行先不明'。
        destination:
          dests !== undefined && dests.length > 0
            ? dests
                .map((d) => stationTitleMap.get(d) ?? lastIdSegment(d))
                .join('・')
            : '行先不明',
        // 種別: 参照値があれば辞書解決、辞書ミス時は生の参照値、未指定時のみ '各停'
        trainType:
          type !== undefined ? (trainTypeTitleMap.get(type) ?? type) : '各停',
        railDirection: dirName,
      };
    });

  const outboundDirName = directionTitleMap.get(ascendingId) ?? '上り';
  const inboundDirName = directionTitleMap.get(descendingId) ?? '下り';

  return {
    stationId,
    railwayId,
    calendar,
    outbound:
      outboundRaw !== undefined
        ? toDepResponse(outboundRaw['odpt:stationTimetableObject'], outboundDirName)
        : [],
    inbound:
      inboundRaw !== undefined
        ? toDepResponse(inboundRaw['odpt:stationTimetableObject'], inboundDirName)
        : [],
    outboundDirectionName: outboundDirName,
    inboundDirectionName: inboundDirName,
  };
}

/**
 * 多言語テキスト（文字列 or {ja,en} オブジェクト）から日本語表記を取り出す。
 * - 文字列ならそのまま返す
 * - オブジェクトなら ja を優先（無ければ空文字）
 * - undefined は空文字
 *
 * @param text odpt:trainInformationText / odpt:trainInformationStatus の値
 * @returns 日本語テキスト（無ければ空文字）
 */
function localizedJa(text: LocalizedText | undefined): string {
  if (text === undefined) {
    return '';
  }
  if (typeof text === 'string') {
    return text;
  }
  return text.ja ?? '';
}

/**
 * ODPT の TrainInformation/Railway 生レコード群をアプリの運行情報レスポンスに変換する。
 * - 路線名は odpt:railway（owl:sameAs 形式）を Railway 辞書で解決する（mapStations と同じパターン）。
 * - statusLabel は odpt:trainInformationStatus の ja。平常時はフィールド自体が無いため null。
 *   フロントはこの null/非null でバナー表示有無を判定する。
 * - odpt:railway が欠落する全線共通レコードは railwayId / railwayTitle を null にする。
 *
 * @param rawInfos    運行情報レコード一覧
 * @param rawRailways 路線レコード一覧（路線名の解決に使う）
 * @returns 整形済み運行情報レスポンス一覧
 */
export function mapTrainInformation(
  rawInfos: RawTrainInformation[],
  rawRailways: RawRailway[]
): TrainInformationResponse[] {
  // owl:sameAs（正規路線ID）→ 路線名 の辞書（@id は使わない）
  const railwayTitleMap = new Map(
    rawRailways.map((r) => [canonicalId(r), r['dc:title']])
  );

  return rawInfos.map((info) => {
    const railwayRef = info['odpt:railway'];
    // odpt:trainInformationStatus が存在するときのみ異常扱い。
    // 平常時はフィールド自体が無いので statusLabel は null になる。
    const statusJa = localizedJa(info['odpt:trainInformationStatus']);

    return {
      railwayId: railwayRef ?? null,
      // 路線参照があれば辞書解決（ヒットしなければ参照値をそのまま）、無ければ null
      railwayTitle:
        railwayRef !== undefined
          ? (railwayTitleMap.get(railwayRef) ?? railwayRef)
          : null,
      // status フィールド欠落・空文字なら平常とみなし null
      statusLabel: statusJa !== '' ? statusJa : null,
      infoText: localizedJa(info['odpt:trainInformationText']),
      date: info['dc:date'],
    };
  });
}

// ===== fetch ラッパー: データ取得して純関数を呼ぶだけ =====

/**
 * ODPT API から東京メトロ全駅を取得して整形する。
 * 取得処理のみを担い、変換は mapStations に委譲する。
 */
async function fetchOdptStations(apiKey: string): Promise<StationResponse[]> {
  const url = new URL(`${ODPT_BASE}/odpt:Station`);
  url.searchParams.set('acl:consumerKey', apiKey);
  // 対応7社をカンマ結合で1リクエストにまとめて取得する
  url.searchParams.set('odpt:operator', SUPPORTED_OPERATORS_FILTER);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }
  const rawStations = (await res.json()) as RawStation[];

  // 路線IDから路線名を解決するため Railway を別途取得（同じく7社分まとめて）
  const railwayUrl = new URL(`${ODPT_BASE}/odpt:Railway`);
  railwayUrl.searchParams.set('acl:consumerKey', apiKey);
  railwayUrl.searchParams.set('odpt:operator', SUPPORTED_OPERATORS_FILTER);
  const railwayRes = await fetch(railwayUrl.toString());
  const rawRailways = (await railwayRes.json()) as RawRailway[];

  return mapStations(rawStations, rawRailways);
}

/**
 * ODPT API から指定駅・路線・カレンダーの時刻表を取得して整形する。
 * 取得処理のみを担い、変換は mapTimetable に委譲する。
 */
async function fetchOdptTimetable(
  apiKey: string,
  stationId: string,
  railwayId: string,
  calendar: string
): Promise<TimetableResponse> {
  // calendar フィルタは付けず、駅+路線で全カレンダー区分の時刻表をまとめて取る。
  // 都営は路線によって 2区分(Weekday/SaturdayHoliday) か
  // 3区分(Weekday/Saturday/Holiday) かが違うため、区分の選択は
  // 取得後に selectTimetablesByCalendar で方向ごとに行う。
  // 方向×区分で最大8件程度になるが許容範囲。
  const url = new URL(`${ODPT_BASE}/odpt:StationTimetable`);
  url.searchParams.set('acl:consumerKey', apiKey);
  url.searchParams.set('odpt:station', stationId);
  url.searchParams.set('odpt:railway', railwayId);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }
  const allTimetables = (await res.json()) as RawStationTimetable[];

  // リクエストされたカレンダー区分に対応するレコードを方向ごとに選ぶ
  const timetables = selectTimetablesByCalendar(allTimetables, calendar);

  // Railway 情報から方面名を取得（owl:sameAs でフィルタする点が肝）
  const railwayRes = await fetch(
    `${ODPT_BASE}/odpt:Railway?acl:consumerKey=${apiKey}&owl:sameAs=${railwayId}`
  );
  const railways = (await railwayRes.json()) as RawRailway[];

  // 駅名辞書用の駅一覧（destinationStation の変換用）。
  // 行先には他社直通駅（JR-East / Odakyu 等）が含まれるため、
  // 路線フィルタ（odpt:railway=）では他社・他路線の行先が解決できない。
  // そこで時刻表に出てくる行先IDを集めて owl:sameAs で直接指定して取得する。
  // owl:sameAs はカンマ区切りで複数IDをまとめて1リクエストにできる（実API検証済み）。
  const destinationIds = collectDestinationIds(timetables);
  // 行先が0件なら駅取得リクエスト自体をスキップ（無駄なAPIコールを避ける）
  const stations =
    destinationIds.length > 0
      ? ((await (
          await fetch(
            `${ODPT_BASE}/odpt:Station?acl:consumerKey=${apiKey}&owl:sameAs=${destinationIds.join(',')}`
          )
        ).json()) as RawStation[])
      : [];

  // 列車種別一覧（対応7社分をまとめて取得）
  const trainTypeUrl = new URL(`${ODPT_BASE}/odpt:TrainType`);
  trainTypeUrl.searchParams.set('acl:consumerKey', apiKey);
  trainTypeUrl.searchParams.set('odpt:operator', SUPPORTED_OPERATORS_FILTER);
  const trainTypeRes = await fetch(trainTypeUrl.toString());
  const trainTypes = (await trainTypeRes.json()) as RawTrainType[];

  // 方面（RailDirection）一覧
  const directionRes = await fetch(
    `${ODPT_BASE}/odpt:RailDirection?acl:consumerKey=${apiKey}`
  );
  const directions = (await directionRes.json()) as RawRailDirection[];

  return mapTimetable({
    stationId,
    railwayId,
    calendar,
    timetables,
    railway: railways[0],
    stations,
    trainTypes,
    directions,
  });
}

/**
 * ODPT API から東京メトロの運行情報を取得して整形する。
 * 取得処理のみを担い、変換は mapTrainInformation に委譲する。
 */
async function fetchOdptTrainInformation(
  apiKey: string
): Promise<TrainInformationResponse[]> {
  // 対応7社分の運行情報をまとめて取得（ゆりかもめは提供なし=0件だが、
  // カンマ結合フィルタに含めても他社の結果に影響しない）
  const url = new URL(`${ODPT_BASE}/odpt:TrainInformation`);
  url.searchParams.set('acl:consumerKey', apiKey);
  url.searchParams.set('odpt:operator', SUPPORTED_OPERATORS_FILTER);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }
  const rawInfos = (await res.json()) as RawTrainInformation[];

  // 路線IDから路線名を解決するため Railway を別途取得（mapStations と同パターン）
  const railwayUrl = new URL(`${ODPT_BASE}/odpt:Railway`);
  railwayUrl.searchParams.set('acl:consumerKey', apiKey);
  railwayUrl.searchParams.set('odpt:operator', SUPPORTED_OPERATORS_FILTER);
  const railwayRes = await fetch(railwayUrl.toString());
  const rawRailways = (await railwayRes.json()) as RawRailway[];

  return mapTrainInformation(rawInfos, rawRailways);
}

// ===== Workers エントリーポイント =====

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS プリフライト対応
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // GET 以外は拒否
    if (request.method !== 'GET') {
      return errorResponse('Method Not Allowed', 405);
    }

    // APIキーが設定されているか確認（空文字列も未設定扱い）
    const hasApiKey = env.ODPT_API_KEY !== undefined && env.ODPT_API_KEY.trim() !== '';

    // ===== /api/stations =====
    if (url.pathname === '/api/stations') {
      if (!hasApiKey) {
        // APIキー未設定: モックデータを返す
        return jsonResponse(MOCK_STATIONS);
      }

      try {
        const stations = await fetchOdptStations(env.ODPT_API_KEY);
        return jsonResponse(stations);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        return errorResponse(`ODPT API エラー: ${message}`, 502);
      }
    }

    // ===== /api/timetable =====
    if (url.pathname === '/api/timetable') {
      const stationId = url.searchParams.get('station');
      const railwayId = url.searchParams.get('railway');
      const calendar = url.searchParams.get('calendar');

      if (stationId === null || railwayId === null || calendar === null) {
        return errorResponse('クエリパラメータ station, railway, calendar が必要です', 400);
      }

      if (!hasApiKey) {
        // モックデータのルックアップ。
        // モックは Weekday/SaturdayHoliday の2キーしか持たないため、
        // 3値化後の Saturday/Holiday は SaturdayHoliday に正規化して引く。
        const key = `${stationId}:${railwayId}:${mockCalendarKey(calendar)}`;
        const mockFn = MOCK_TIMETABLE_MAP[key];
        if (mockFn !== undefined) {
          return jsonResponse(mockFn());
        }
        // モックに対応するデータがない駅でも空の構造を返す
        return jsonResponse({
          stationId,
          railwayId,
          calendar,
          outbound: [],
          inbound: [],
          outboundDirectionName: '上り',
          inboundDirectionName: '下り',
        });
      }

      try {
        const timetable = await fetchOdptTimetable(
          env.ODPT_API_KEY,
          stationId,
          railwayId,
          calendar
        );
        return jsonResponse(timetable);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        return errorResponse(`ODPT API エラー: ${message}`, 502);
      }
    }

    // ===== /api/train-information =====
    if (url.pathname === '/api/train-information') {
      if (!hasApiKey) {
        // APIキー未設定: モックの運行情報を返す（銀座線=平常・千代田線=遅延）
        return jsonResponse(MOCK_TRAIN_INFORMATION);
      }

      try {
        const info = await fetchOdptTrainInformation(env.ODPT_API_KEY);
        return jsonResponse(info);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        return errorResponse(`ODPT API エラー: ${message}`, 502);
      }
    }

    // /api 以外はビルド済みフロント(静的アセット)を配信する
    return env.ASSETS.fetch(request);
  },
};
