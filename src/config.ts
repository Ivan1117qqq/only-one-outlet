/** 時間單位為秒；進度與電量為百分比。難度調整集中於此。 */
export const CONFIG = {
  duration: 180,
  workPerSecond: 1.05,
  initialTemperature: 27,
  minTemperature: 22,
  maxTemperature: 44,
  heatPerSecond: 0.23,
  coolPerSecond: 0.95,
  efficientTemperature: 28,
  efficiencyLossPerDegree: 0.055,
  minEfficiency: 0.2,
  initialBattery: 24,
  drainPerSecond: 0.65,
  chargePerSecond: 6,
  dataMilestones: [30, 60],
  simulationStep: 1 / 60,
} as const;
