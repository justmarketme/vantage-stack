import type { Sql } from "postgres";
import type { Lead } from "../../types";
import { leadMessagingConsent } from "../emma/consent";
import { logError } from "../http";
import { getDeal } from "../repo/deals";
import { scoreLead } from "./features";

/**
 * Wave-2 additions to a single-lead read (`GET leads/[id]`): the explainable score, the Clinics
 * deal and the messaging-consent state. Additive and fail-soft: if any of these reads fails the
 * lead is still returned without them (logged by tag only) — the workspace must always open.
 */
export async function attachLeadInsights(db: Sql, lead: Lead): Promise<Lead> {
  try {
    const [score, deal, consent] = await Promise.all([scoreLead(db, lead.id), getDeal(db, lead.id), leadMessagingConsent(db, lead.id)]);
    return { ...lead, ...(score ? { score } : {}), deal, messagingConsent: consent };
  } catch (e) {
    logError("leads.insights", e);
    return lead;
  }
}
