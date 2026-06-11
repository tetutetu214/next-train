# next-train 知見メモ (knowledge.md)

## 決定事項
- 2026-06-03: MVP対象は東京メトロ1社のみ（CC BY 4.0で確実）。技術はReact(Vite)+Cloudflare Workers。APIキーは並行申請しモックで先行実装。

## ODPT 調査メモ
- API: REST/JSON、`https://api.odpt.org/api/v4/`。全リクエストに `?acl:consumerKey=<キー>`。
- 鉄道リソース: `odpt:Station`(緯度経度 geo:lat/geo:long)、`odpt:Railway`(路線・駅順・上下方向)、`odpt:StationTimetable`(駅×方面×カレンダーの発車時刻)、`odpt:TrainInformation`(運行情報)。
- 基本ライセンス/CC BY 4.0 で常時提供される鉄道事業者: 東京メトロ / 都営 / 横浜市営 / つくばEX / ゆりかもめ / 多摩モノレール / りんかい線。
- JR東日本・東武・小田急は「チャレンジ2025限定ライセンス」。JR東は関東一部在来線のみ（新幹線除く）。チャレンジ2025は2026/2に表彰式終了 → 提供継続は要実機確認。
- StationTimetable は 駅×railDirection×Calendar(Weekday/SaturdayHoliday) でレコード分割。`stationTimetableObject` 配列に departureTime/destinationStation/trainType。
- railDirection は事業者により Inbound/Outbound（JR東）と「○○方面」（メトロ）の2系統。生ID表示はガイドライン禁止 → 自然言語名に変換。
- 承認は最大2営業日。レート制限の公式具体値は不明 → 起動時の駅一覧はキャッシュ前提。
- **リアルタイム系の提供状況（2026-06-10 夜に通常キーで実測）**: `odpt:TrainInformation`(運行情報) はメトロ全10路線分取得OK→遅延バナーは即実装可能。`odpt:Train`(在線情報・odpt:delay秒) は0件だった（深夜帯の影響かセンター提供対象外かは未確定、日中に再観測すること）。小田急は Railway 3件/Station 13件のマスタのみで時刻表・在線は0件（チャレンジ限定の裏取り）。

## 実データ接続の知見（2026-06-10 APIキー到着・実データ差し替え）
- **ODPT の ID は2系統ある（最重要バグ）**: `@id` は `urn:ucode:...` 形式の機械ID、`owl:sameAs` が `odpt.Station:TokyoMetro...` 形式の正規ID。リソース間の参照（`odpt:railway` / `odpt:destinationStation` / `odpt:railDirection` 等）とクエリフィルタ（`odpt:station=` 等）はすべて owl:sameAs 形式。`@id` をキーに辞書を組むと参照解決が全ミスし、路線名が生ID表示・時刻表が空になる。モックは正規ID形式で書かれていたため実データを繋ぐまで発見できなかった。
- **`odpt:destinationStation` は配列**（`string` ではなく `string[]`）。分割運転を想定した形。モックと旧型定義は文字列前提で誤り。
- **行先には他社直通駅が大量に含まれる**: 千代田線大手町の行先16種の大半が JR東（我孫子・取手等）・小田急（本厚木・箱根湯本等）。路線フィルタで作る駅名辞書では構造的に解決不可 → 時刻表から行先IDのユニーク集合を集め `odpt:Station?owl:sameAs=ID1,ID2,...`（カンマ区切り・他社駅も可）の1リクエストで辞書を作る方式に変更。
- **検証手順**: キーは `~/.secrets/next-train.env`、ローカルは `worker/.dev.vars`（gitignore済み）に置いて `wrangler dev` で実データ検証。キー有効性は curl の HTTP ステータスのみで確認（キー本体は画面に出さない）。
- 変換ロジックは fetch から純関数（`mapStations` / `mapTimetable` / `collectDestinationIds`）に切り出し、`@id` と `owl:sameAs` を意図的に食い違わせたフィクスチャでテスト（22件）。

## 運行情報バナーの設計判断（2026-06-11 Issue #4）
- **異常判定は `odpt:trainInformationStatus` の有無**: 平常時はフィールド自体が存在しない（2026-06-10 実測）。テキストの文字列マッチ（「平常」を含む等）ではなくフィールド欠落＝平常と判定する方が頑健。
- 全線共通レコード（`odpt:railway` なし）は路線突き合わせ不能のためバナー対象外。表示中の駅の路線に異常があるときだけ表示し、平常時は DOM 自体を描画しない。
- 運行情報の取得失敗は静かに非表示（主機能の時刻表表示を阻害しない）。判定は純関数 `filterActiveTrainInformation` に切り出してテスト。
- 注記は「遅延は反映しません」から「表示時刻は時刻表に基づく・遅延時の時刻補正なし（運行情報は参考表示）」へ実態に合わせて更新。
- 制約: 運行情報は駅検索時に1回取得するのみ（定期再取得なし）。リアルタイム性を上げるなら再取得間隔の設計が次の論点。

## レビュー知見（Codex実装をClaudeがレビュー 2026-06-03）
- **祝日判定バグ**: `japanese-holidays` の `isHoliday()` は非祝日に `undefined` を返す（`false`ではない）。Codexは `if (isHoliday !== false)` と書いたため平日が全部土休日扱いになっていた。正しくは truthy 判定 `if (holidayName)`。Codexが書いた「平日テスト」がこのバグを検出した（テストの価値の好例）。
- **フロントで require 禁止**: Vite/ESM環境に `require()` は無い。CommonJSライブラリは `import * as X from '...'` で読み、型定義が無ければ `src/types/*.d.ts` を自作する。
- **vite dev の API proxy**: client が叩く `/api` を Workers(wrangler dev: 8787) へ `server.proxy` で転送する設定が無いとローカルで動かない。

## デプロイ構成（2026-06-04）
- **Cloudflare Workers の Static Assets** 機能で、1つのWorkerが web/dist(画面)と /api(プロキシ)を両方配信。`wrangler.toml` の `[assets] directory="../web/dist" binding="ASSETS"`、`index.ts` は /api 以外を `env.ASSETS.fetch()` にフォールバック。
- 同一オリジンになるためCORS不要・client の `API_BASE='/api'` のまま本番でも動く。
- デプロイ: `worker/deploy.sh` 経由（web build→worker test→tsc→wrangler deploy を一括、直叩き禁止運用）。公開URL https://next-train-worker.lemoned-i-scream-art-of-noise.workers.dev
- `ODPT_API_KEY` は 2026-06-10 に secret 登録済み → 本番は実データ運用中。secret を削除して再deployするとモック表示に戻せる。
- ロールバック: `wrangler rollback` / ダッシュボードでWorker削除。Freeプラン(10万req/日)で自動課金なし。
- wrangler v3.x を使用中（v4へのupdate推奨警告が出るが現状動作する）。

## ハマりポイント / 注意
- Geolocation は HTTPS（secure context）必須。localhostは例外で許可。
- 複数事業者が乗り入れる駅は座標の重複・ズレあり。1km境界付近で取りこぼし/取りすぎが起きうる。
- 静的時刻表のため遅延・運休は反映しない（MVPは割り切る）。

## 学習済み概念
（理解度テストで全問正解した概念をここに日付つきで記録 → 次回スキップ判定に使う）

- 2026-06-03 **Cloudflare Workersプロキシの役割**: ブラウザとODPTの間に挟む目的はAPIキーの秘匿。キーはWorkers Secretに置き、ブラウザには出さずサーバー側でODPTを代行する。
- 2026-06-03 **Haversine式の役割**: 緯度経度2点から地表の距離を求める公式。用途は「現在地から1km以内の駅を絞る」空間計算のみ。発車時刻とは無関係（時刻はデータに入っている文字列を読むだけ、計算しない）。距離計算が狂うと近傍の絞り込み＝表示駅の顔ぶれが壊れる。
- 2026-06-03 **静的時刻表(StationTimetable)のトレードオフ**: 決まったダイヤを確実に取れるが、遅延・運休は反映されない。リアルタイム性が要るなら別途TrainInformation等が必要。
- 2026-06-10 **ODPT の ID 2系統（@id vs owl:sameAs）**: 参照・検索フィルタはすべて owl:sameAs 形式。@id で辞書を組むと解決が全ミスする。モックが正規ID形式だったため実データ接続まで潜伏したバグの構造も理解。
- 2026-06-10 **行先辞書の直接指定方式**: メトロ時刻表の行先は他社直通駅（JR・小田急等）を含むため、自路線の駅一覧では構造的に解決不可。行先IDのユニーク集合を owl:sameAs カンマ区切りで一括取得する。
- 2026-06-10 **生IDフォールバックの設計**: ODPTガイドラインで生ID表示は禁止。辞書ミス時の最後の砦として末尾セグメント表示（基本は辞書で日本語名解決）。
- 2026-06-10 **Workers secret とデプロイの関係**: `wrangler secret put` はキーを Cloudflare 側に暗号化保存して env 注入、deploy はコード/assets を反映。secret は deploy をまたいで永続。Free プランは10万req/日で超過しても自動課金なし、ODPT 側レート制限への配慮が必要。ロールバックは `wrangler rollback`、実データ経路停止は secret 削除+再deploy。
- 2026-06-04 **prefers-reduced-motion**: OS設定で「動き/アニメを減らす」をONにしているユーザーにだけCSSの動きを止めるアクセシビリティ機構。動きでめまい・頭痛を起こす人（前庭障害等）への健康配慮。ビルド速度・通信量・課金とは無関係。
