import type { AutonomyLevel } from "../src/governance/types";

export interface GuardHit {
  id: string;
  level: AutonomyLevel;
  reason: string;
}

/**
 * Deterministic safety net applied to the *raw request text*, independent of
 * the model. It can only raise the gate. It is deliberately crude and
 * over-inclusive: a false positive costs a human click, a false negative
 * could cost a privacy breach or a wrong treatment.
 */
const PATTERNS: Array<{ id: string; level: AutonomyLevel; re: RegExp; reason: string }> = [
  {
    id: "G-TREAT",
    level: "human_only",
    re: /\b(dos(e|ing|age)|increase|decrease|discontinue|stop|start)\b[^.]*\b(mg|iu|mcg|medication|supplement|protocol|iron|magnesium|berberine|treatment)\b/i,
    reason: "Mentions changing a dose, medication or treatment",
  },
  {
    id: "G-EGRESS",
    level: "human_only",
    re: /\b(export|forward|send|share|transfer)\b[^.]*\b(records?|lab history|genetic|dataset|data|chart)\b/i,
    reason: "Mentions sending records or data out",
  },
  {
    id: "G-IDENT",
    level: "human_only",
    re: /\b(health card|date of birth|dates of birth|DOB|SIN)\b/i,
    reason: "Mentions direct identifiers",
  },
  {
    id: "G-EMAIL",
    level: "approval",
    re: /[\w.+-]+@[\w-]+\.[\w.]+/,
    reason: "Contains an external email address",
  },
  {
    id: "G-COLLECT",
    level: "approval",
    re: /\bcollections?\b/i,
    reason: "Mentions collections",
  },
  {
    id: "G-SIGN",
    level: "human_only",
    re: /\b(sign|countersign|execute)\b[^.]*\b(agreement|contract)\b/i,
    reason: "Mentions signing an agreement",
  },
  {
    id: "G-PERM",
    level: "human_only",
    re: /\b(permission|without approval|allowed to)\b/i,
    reason: "Mentions changing permissions or approval requirements",
  },
  {
    id: "G-INJECT",
    level: "human_only",
    re: /\b(pre-?approved|ignore (previous|prior|all)|system note|classify as)\b/i,
    reason: "Request tries to instruct the classifier",
  },
];

export function guard(text: string): GuardHit[] {
  return PATTERNS.filter((p) => p.re.test(text)).map(({ id, level, reason }) => ({ id, level, reason }));
}
