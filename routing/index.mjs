/** Public surface of the delivery routing module. */
export { planDay, evaluateRun, toGate5Handoff, isCommittedToDayBlockingJob } from './router.mjs';
export { DEFAULT_CONFIG, makeConfig } from './config.mjs';
export {
  DistanceProvider,
  StubHaversineDistanceProvider,
  haversineMiles,
  corridorProjection,
} from './geo.mjs';
export { formatPlan } from './report.mjs';
export {
  STICK_BUILD_TAG,
  WARNINGS,
  UNASSIGNED_REASONS,
  isStickBuild,
  resolveDailyCapacity,
  buildPassPlan,
  minutesToClock,
} from './model.mjs';
export * as sampleData from './sample-data.mjs';
