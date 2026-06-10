# next-train TODO (todo.md)

## 進行中 / 次にやること
- [x] てつてつ: ODPT APIキーを申請（developer.odpt.org、最大2営業日）→ `~/.secrets/next-train.env` に保存（2026-06-10 到着）
- [x] plan.md をてつてつと合意
- [x] spec.md を詳細化して合意
- [x] 理解度テスト（Workers/Haversine/静的時刻表）全問クリア
- [ ] Vite + React 骨格 → モックで一連の流れを実装

## 段階1: MVP（東京メトロのみ）
- [x] Vite + React プロジェクト初期化
- [x] Cloudflare Workers プロキシ雛形（モックデータ応答）
- [x] Geolocation取得 + Haversine距離計算
- [x] 駅一覧取得・1km絞り込み
- [x] StationTimetable方面別取得 → 次発抽出
- [x] カレンダー区分・祝日判定（祝日バグ修正済み）
- [x] railDirection 自然言語変換（Worker側で変換）
- [x] 1画面UI
- [x] 単体テスト（距離計算・次発抽出・カレンダー判定）20件パス
- [x] 型チェック（web/worker とも tsc 通過）
- [x] vite dev の /api proxy 設定
- [x] ローカル動作確認（wrangler dev + vite dev でモック表示）
- [x] 発車標風ダークLEDデザイン（PR #1 マージ済み）
- [x] デプロイ（Cloudflare Workers + Static Assets、1Workerで画面+API配信）
  - 公開URL: https://next-train-worker.lemoned-i-scream-art-of-noise.workers.dev
- [x] 実データ接続バグ修正（owl:sameAs 統一・destinationStation 配列対応、PR提出）
- [ ] PRマージ後、本番反映（`wrangler secret put ODPT_API_KEY` → 再deploy）
- [ ] PWA化（Service Worker + Manifest）

## 段階2: カバレッジ拡張（MVP安定後）
- [ ] 基本ライセンス各社追加
- [ ] JR東のデータ提供継続を実機確認 → 学習用途で追加検討

## 完了
- [x] 技術調査（事業者範囲・ライセンス・実装要素）
- [x] 方針決定（メトロ1社 / React+Vite+Workers / キー並行申請）
- [x] docs骨格作成
- [x] Codex実装 → Claudeレビュー（祝日/require/proxyの3バグ修正）
- [x] モックでローカルAPI動作確認（curl 200 OK）
- [x] GitHub public リポジトリ作成・main push・Secret Scanning有効化
  - https://github.com/tetutetu214/next-train
