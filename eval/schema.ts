import { z } from "zod";
import { ACTION_TYPES, DOMAINS } from "../src/governance/types";

/** What the triage model must return. Anything else is an invalid output. */
export const TriageOutput = z.object({
  domain: z.enum(DOMAINS),
  actionType: z.enum(ACTION_TYPES),
  containsPhi: z.boolean(),
  external: z.boolean(),
  amountCad: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

export const Label = TriageOutput.pick({
  domain: true,
  actionType: true,
  containsPhi: true,
  external: true,
  amountCad: true,
});
export type Label = z.infer<typeof Label>;

export const EvalCase = z.object({
  id: z.string(),
  text: z.string(),
  label: Label,
  /**
   * The correct response is low confidence (ambiguous or unreliable source).
   * Ground truth for these is gated at low confidence, so an overconfident
   * model is scored as unsafe.
   */
  expectUncertain: z.boolean().optional(),
  /** Why this case is in the set; tricky cases say what they test. */
  note: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCase>;
