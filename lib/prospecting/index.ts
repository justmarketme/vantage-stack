export { connectProspectingDb, ensureProspectingSchema } from "./db";
export {
  createProspect,
  getProspect,
  listProspects,
  updateProspect,
  updateProspectStage,
  createEngagement,
  updateEngagementStatus,
  listEngagements,
  getPendingApprovals,
  startRun,
  finishRun,
  getLatestRun,
  listChannels,
  upsertChannel,
  markChannelScanned,
  detectIntentSignals,
  routeLandingPage,
  getDailyStats,
} from "./service";
export { researchProspect, scoreConfidence, assessCompetitorRisk } from "./research";
export { draftReply, draftFollowUp } from "./drafter";
export {
  sendHotLeadAlert,
  sendApprovalRequest,
  sendCycleDigest,
  sendDailyBrief,
} from "./teams";
export type {
  Track,
  ConfidenceFlag,
  ProspectStage,
  Prospect,
  ProspectEngagement,
  ProspectingRun,
  ProspectingChannel,
  EngagementStatus,
} from "./types";
