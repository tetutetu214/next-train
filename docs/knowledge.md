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

## レビュー知見（Codex実装をClaudeがレビュー 2026-06-03）
- **祝日判定バグ**: `japanese-holidays` の `isHoliday()` は非祝日に `undefined` を返す（`false`ではない）。Codexは `if (isHoliday !== false)` と書いたため平日が全部土休日扱いになっていた。正しくは truthy 判定 `if (holidayName)`。Codexが書いた「平日テスト」がこのバグを検出した（テストの価値の好例）。
- **フロントで require 禁止**: Vite/ESM環境に `require()` は無い。CommonJSライブラリは `import * as X from '...'` で読み、型定義が無ければ `src/types/*.d.ts` を自作する。
- **vite dev の API proxy**: client が叩く `/api` を Workers(wrangler dev: 8787) へ `server.proxy` で転送する設定が無いとローカルで動かない。

## デプロイ構成（2026-06-04）
- **Cloudflare Workers の Static Assets** 機能で、1つのWorkerが web/dist(画面)と /api(プロキシ)を両方配信。`wrangler.toml` の `[assets] directory="../web/dist" binding="ASSETS"`、`index.ts` は /api 以外を `env.ASSETS.fetch()` にフォールバック。
- 同一オリジンになるためCORS不要・client の `API_BASE='/api'` のまま本番でも動く。
- デプロイ: `worker/` で `wrangler deploy`。公開URL https://next-train-worker.lemoned-i-scream-art-of-noise.workers.dev
- `ODPT_API_KEY` は secret 未設定 → 本番もモック。キー到着後 `wrangler secret put ODPT_API_KEY` して再deployで実データ化。
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
- 2026-06-04 **prefers-reduced-motion**: OS設定で「動き/アニメを減らす」をONにしているユーザーにだけCSSの動きを止めるアクセシビリティ機構。動きでめまい・頭痛を起こす人（前庭障害等）への健康配慮。ビルド速度・通信量・課金とは無関係。
