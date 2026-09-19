/** 時間以秒計；電量以百分比計。處理量為正常效率下的秒數。 */
export const ENCORE = {
  duration: 100, callSeconds: 4, callDrain: 2, extension: 12,
  briefWorkRatio: 0.45, briefRewardRatio: 0.65,
  arrivals: [1, 19, 35, 46, 64, 76],
} as const;
export const CONFIG = {
  duration: 180,
  maxTasks: 3,
  missedPenalty: 40,
  initialTemperature: 27,
  minTemperature: 22,
  maxTemperature: 44,
  workingHeatPerSecond: 0.3,
  idleHeatPerSecond: 0.08,
  coolPerSecond: 1.4,
  efficientTemperature: 28,
  efficiencyLossPerDegree: 0.065,
  minEfficiency: 0.35,
  heatWarning: 33,
  initialBattery: 32,
  drainPerSecond: 0.32,
  uploadDrainPerSecond: 2.5,
  chargePerSecond: 9,
  lowBattery: 12,
  deadlineWarning: 10,
  deadlineCritical: 5,
  noticeDuration: 5,
  importance: { important: 100, critical: 150 },
  slackWarning: 5,
  simulationStep: 1 / 60,
  generator: {
    firstArrival: 1,
    secondArrival: 24,
    thirdArrival: 40,
    lateStage: 100,
    middleInterval: [11, 17],
    lateInterval: [9, 14],
    capacityRetry: 2,
    urgentChance: 0.24,
    finishBuffer: 6,
  },
} as const;

export interface TaskTemplate {
  name: string; work: number; deadline: number; upload: number; reward: number; urgent: boolean;
}
export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { name: '修改簡報', work: 8, deadline: 28, upload: 3, reward: 80, urgent: false },
  { name: '整理報表', work: 18, deadline: 47, upload: 4, reward: 150, urgent: false },
  { name: '校對文案', work: 6, deadline: 24, upload: 3, reward: 60, urgent: false },
  { name: '調整活動版面', work: 12, deadline: 37, upload: 3.5, reward: 110, urgent: false },
  { name: '緊急交付檔案', work: 12, deadline: 23, upload: 3, reward: 180, urgent: true },
];
