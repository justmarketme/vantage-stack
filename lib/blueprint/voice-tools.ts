// Layer 2/3 glue — Isabel's form-driving client tools.
//
// The ElevenLabs agent declares these client tools (see scripts/set-isabel-tools.ts);
// the frontend registers handlers in startSession({ clientTools }). To keep the
// voice layer decoupled from the form machine, each handler just dispatches a
// `blueprint:tool` CustomEvent. The guided deck (GuidedBlueprint) listens and
// drives its XState machine. On non-blueprint pages nobody listens → harmless.
//
// Tool NAMES are case-sensitive and must match the agent's tool definitions.

export const BLUEPRINT_TOOL_EVENT = "blueprint:tool";

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

/** Client-tool handlers to register in startSession({ clientTools }). */
export function createBlueprintClientTools() {
  return {
    highlightBlueprintField: async ({ fieldId }: { fieldId: string }) => {
      emit({ tool: "highlight", fieldId });
      return "highlighted";
    },
    setBlueprintField: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      emit({ tool: "set", fieldId, value });
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
    controlBlueprintMusic: async ({ action }: { action: string }) => {
      const a = action === "stop" ? "stop" : "play";
      emit({ tool: "music", action: a });
      return a === "stop" ? "music stopped" : "music playing";
    },
  };
}

/** Tool definitions for the agent (POST /v1/convai/tools). Names must match the
 *  handler keys above exactly. */
export const BLUEPRINT_TOOL_DEFINITIONS = [
  {
    name: "highlightBlueprintField",
    description:
      "Visually highlight a field on the blueprint form to draw the user's attention to it as you ask about it. Call this just before asking about a field.",
    parameters: {
      fieldId: { type: "string", description: "The field key, e.g. clientName, email, whatsapp, industry, primaryIntent." },
    },
    required: ["fieldId"],
  },
  {
    name: "setBlueprintField",
    description:
      "Fill in a field on the blueprint form with the user's answer once they have given it. Use the exact field key and the user's value.",
    parameters: {
      fieldId: { type: "string", description: "The field key to fill." },
      value: { type: "string", description: "The value to set, in the user's words." },
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
    description: "Move back to the previous step of the blueprint form if the user wants to change an earlier answer.",
    parameters: {},
    required: [],
  },
  {
    name: "submitBlueprint",
    description: "Submit the completed blueprint form on the final step once all required answers are captured.",
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
    description:
      "Show the POPIA WhatsApp-contact consent prompt so the user can explicitly agree before you continue with them on WhatsApp.",
    parameters: {},
    required: [],
  },
  {
    name: "controlBlueprintMusic",
    description:
      "Play or stop the background music on the blueprint page, and briefly highlight the music button so the user sees it. Use when you mention the music, or whenever the user asks you to stop it or play it again.",
    parameters: {
      action: { type: "string", description: "Either 'play' to start the music or 'stop' to stop it." },
    },
    required: ["action"],
  },
] as const;
