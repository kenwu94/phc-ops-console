import type { AgentId } from "./types";

/** workItemId -> owning agent. One owner per work item prevents duplicated effort. */
export type Ownership = Readonly<Record<string, AgentId>>;

export interface HandoffPacket {
  goal: string;
  done: string[];
  openQuestions: string[];
  constraints: string[];
  evidenceRefs: string[];
}

export type OwnershipResult =
  | { ok: true; ownership: Ownership }
  | { ok: false; reason: string; owner?: AgentId };

export function acquire(ownership: Ownership, workItemId: string, agent: AgentId): OwnershipResult {
  const owner = ownership[workItemId];
  if (owner === agent) return { ok: true, ownership };
  if (owner) {
    return { ok: false, owner, reason: `${workItemId} is owned by ${owner}; request a handoff instead` };
  }
  return { ok: true, ownership: { ...ownership, [workItemId]: agent } };
}

/**
 * Transfer ownership atomically. The packet is the only context the receiving
 * agent is guaranteed to have, so an empty goal or missing evidence is refused.
 */
export function handoff(
  ownership: Ownership,
  workItemId: string,
  from: AgentId,
  to: AgentId,
  packet: HandoffPacket,
): OwnershipResult {
  const owner = ownership[workItemId];
  if (owner !== from) {
    return { ok: false, owner, reason: `${from} cannot hand off ${workItemId}: owner is ${owner ?? "nobody"}` };
  }
  if (from === to) return { ok: false, owner, reason: "Cannot hand off to self" };
  if (!packet.goal.trim()) return { ok: false, owner, reason: "Handoff packet must state a goal" };
  if (packet.evidenceRefs.length === 0) {
    return { ok: false, owner, reason: "Handoff packet must carry at least one evidence reference" };
  }
  return { ok: true, ownership: { ...ownership, [workItemId]: to } };
}

export function release(ownership: Ownership, workItemId: string, agent: AgentId): OwnershipResult {
  if (ownership[workItemId] !== agent) {
    return { ok: false, owner: ownership[workItemId], reason: `${agent} does not own ${workItemId}` };
  }
  const { [workItemId]: _released, ...rest } = ownership;
  return { ok: true, ownership: rest };
}
