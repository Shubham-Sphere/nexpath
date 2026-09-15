export type AdvisoryFrequencyLevel =
  | 'off'
  | 'major_only'
  | 'once_per_session'
  | 'every_event'
  | 'optimum';

export interface FrequencyLevelConfig {
  minPromptsBeforeAdvisory: number;
  postAdvisoryCooldown: number;
  sessionAdvisoryCapDefault: number;
  sessionAdvisoryCapVibe: number;
  stage2MinConfidence: number;
  stage2ContextWindow: number;
  stage2S1LowConfidence: number;
  signalAbsenceThresholdMultiplier: number;
  minStageChangeConfidence: number;
  signalAbsenceMinFloor: number;
  /**
   * Charge the session budget when a popup is SHOWN rather than when an advisory FIRES.
   *
   * `false` keeps the historical behaviour exactly: the dedup gate reads `firedDecisionSessions` and
   * the session cap reads `advisoryCount`, both written the moment an advisory fires — even when the
   * popup behind it is never displayed. `true` makes both gates read the shown-popup state instead,
   * so an advisory whose popup was discarded costs nothing, and the auto pipeline skips preparing a
   * popup while the popup cooldown makes it undisplayable anyway.
   */
  countBudgetOnShow: boolean;
}

export const OPTIMUM_LEVEL_CONFIG: Readonly<FrequencyLevelConfig> = {
  minPromptsBeforeAdvisory:          1,
  postAdvisoryCooldown:              2,
  sessionAdvisoryCapDefault:        20,
  sessionAdvisoryCapVibe:           30,
  stage2MinConfidence:            0.40,
  stage2ContextWindow:               5,
  stage2S1LowConfidence:          0.25,
  signalAbsenceThresholdMultiplier: 0.25,
  minStageChangeConfidence:         0.50,
  signalAbsenceMinFloor:             2,
  countBudgetOnShow:              true,
};

export const FREQUENCY_LEVEL_CONFIGS: Record<AdvisoryFrequencyLevel, FrequencyLevelConfig> = {
  off: {
    minPromptsBeforeAdvisory:          999,
    postAdvisoryCooldown:              999,
    sessionAdvisoryCapDefault:           0,
    sessionAdvisoryCapVibe:              0,
    stage2MinConfidence:               1.0,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:             1.0,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  major_only: {
    minPromptsBeforeAdvisory:            5,
    postAdvisoryCooldown:               10,
    sessionAdvisoryCapDefault:           3,
    sessionAdvisoryCapVibe:              5,
    stage2MinConfidence:              0.49,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.50,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  once_per_session: {
    minPromptsBeforeAdvisory:           10,
    postAdvisoryCooldown:              999,
    sessionAdvisoryCapDefault:           1,
    sessionAdvisoryCapVibe:              1,
    stage2MinConfidence:              0.55,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.55,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  every_event: {
    minPromptsBeforeAdvisory:            3,
    postAdvisoryCooldown:                5,
    sessionAdvisoryCapDefault:           5,
    sessionAdvisoryCapVibe:             10,
    stage2MinConfidence:              0.49,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.50,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  optimum: OPTIMUM_LEVEL_CONFIG,
};

export function resolveFrequencyConfig(level: AdvisoryFrequencyLevel): FrequencyLevelConfig {
  return FREQUENCY_LEVEL_CONFIGS[level];
}
