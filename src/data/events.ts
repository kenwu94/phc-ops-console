import type { AgentId, Domain, HandoffPacket, ProposedAction } from "../governance";

export type Priority = "critical" | "high" | "normal" | "low";

export interface WorkItemMeta {
  id: string;
  title: string;
  domain: Domain;
  priority: Priority;
  /** ISO date-time. */
  deadline?: string;
  description: string;
  /** Routine items are summarized in the digest rather than listed. */
  routine?: boolean;
}

export type Actor = AgentId | "human:operator";

/**
 * Append-only log. All UI state is derived from this; nothing is mutated.
 * This gives a complete audit trail and makes any past state replayable.
 */
export type PhcEvent = { seq: number; at: string } & (
  | { type: "WorkItemOpened"; item: WorkItemMeta; by: Actor }
  | { type: "OwnershipAcquired"; workItemId: string; agent: AgentId }
  | { type: "HandoffCreated"; workItemId: string; from: AgentId; to: AgentId; packet: HandoffPacket }
  | { type: "ActionProposed"; action: ProposedAction }
  | { type: "ActionExecuted"; actionId: string; by: Actor }
  | { type: "HumanDecision"; actionId: string; decision: "approved" | "rejected" | "handled_offline"; note?: string }
  | { type: "ConflictResolved"; conflictId: string; proceedActionId: string | null; note?: string }
  | { type: "AgentEscalated"; workItemId: string; agent: AgentId; reason: string }
  | { type: "AgentPaused"; agent: AgentId; paused: boolean }
);

export type NewEvent = DistributiveOmit<PhcEvent, "seq" | "at">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export function append(log: PhcEvent[], ev: NewEvent, at: string): PhcEvent[] {
  const seq = (log.at(-1)?.seq ?? 0) + 1;
  return [...log, { ...ev, seq, at } as PhcEvent];
}
