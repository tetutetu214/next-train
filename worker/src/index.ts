// ===== Cloudflare Workers プロキシ: ODPT API v4 中継 =====
// - ODPT_API_KEY が設定されていれば ODPT API を叩く
// - 未設定（開発・キー申請中）の場合はモックデータを返す
// - IDは必ず自然言語名に変換してから返す（ODPTガイドライン要件）

/** Cloudflare Workers の環境変数型 */
interface Env {
  ODPT_API_KEY: string;
  // web/dist のビルド済みフロントを配信するための静的アセットバインディング
  ASSETS: Fetcher;
}

/** 駅情報（レスポンス型） */
interface StationResponse {
  stationId: string;
  stationTitle: string;
  lat: number;
  lon: number;
  railwayId: string;
  railwayTitle: string;
}

/** 発車情報（レスポンス型） */
interface DepartureResponse {
  time: string;
  destination: string;
  trainType: string;
  railDirection: string;
}

/** 時刻表レスポンス型 */
interface TimetableResponse {
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

/**
 * ODPT API から東京メトロ全駅を取得して整形する。
 * raw IDは返さず、全フィールドを自然言語名に変換する。
 */
async function fetchOdptStations(apiKey: string): Promise<StationResponse[]> {
  const url = new URL(`${ODPT_BASE}/odpt:Station`);
  url.searchParams.set('acl:consumerKey', apiKey);
  url.searchParams.set('odpt:operator', 'odpt.Operator:TokyoMetro');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ODPT API エラー: ${res.status}`);
  }

  // ODPT API レスポンスの型（必要なフィールドのみ定義）
  const raw = await res.json() as Array<{
    '@id': string;
    'dc:title': string;
    'geo:lat': number;
    'geo:long': number;
    'odpt:railway': string;
  }>;

  // 路線IDから路線名を解決するため Railway を別途取得
  const railwayRes = await fetch(
    `${ODPT_BASE}/odpt:Railway?acl:consumerKey=${apiKey}&odpt:operator=odpt.Operator:TokyoMetro`
  );
  const railways = await railwayRes.json() as Array<{
    '@id': string;
    'dc:title': string;
    'odpt:ascendingRailDirection': string;
    'odpt:descendingRailDirection': string;
  }>;

  const railwayTitleMap = new Map(
    railways.map((r) => [r['@id'], r['dc:title']])
  );

  return raw.map((station) => ({
    stationId: station['@id'],
    stationTitle: station['dc:title'],
    lat: station['geo:lat'],
    lon: station['geo:long'],
    railwayId: station['odpt:railway'],
    railwayTitle: railwayTitleMap.get(station['odpt:railway']) ?? station['odpt:railway'],
  }));
}

/**
 * ODPT API から指定駅・路線・カレンダーの時刻表を取得して整形する。
 * 行先・種別・方面名を自然言語名に変換する。
 */
async function fetchOdptTimetable(
  apiKey: string,
  stationId: string,
  railwayId: string,
  calendar: string
): Promise<TimetableResponse> {
  // カレンダー区分を ODPT の ID 形式に変換
  const calendarId = calendar === 'Weekday'
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

  const timetables = await res.json() as Array<{
    'odpt:railDirection': string;
    'odpt:stationTimetableObject': Array<{
      'odpt:departureTime': string;
      'odpt:destinationStation'?: string;
      'odpt:trainType'?: string;
    }>;
  }>;

  // Railway 情報から方面名を取得
  const railwayRes = await fetch(
    `${ODPT_BASE}/odpt:Railway?acl:consumerKey=${apiKey}&@id=${railwayId}`
  );
  const railways = await railwayRes.json() as Array<{
    'odpt:ascendingRailDirection': string;
    'odpt:descendingRailDirection': string;
  }>;

  // 駅名辞書を構築（destinationStation の変換用）
  const stationsRes = await fetch(
    `${ODPT_BASE}/odpt:Station?acl:consumerKey=${apiKey}&odpt:railway=${railwayId}`
  );
  const stationsData = await stationsRes.json() as Array<{
    '@id': string;
    'dc:title': string;
  }>;
  const stationTitleMap = new Map(stationsData.map((s) => [s['@id'], s['dc:title']]));

  // 列車種別辞書
  const trainTypeRes = await fetch(
    `${ODPT_BASE}/odpt:TrainType?acl:consumerKey=${apiKey}&odpt:operator=odpt.Operator:TokyoMetro`
  );
  const trainTypes = await trainTypeRes.json() as Array<{
    '@id': string;
    'dc:title': string;
  }>;
  const trainTypeTitleMap = new Map(trainTypes.map((t) => [t['@id'], t['dc:title']]));

  // 上り・下りの方向IDを取得
  const ascendingId = railways[0]?.['odpt:ascendingRailDirection'] ?? '';
  const descendingId = railways[0]?.['odpt:descendingRailDirection'] ?? '';

  // 方面名辞書（RailDirection ID → 名称）を取得
  const directionRes = await fetch(
    `${ODPT_BASE}/odpt:RailDirection?acl:consumerKey=${apiKey}`
  );
  const directions = await directionRes.json() as Array<{
    '@id': string;
    'dc:title': string;
  }>;
  const directionTitleMap = new Map(directions.map((d) => [d['@id'], d['dc:title']]));

  // 上り・下り時刻表を分離
  const outboundRaw = timetables.find((t) => t['odpt:railDirection'] === ascendingId);
  const inboundRaw = timetables.find((t) => t['odpt:railDirection'] === descendingId);

  const toDepResponse = (
    items: typeof outboundRaw extends undefined ? never : NonNullable<typeof outboundRaw>['odpt:stationTimetableObject'],
    dirName: string
  ): DepartureResponse[] =>
    items.map((item) => ({
      time: item['odpt:departureTime'],
      destination: item['odpt:destinationStation'] !== undefined
        ? (stationTitleMap.get(item['odpt:destinationStation']) ?? item['odpt:destinationStation'])
        : '行先不明',
      trainType: item['odpt:trainType'] !== undefined
        ? (trainTypeTitleMap.get(item['odpt:trainType']) ?? item['odpt:trainType'])
        : '各停',
      railDirection: dirName,
    }));

  const outboundDirName = directionTitleMap.get(ascendingId) ?? '上り';
  const inboundDirName = directionTitleMap.get(descendingId) ?? '下り';

  return {
    stationId,
    railwayId,
    calendar,
    outbound: outboundRaw !== undefined ? toDepResponse(outboundRaw['odpt:stationTimetableObject'], outboundDirName) : [],
    inbound: inboundRaw !== undefined ? toDepResponse(inboundRaw['odpt:stationTimetableObject'], inboundDirName) : [],
    outboundDirectionName: outboundDirName,
    inboundDirectionName: inboundDirName,
  };
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
