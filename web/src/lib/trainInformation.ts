// ===== 運行情報バナーの表示判定ユーティリティ =====
import type { Station, TrainInformation } from '../types';

/**
 * 表示中の駅が属する路線のうち、異常（statusLabel が non-null）が
 * 起きている運行情報レコードだけを抽出する。
 *
 * バナー表示判定の中核ロジック。返り値が空配列ならバナーは出さない。
 * 判定方針:
 * - 表示駅の railwayId 集合に属する運行情報だけを対象にする
 *   （現在地と無関係な路線の遅延でバナーを出さない）
 * - statusLabel が null（平常）のレコードは除外する
 * - railwayId が null の全線共通レコードは、表示駅の路線と
 *   突き合わせられないため対象外（このアプリは路線単位で出す）
 * - 同一路線に複数の異常レコードがあれば全件返す（複数行表示用）
 *
 * @param trainInfos 運行情報レコード一覧（Workers から取得した整形済みの形）
 * @param stations   現在表示中の駅一覧
 * @returns 表示すべき異常レコード一覧（バナーに出す順は入力順を保持）
 */
export function filterActiveTrainInformation(
  trainInfos: TrainInformation[],
  stations: Station[]
): TrainInformation[] {
  // 表示中の駅が属する路線IDの集合
  const visibleRailwayIds = new Set(stations.map((s) => s.railwayId));

  return trainInfos.filter((info) => {
    // 平常（statusLabel が null）はバナー対象外
    if (info.statusLabel === null) {
      return false;
    }
    // 路線参照が無い全線共通レコードは路線突き合わせ不可のため対象外
    if (info.railwayId === null) {
      return false;
    }
    // 表示中の駅の路線に該当する異常だけを残す
    return visibleRailwayIds.has(info.railwayId);
  });
}
