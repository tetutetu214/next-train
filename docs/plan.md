# next-train 計画書 (plan.md)

## このアプリは何か

スマホやPCのブラウザで開くと、**現在地から半径1km以内にある駅の「次の発車時刻（次発）」を上り・下り両方向で表示する**Webアプリ。位置情報の許可だけで使え、アプリのインストールは不要（PWA化すればホーム画面追加も可能）。

データ元は公共交通オープンデータセンター（ODPT）の無料API。MVPでは**東京メトロ1社**に絞り、距離計算→次発抽出の一連の流れを最短で通すことを最優先する。動いてから事業者を増やす（観測駆動）。

## なぜこの構成か（技術選定の根拠）

### データ元: ODPT API v4
- 東京メトロは「公共交通オープンデータ基本ライセンス / CC BY 4.0」で**常時・商用可**。ライセンスが明快で、MVPの足場として最も安全。
- 駅の緯度経度（`odpt:Station` の `geo:lat` / `geo:long`）と駅時刻表（`odpt:StationTimetable`）が**同一ID体系**で結合でき、実装が単純になる。
- 代替案: 駅すぱあとAPI無料枠は「ダイヤ探索不可」で次発が取れない。NAVITIMEは法人向け。→ 無料で次発を出すならODPT一択。

### フロント: React (Vite) + PWA
- てつてつの希望。将来UIを育てる前提ならコンポーネント設計が効く。
- Viteは開発サーバが速く、ビルドが軽い。
- PWA（Service Worker + Manifest）で時刻表など静的データをキャッシュし、APIリクエストを削減（ODPT規約上もキャッシュ利用は許容）。

### APIキー秘匿: Cloudflare Workers プロキシ
- ブラウザ直叩きだとAPIキーが露出する。Workers（無料枠）にプロキシを置き、キーはWorkersのSecretに保存してブラウザへ出さない。
- CORS問題の保険にもなる（ブラウザ→Workers→ODPT）。
- 代替案: Vercel Functions でも可。trip-roadでCloudflareの運用実績があるためWorkersを採用。

### 距離計算: ブラウザGeolocation + Haversine式
- `navigator.geolocation.getCurrentPosition()` で現在地取得（HTTPS必須・ユーザー許可必須）。
- Haversine式で各駅との距離を算出し1km以内を抽出。数km範囲なら地球を球とみなす近似で精度は十分。

## アーキテクチャ（データフロー）

```
[ブラウザ React/PWA]
   │ 1. Geolocationで現在地(lat,lng)取得
   │ 2. 起動時に取得済みの駅一覧(キャッシュ)からHaversineで1km以内を絞り込み
   │ 3. 近傍駅の時刻表を要求
   ▼
[Cloudflare Workers プロキシ]  ← APIキーをSecretで保持
   │ 4. ODPT API v4 へ acl:consumerKey 付きで問い合わせ
   ▼
[ODPT API v4  api.odpt.org]
   - odpt:Station        … 駅の緯度経度（起動時に東京メトロ全駅を取得しキャッシュ）
   - odpt:StationTimetable … 駅×方面×カレンダー区分の発車時刻
   - odpt:Railway        … 上り/下り方面IDの対応、駅順
```

### 次発の算出ロジック
1. 現在地から1km以内の駅を特定。
2. 各駅について `odpt:StationTimetable` を方面（`odpt:railDirection`）別に取得。
3. 当日のカレンダー区分（平日 `Weekday` / 土休日 `SaturdayHoliday`）を判定。祝日は内閣府 syukujitsu.csv 等で別途判定。
4. その区分の発車時刻リストから、**現在時刻以降で最も早い `odpt:departureTime`** を上り・下りそれぞれ抽出。
5. `odpt:railDirection` のIDは生表示せず、`odpt:Railway` の `ascending/descendingRailDirection` 対応から自然言語名（例「渋谷方面」）に変換して表示（ODPTガイドライン要件）。

※ これは静的時刻表ベースで遅延・運休は反映しない。MVPでは割り切る。必要になったら `odpt:TrainInformation` を後付け。

## スコープ

### MVP（段階1）
- 東京メトロのみ。
- 現在地→1km以内の駅→上り下り次発を表示する1画面。
- カレンダー区分・祝日判定あり。
- Workers経由でキー秘匿。
- APIキー承認待ちの間は**モックデータ**で骨格を実装。

### 段階2（カバレッジ拡張、MVP安定後）
- 基本ライセンス各社を追加（都営/横浜市営/つくばEX/ゆりかもめ/多摩モノレール/りんかい線）。
- JR東日本（チャレンジ限定ライセンス）は、**APIが現在もデータを返すか実機確認してから**、学習用途の範囲で追加検討。商用恒常運用には組み込まない。

### やらないこと（MVP時点）
- 遅延・リアルタイム反映、経路検索、全国カバレッジ、地図表示。

## 未確定・要確認事項
- ODPTのレート制限の具体値は公式に明記なし → 実機で確認。起動時の駅一覧はキャッシュして毎回叩かない設計にする。
- JR東のチャレンジ限定データが2026年6月時点で提供継続中か（チャレンジ2025は2026/2に表彰式終了）→ 段階2で実機確認。
- Cloudflareアカウントの有無（Workersデプロイに必要）。

## 進め方
1. （並行）てつてつがODPT APIキーを申請。
2. plan/specをてつてつと合意。
3. 承認待ちの間、Vite+React骨格とWorkersプロキシ雛形をモックデータで実装。
4. キー到着後、実データへ差し替え・動作確認。
5. テスト・PWA化・デプロイ。
