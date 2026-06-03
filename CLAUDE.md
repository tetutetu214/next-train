# next-train プロジェクト設定 (CLAUDE.md)

## 概要
現在地から半径1km以内の駅の「次発時刻」を上り・下り両方向で表示するWebアプリ。データ元はODPT（公共交通オープンデータセンター）の無料API。

## 技術スタック
- フロント: React + Vite（PWA化）
- 距離計算: ブラウザ Geolocation API + Haversine式
- APIキー秘匿: Cloudflare Workers プロキシ（キーはWorkers Secret）
- データ元: ODPT API v4（`https://api.odpt.org/api/v4/`）
- 言語: TypeScript（型ヒント必須・any禁止）

## MVPスコープ
- 東京メトロ1社のみ（CC BY 4.0で常時提供・商用可）。
- 段階2で基本ライセンス各社、JR東（チャレンジ限定）は実機確認後に検討。

## シークレット
- ODPT APIキー: `~/.secrets/next-train.env` の `ODPT_API_KEY`。リポジトリ内は `.env.example` のみ。
- キーは画面に出さない（マスク・存在確認まで）。

## ライセンス表記義務
- アプリにデータ出典クレジット（CC BY 4.0 / 東京メトロ）を表示する。
- 「時刻表データであり遅延・運休は反映しない」旨を明示する。
- railDirection の生IDは表示せず自然言語名に変換（ODPTガイドライン）。

## デプロイ
- Cloudflare（Workers + Pages想定）。具体手順は実装時に確定し、専用スクリプト化する（wrangler直叩きは避ける運用）。

## docs/
- plan.md: 計画・アーキテクチャ
- spec.md: 画面・API・整形仕様
- todo.md: タスク管理
- knowledge.md: 知見・決定事項・学習済み概念
