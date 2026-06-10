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

// ===== ODPT API 連携（APIキー設定済み時） =====

/** ODPT API のベースURL */
const ODPT_BASE = 'https://api.odpt.org/api/v4';

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

// ===== fetch ラッパー: データ取得して純関数を呼ぶだけ =====

/**
 * ODPT API から東京メトロ全駅を取得して整形する。
 * 取得処理のみを担い、変換は mapStations に委譲する。
 */
async function fetchOdptStations(apiKey: string): Promise<StationResponse[]> {
  const url = new URL(`${ODPT_BASE}/odpt:Station`);
  url.searchParams.set('acl:consumerKey', apiKey);
  url.searchParams.set('odpt:operator', 'odpt.Operator:TokyoMetro');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }
  const rawStations = (await res.json()) as RawStation[];

  // 路線IDから路線名を解決するため Railway を別途取得
  const railwayRes = await fetch(
    `${ODPT_BASE}/odpt:Railway?acl:consumerKey=${apiKey}&odpt:operator=odpt.Operator:TokyoMetro`
  );
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
  // カレンダー区分を ODPT の ID 形式に変換
  const calendarId =
    calendar === 'Weekday'
      ? 'odpt.Calendar:Weekday'
      : 'odpt.Calendar:SaturdayHoliday';

  const url = new URL(`${ODPT_BASE}/odpt:StationTimetable`);
  url.searchParams.set('acl:consumerKey', apiKey);
  url.searchParams.set('odpt:station', stationId);
  url.searchParams.set('odpt:railway', railwayId);
  url.searchParams.set('odpt:calendar', calendarId);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }
  const timetables = (await res.json()) as RawStationTimetable[];

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

  // 列車種別一覧
  const trainTypeRes = await fetch(
    `${ODPT_BASE}/odpt:TrainType?acl:consumerKey=${apiKey}&odpt:operator=odpt.Operator:TokyoMetro`
  );
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
        // モックデータのルックアップ
        const key = `${stationId}:${railwayId}:${calendar}`;
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

    // /api 以外はビルド済みフロント(静的アセット)を配信する
    return env.ASSETS.fetch(request);
  },
};
