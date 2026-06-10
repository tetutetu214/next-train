#!/usr/bin/env bash
# next-train 本番デプロイスクリプト
# web ビルド → worker テスト → 型チェック → wrangler deploy を一括実行する。
# wrangler deploy の直叩きは避け、必ずこのスクリプト経由でデプロイする運用。
#
# 前提:
# - ODPT_API_KEY は事前に `wrangler secret put ODPT_API_KEY` で登録済みであること
#   （キー未登録だと本番がモック表示になる）
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 1/4 web ビルド (../web/dist を最新化)"
(cd ../web && npm run build)

echo "==> 2/4 worker 単体テスト"
npx vitest run

echo "==> 3/4 worker 型チェック"
npx tsc --noEmit

echo "==> 4/4 wrangler deploy"
npx wrangler deploy

echo "==> デプロイ完了。動作確認: https://next-train-worker.lemoned-i-scream-art-of-noise.workers.dev"
