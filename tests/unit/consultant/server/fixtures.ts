import type { CallSummary } from "../../../../lib/consultant/types";

export const SAMPLE_SUMMARY: CallSummary = {
  summary: "Reached the practice manager. Interested in after-hours booking; wants a demo next week.",
  keyPoints: ["Misses calls after 5pm", "Two receptionists"],
  objections: [
    { objection: "Already have a receptionist", handled: true, quote: "we already have a receptionist", betterResponse: null },
    { objection: "Send an email", handled: false, quote: null, betterResponse: "Happy to — what would you need to see in it for this to be worth a look?" },
  ],
  nepqStages: [
    { stage: "situation", reached: true, note: "Asked about call volume" },
    { stage: "connection", reached: true, note: null },
    { stage: "consequence", reached: false, note: "Never asked what missed calls cost" },
  ],
  nextSteps: ["Send demo link"],
  recommendedStage: "discovery_booked",
  recommendedDisposition: "demo_booked",
  sentiment: "positive",
  coachingTips: ["Let the prospect state the cost of missed calls in their own words."],
  extracted: { email: null, website: "https://clinic.example", decisionMaker: "Practice manager", painPoints: ["After-hours calls go to voicemail"] },
};
