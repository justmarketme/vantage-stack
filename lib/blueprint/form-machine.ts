// Layer 1 — the deterministic Form State Engine (XState v5).
//
// Knows the schema, validation, and slide progression. Knows NOTHING about
// voice or the DOM. It emits four semantic events that the orchestration glue
// (Layer 3) subscribes to:
//   • fieldHighlighted  — the active field of the current step changed
//   • slideAdvanced     — moved to a new step (next | prev)
//   • validationFailed  — a NEXT/SUBMIT was blocked by invalid fields
//   • formCompleted     — the last step validated; submission is starting
//
// The machine is schema-driven, so the SAME engine powers both the quick form
// (3-step branching) and the detailed form (4 fixed steps) — step count lives
// in context (`stepIndex`), not in hardcoded states.

import { setup, assign, emit, fromPromise, and, not } from "xstate";
import { BlueprintSubmitSchema } from "./schema";
import {
  type FormSchema,
  type FormData,
  type FormValue,
  validateStepData,
  firstVisibleField,
} from "./form-schema";

export type SubmitResult = {
  ok: boolean;
  clientId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Network submit. Injected so tests can stub it; defaults to the real API. */
export type SubmitFn = (payload: Record<string, unknown>) => Promise<SubmitResult>;

export interface FormMachineDeps {
  submit?: SubmitFn;
}

// Note: the schema itself is NOT stored in context — it holds closures
// (validate/buildPayload) that don't serialize. The machine closes over the
// schema instead, so `context` stays fully JSON-serializable for persistence.
export interface FormContext {
  stepIndex: number;
  data: FormData;
  errors: Record<string, string>;
  submitError: string | null;
  result: { clientId: string } | null;
}

export type FormMachineEvent =
  | { type: "START" }
  | { type: "SET_FIELD"; key: string; value: FormValue }
  | { type: "TOGGLE_MULTI"; key: string; value: string; maxItems?: number }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SUBMIT" };

export type FormEmitted =
  | { type: "fieldHighlighted"; field: string; stepId: string; stepIndex: number }
  | { type: "slideAdvanced"; stepIndex: number; stepId: string; direction: "next" | "prev" }
  | { type: "validationFailed"; errors: Record<string, string>; stepId: string; stepIndex: number }
  | { type: "formCompleted"; data: FormData };

export type FormMachineInput = { data?: FormData };

const defaultSubmit: SubmitFn = async (payload) => {
  const res = await fetch("/api/blueprint/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok || !json?.ok) {
    return { ok: false, error: String(json?.error || "Submission failed. Please try again.") };
  }
  return { ok: true, clientId: String(json.clientId) };
};

/** Validates the full payload with Zod (client-side parity) then submits. */
const runSubmit = fromPromise<SubmitResult, { payload: Record<string, unknown>; submit: SubmitFn }>(
  async ({ input }) => {
    const parsed = BlueprintSubmitSchema.safeParse(input.payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path?.[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
    }
    return input.submit(parsed.data as Record<string, unknown>);
  },
);

export function createFormMachine(schema: FormSchema, deps: FormMachineDeps = {}) {
  const submit = deps.submit ?? defaultSubmit;
  const stepAt = (c: FormContext) => schema.steps[c.stepIndex]!;

  return setup({
    types: {
      context: {} as FormContext,
      events: {} as FormMachineEvent,
      emitted: {} as FormEmitted,
      input: {} as FormMachineInput,
    },
    actors: { runSubmit },
    guards: {
      stepValid: ({ context }) =>
        Object.keys(validateStepData(stepAt(context), context.data)).length === 0,
      notLastStep: ({ context }) => context.stepIndex < schema.steps.length - 1,
      isLastStep: ({ context }) => context.stepIndex === schema.steps.length - 1,
      notFirstStep: ({ context }) => context.stepIndex > 0,
    },
    actions: {
      setField: assign({
        data: ({ context, event }) =>
          event.type === "SET_FIELD" ? { ...context.data, [event.key]: event.value } : context.data,
        errors: ({ context, event }) => {
          if (event.type !== "SET_FIELD") return context.errors;
          const { [event.key]: _omit, ...rest } = context.errors;
          return rest;
        },
      }),
      toggleMulti: assign({
        data: ({ context, event }) => {
          if (event.type !== "TOGGLE_MULTI") return context.data;
          const cur = Array.isArray(context.data[event.key]) ? (context.data[event.key] as string[]) : [];
          let next: string[];
          if (cur.includes(event.value)) next = cur.filter((x) => x !== event.value);
          else if (event.maxItems && cur.length >= event.maxItems) next = cur;
          else next = [...cur, event.value];
          return { ...context.data, [event.key]: next };
        },
        errors: ({ context, event }) => {
          if (event.type !== "TOGGLE_MULTI") return context.errors;
          const { [event.key]: _omit, ...rest } = context.errors;
          return rest;
        },
      }),
      assignErrors: assign({
        errors: ({ context }) => validateStepData(stepAt(context), context.data),
      }),
      clearErrors: assign({ errors: () => ({}) }),
      goNext: assign({ stepIndex: ({ context }) => context.stepIndex + 1 }),
      goPrev: assign({ stepIndex: ({ context }) => Math.max(0, context.stepIndex - 1) }),
      emitSlideNext: emit(({ context }) => ({
        type: "slideAdvanced" as const,
        stepIndex: context.stepIndex,
        stepId: stepAt(context).id,
        direction: "next" as const,
      })),
      emitSlidePrev: emit(({ context }) => ({
        type: "slideAdvanced" as const,
        stepIndex: context.stepIndex,
        stepId: stepAt(context).id,
        direction: "prev" as const,
      })),
      emitFirstField: emit(({ context }) => {
        const step = stepAt(context);
        return {
          type: "fieldHighlighted" as const,
          field: firstVisibleField(step, context.data) ?? "",
          stepId: step.id,
          stepIndex: context.stepIndex,
        };
      }),
      emitValidationFailed: emit(({ context }) => ({
        type: "validationFailed" as const,
        errors: context.errors,
        stepId: stepAt(context).id,
        stepIndex: context.stepIndex,
      })),
      emitFormCompleted: emit(({ context }) => ({
        type: "formCompleted" as const,
        data: context.data,
      })),
    },
  }).createMachine({
    id: `blueprint-${schema.id}`,
    initial: "idle",
    context: ({ input }) => ({
      stepIndex: 0,
      data: { ...(input?.data ?? {}) },
      errors: {},
      submitError: null,
      result: null,
    }),
    states: {
      idle: {
        on: {
          START: { target: "filling", actions: ["clearErrors", "emitFirstField"] },
        },
      },
      filling: {
        on: {
          SET_FIELD: { actions: "setField" },
          TOGGLE_MULTI: { actions: "toggleMulti" },
          NEXT: [
            {
              guard: and(["stepValid", "notLastStep"]),
              actions: ["clearErrors", "goNext", "emitSlideNext", "emitFirstField"],
            },
            {
              guard: not("stepValid"),
              actions: ["assignErrors", "emitValidationFailed"],
            },
          ],
          PREV: {
            guard: "notFirstStep",
            actions: ["clearErrors", "goPrev", "emitSlidePrev", "emitFirstField"],
          },
          SUBMIT: [
            {
              guard: and(["isLastStep", "stepValid"]),
              target: "submitting",
              actions: ["clearErrors", "emitFormCompleted"],
            },
            {
              guard: not("stepValid"),
              actions: ["assignErrors", "emitValidationFailed"],
            },
          ],
        },
      },
      submitting: {
        invoke: {
          src: "runSubmit",
          input: ({ context }) => ({ payload: schema.buildPayload(context.data), submit }),
          onDone: [
            {
              guard: ({ event }) => event.output.ok,
              target: "submitted",
              actions: assign({
                result: ({ event }) => ({ clientId: String(event.output.clientId ?? "") }),
                submitError: () => null,
              }),
            },
            {
              target: "filling",
              actions: assign({
                submitError: ({ event }) => event.output.error ?? "Submission failed. Please try again.",
                errors: ({ event }) => event.output.fieldErrors ?? {},
              }),
            },
          ],
          onError: {
            target: "filling",
            actions: assign({ submitError: () => "Network error. Please try again." }),
          },
        },
      },
      submitted: { type: "final" },
    },
  });
}

export type FormMachine = ReturnType<typeof createFormMachine>;
