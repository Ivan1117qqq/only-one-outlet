import type { TaskRecord } from './game.ts';

/** 回顧只陳述結案時的狀態，不把手機沒電等現象推論成唯一失敗原因。 */
export function recordDetail(record: TaskRecord): string {
  if (record.outcome === 'delivered') return '上傳完成';
  const phone = record.phoneOff ? '；當時手機已關機' : '';
  if (record.stage === 'pending') return `尚未接收${phone}`;
  if (record.stage === 'ready') return `處理完成，尚未開始上傳${phone}`;
  if (record.stage === 'uploading') return `上傳還剩 ${record.uploadRemaining.toFixed(1)} 秒${phone}`;
  return `電腦處理到 ${record.workPercent}%${phone}`;
}

export function reviewSummary(history: TaskRecord[]) {
  const missed = history.filter(record => record.outcome !== 'delivered');
  return {
    unreceived: missed.filter(record => record.stage === 'pending').length,
    processing: missed.filter(record => ['queued', 'processing'].includes(record.stage)).length,
    unsent: missed.filter(record => ['ready', 'uploading'].includes(record.stage)).length,
  };
}
