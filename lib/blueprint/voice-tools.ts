// Layer 2/3 glue — Isabel's form-driving client tools.
//
// The ElevenLabs agent declares these client tools (pushed by
// scripts/set-isabel-tools.ts); the frontend registers handlers in
// startSession({ clientTools }). Each handler just dispatches a `blueprint:tool`
// CustomEvent — GuidedBlueprint listens and drives its XState machine. On
// non-blueprint pages nobody listens → harmless.
//
// RELIABILITY: every CHOICE field gets its OWN tool whose `value` is an ENUM of
// that field's real option values (derived from the form schema — single source
// of truth). The model is therefore grammar-constrained to a real option and
// can't invent a value or target the wrong field. Free-text fields use the
// generic setBlueprintField. Dependent sub-niches use getSubNiches → set_subNiche.
//
// Tool NAMES are case-sensitive and must match the agent's tool definitions.

import { quickFormSchema, type FieldDef, type OptionDef } from "./form-schema";
import { getIndustryData } from "../crm/industry-data";

export const BLUEPRINT_TOOL_EVENT = "blueprint:tool";
// Reverse channel: the UI tells Isabel what the USER did directly (clicked a
// card, typed a name, moved a step) so she stays aware — acknowledges it, doesn't
// re-ask, and notices anything they skipped. IsabelWidget forwards the text to
// the agent via the SDK's sendContextualUpdate (non-interrupting).
export const BLUEPRINT_USER_ACTION_EVENT = "blueprint:user-action";

export type BlueprintToolDetail =
  | { tool: "highlight"; fieldId: string }
  | { tool: "set"; fieldId: string; value: string }
  | { tool: "advance" }
  | { tool: "previous" }
  | { tool: "submit" }
  | { tool: "openCalendar" }
  | { tool: "showConsent" }
  | { tool: "music"; action: "play" | "stop" };

function emit(detail: BlueprintToolDetail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<BlueprintToolDetail>(BLUEPRINT_TOOL_EVENT, { detail }));
  }
}

const optValue = (o: OptionDef): string => (typeof o === "string" ? o : o.value);

/** Distinct choice fields (select/cards/multi) that carry a STATIC option list. */
function staticChoiceFields(): FieldDef[] {
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const step of quickFormSchema.steps) {
    for (const f of step.fields) {
      if (seen.has(f.key)) continue;
      const isChoice = f.kind === "select" || f.kind === "cards" || f.kind === "multi";
      if (isChoice && f.options && f.options.length > 0) {
        seen.add(f.key);
        out.push(f);
      }
    }
  }
  return out;
}

/** Tool name for a field, e.g. industry → set_industry. */
const toolNameFor = (key: string): string => `set_${key}`;

export interface BlueprintToolParam {
  type: string;
  description: string;
  enum?: string[];
}
export interface BlueprintToolDef {
  name: string;
  description: string;
  parameters: Record<string, BlueprintToolParam>;
  required: string[];
  /** getSubNiches needs the agent to wait for the returned list. */
  expectsResponse?: boolean;
}

/** Client-tool handlers to register in startSession({ clientTools }). */
export function createBlueprintClientTools() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    highlightBlueprintField: async ({ fieldId }) => {
      emit({ tool: "highlight", fieldId: String(fieldId ?? "") });
      return "highlighted";
    },
    // Free-text fields only (name, email, WhatsApp, custom industry description).
    setBlueprintField: async ({ fieldId, value }) => {
      emit({ tool: "set", fieldId: String(fieldId ?? ""), value: String(value ?? "") });
      return "set";
    },
    advanceBlueprintStep: async () => {
      emit({ tool: "advance" });
      return "advanced";
    },
    goBackBlueprintStep: async () => {
      emit({ tool: "previous" });
      return "went back";
    },
    submitBlueprint: async () => {
      emit({ tool: "submit" });
      return "submitted";
    },
    openBookingCalendar: async () => {
      emit({ tool: "openCalendar" });
      return "calendar opened";
    },
    showWhatsAppConsent: async () => {
      emit({ tool: "showConsent" });
      return "consent shown";
    },
    controlBlueprintMusic: async ({ action }) => {
      const a = action === "stop" ? "stop" : "play";
      emit({ tool: "music", action: a });
      return a === "stop" ? "music stopped" : "music playing";
    },
    // Dependent sub-niche: fetch the valid list for the chosen industry, then set.
    getSubNiches: async ({ industry }) => {
      const subs = getIndustryData(String(industry ?? "")).subNiches;
      return subs.length ? subs.join(", ") : "This industry has no sub-niches — skip the sub-niche question.";
    },
    set_subNiche: async ({ value }) => {
      emit({ tool: "set", fieldId: "subNiche", value: String(value ?? "") });
      return "set";
    },
  };
  // One enum-constrained tool per static choice field.
  for (const f of staticChoiceFields()) {
    handlers[toolNameFor(f.key)] = async ({ value }) => {
      emit({ tool: "set", fieldId: f.key, value: String(value ?? "") });
      return "set";
    };
  }
  return handlers;
}

// ── Tool definitions pushed to the agent ─────────────────────────────────────

const ACTION_TOOL_DEFS: BlueprintToolDef[] = [
  {
    name: "highlightBlueprintField",
    description:
      "Visually highlight a field on the blueprint form to draw the user's attention to it. Call this JUST BEFORE you ask about a field, using the field key (e.g. clientName, industry, email).",
    parameters: { fieldId: { type: "string", description: "The field key to highlight." } },
    required: ["fieldId"],
  },
  {
    name: "setBlueprintField",
    description:
      "Fill a FREE-TEXT field (clientName, email, whatsapp, industryCustomDescription, websiteUrl, primarySocialHandle, preferredContactTime) with the user's answer. For multiple-choice fields, use the matching set_<field> tool instead.",
    parameters: {
      fieldId: { type: "string", description: "The free-text field key to fill." },
      value: { type: "string", description: "The value, in the user's words." },
    },
    required: ["fieldId", "value"],
  },
  {
    name: "advanceBlueprintStep",
    description: "Move the blueprint form forward to the next step once the current step's answers are captured.",
    parameters: {},
    required: [],
  },
  {
    name: "goBackBlueprintStep",
    description: "Move back to the previous step if the user wants to change an earlier answer.",
    parameters: {},
    required: [],
  },
  {
    name: "submitBlueprint",
    description: "Submit the completed blueprint on the final step once all required answers are captured and consent is given.",
    parameters: {},
    required: [],
  },
  {
    name: "openBookingCalendar",
    description: "Open the booking calendar so the user can book their free 30-minute strategy call.",
    parameters: {},
    required: [],
  },
  {
    name: "showWhatsAppConsent",
    description: "Show the POPIA WhatsApp-contact consent tick so the user can explicitly agree before you continue on WhatsApp.",
    parameters: {},
    required: [],
  },
  {
    name: "controlBlueprintMusic",
    description:
      "Play or stop the background music, and briefly highlight the music button. Use when you say you're putting music on, or whenever the user asks you to stop or play it.",
    parameters: { action: { type: "string", description: "'play' to start the music or 'stop' to stop it.", enum: ["play", "stop"] } },
    required: ["action"],
  },
];

const SUBNICHE_TOOL_DEFS: BlueprintToolDef[] = [
  {
    name: "getSubNiches",
    description:
      "Get the list of sub-niche options for the chosen industry so you can read them out and pick the right one. Call this right after setting the industry, BEFORE set_subNiche.",
    parameters: { industry: { type: "string", description: "The industry the user chose." } },
    required: ["industry"],
    expectsResponse: true,
  },
  {
    name: "set_subNiche",
    description: "Set the sub-niche on the form — use one of the exact options returned by getSubNiches.",
    parameters: { value: { type: "string", description: "The chosen sub-niche." } },
    required: ["value"],
  },
];

/** One enum-constrained tool per static choice field, generated from the schema. */
function fieldToolDefs(): BlueprintToolDef[] {
  return staticChoiceFields().map((f) => ({
    name: toolNameFor(f.key),
    description: `Set "${f.label}" on the blueprint form to the user's choice.${
      f.kind === "multi" ? " This is multi-select — call once per option the user picks." : ""
    }`,
    parameters: {
      value: {
        type: "string",
        description: `The chosen option for "${f.label}". Must be one of the listed values.`,
        enum: (f.options ?? []).map(optValue),
      },
    },
    required: ["value"],
  }));
}

export const BLUEPRINT_TOOL_DEFINITIONS: BlueprintToolDef[] = [
  ...ACTION_TOOL_DEFS,
  ...fieldToolDefs(),
  ...SUBNICHE_TOOL_DEFS,
];
