import type { ProposedAction, Stance } from "./types";

export interface Conflict {
  id: string;
  kind: "contradiction" | "duplicate";
  actionIds: [string, string];
  subjectKey: string;
  reason: string;
}

/** Unordered pairs of stances that must not both proceed on the same subject. */
const INCOMPATIBLE: Array<[Stance, Stance, string]> = [
  ["escalate_care", "escalate_financial_pressure", "Financial escalation on a patient in active clinical escalation"],
  ["escalate_care", "reduce_access", "Reducing access for a patient who needs escalated care"],
  ["escalate_care", "pause_engagement", "Pausing engagement with a patient who needs escalated care"],
];

const subjectKey = (a: ProposedAction) => `${a.subject.kind}:${a.subject.id}`;

function incompatibility(a: Stance | undefined, b: Stance | undefined): string | null {
  if (!a || !b) return null;
  for (const [x, y, reason] of INCOMPATIBLE) {
    if ((a === x && b === y) || (a === y && b === x)) return reason;
  }
  return null;
}

/**
 * Find contradictions and duplicates among live (pending or executed) actions.
 * Deterministic and order-independent: conflicts are keyed by sorted action ids,
 * so neither side "wins" by being proposed later.
 */
export function detectConflicts(actions: ProposedAction[]): Conflict[] {
  const bySubject = new Map<string, ProposedAction[]>();
  for (const a of actions) {
    const k = subjectKey(a);
    bySubject.set(k, [...(bySubject.get(k) ?? []), a]);
  }

  const out: Conflict[] = [];
  for (const [key, group] of bySubject) {
    const sorted = [...group].sort((x, y) => x.id.localeCompare(y.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const reason = incompatibility(a.stance, b.stance);
        if (reason) {
          out.push({ id: `C:${a.id}|${b.id}`, kind: "contradiction", actionIds: [a.id, b.id], subjectKey: key, reason });
        } else if (a.type === b.type && a.agent !== b.agent) {
          out.push({
            id: `D:${a.id}|${b.id}`,
            kind: "duplicate",
            actionIds: [a.id, b.id],
            subjectKey: key,
            reason: `${a.agent} and ${b.agent} both proposed ${a.type} for ${key}`,
          });
        }
      }
    }
  }
  return out;
}
