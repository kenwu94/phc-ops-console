import {
  acquire,
  canRunUnattended,
  detectConflicts,
  evaluateAction,
  handoff,
  type AgentId,
  type Conflict,
  type GateDecision,
  type HandoffPacket,
  type Ownership,
  type PolicyConfig,
  type ProposedAction,
} from "../governance";
import type { Actor, PhcEvent, Priority, WorkItemMeta } from "./events";

export type ActionStatus =
  | "done" // executed by agent or human
  | "queued" // allowed to run unattended, not executed yet
  | "awaiting_human" // gate requires approval
  | "human_only" // agent may only propose; a person must act
  | "blocked_conflict" // part of an unresolved conflict
  | "paused" // owning agent is paused
  | "rejected"
  | "held"; // the other side won a conflict resolution

export interface ActionView {
  action: ProposedAction;
  gate: GateDecision;
  status: ActionStatus;
  proposedAt: string;
  executedBy?: Actor;
  humanNote?: string;
  conflictIds: string[];
}

export interface HandoffView {
  from: AgentId;
  to: AgentId;
  packet: HandoffPacket;
  at: string;
}

export interface WorkItemView {
  meta: WorkItemMeta;
  owner?: AgentId;
  openedAt: string;
  actionIds: string[];
  handoffs: HandoffView[];
  escalations: { agent: AgentId; reason: string; at: string }[];
  events: PhcEvent[];
  urgency: number;
}

export interface IntegrityIssue {
  seq: number;
  message: string;
}

export interface DerivedState {
  workItems: Map<string, WorkItemView>;
  actions: Map<string, ActionView>;
  openConflicts: Conflict[];
  resolvedConflicts: { conflict: Conflict; proceedActionId: string | null; note?: string; at: string }[];
  pausedAgents: Set<AgentId>;
  ownership: Ownership;
  /** Events the governance layer refused (e.g. a second agent grabbing an owned item). */
  integrity: IntegrityIssue[];
}

const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 100, high: 60, normal: 30, low: 10 };

function urgency(meta: WorkItemMeta, now: string, escalated: boolean): number {
  let s = PRIORITY_WEIGHT[meta.priority];
  if (meta.deadline) {
    const hours = (new Date(meta.deadline).getTime() - new Date(now).getTime()) / 3_600_000;
    if (hours < 24) s += 50;
    else if (hours < 72) s += 25;
    else if (hours < 168) s += 10;
  }
  if (escalated) s += 20;
  return s;
}

/**
 * Replay the event log into the current view. Gate decisions are recomputed
 * from the *current* policy, so editing the autonomy matrix immediately shows
 * which pending actions would change level.
 */
export function derive(log: PhcEvent[], policy: PolicyConfig, now: string): DerivedState {
  const workItems = new Map<string, WorkItemView>();
  const actions = new Map<string, ActionView>();
  const pausedAgents = new Set<AgentId>();
  const integrity: IntegrityIssue[] = [];
  const decisions = new Map<string, { decision: "approved" | "rejected" | "handled_offline"; note?: string }>();
  const executed = new Map<string, Actor>();
  const resolutions: { conflictId: string; proceedActionId: string | null; note?: string; at: string; ev: PhcEvent }[] = [];
  let ownership: Ownership = {};

  for (const ev of log) {
    switch (ev.type) {
      case "WorkItemOpened":
        workItems.set(ev.item.id, {
          meta: ev.item,
          openedAt: ev.at,
          actionIds: [],
          handoffs: [],
          escalations: [],
          events: [ev],
          urgency: 0,
        });
        break;
      case "OwnershipAcquired": {
        const r = acquire(ownership, ev.workItemId, ev.agent);
        if (r.ok) ownership = r.ownership;
        else integrity.push({ seq: ev.seq, message: r.reason });
        workItems.get(ev.workItemId)?.events.push(ev);
        break;
      }
      case "HandoffCreated": {
        const r = handoff(ownership, ev.workItemId, ev.from, ev.to, ev.packet);
        if (r.ok) ownership = r.ownership;
        else integrity.push({ seq: ev.seq, message: r.reason });
        const wi = workItems.get(ev.workItemId);
        wi?.handoffs.push({ from: ev.from, to: ev.to, packet: ev.packet, at: ev.at });
        wi?.events.push(ev);
        break;
      }
      case "ActionProposed": {
        const a = ev.action;
        if (ownership[a.workItemId] !== a.agent) {
          integrity.push({ seq: ev.seq, message: `${a.agent} proposed ${a.id} on ${a.workItemId} without owning it` });
        }
        actions.set(a.id, { action: a, gate: evaluateAction(a, policy), status: "queued", proposedAt: ev.at, conflictIds: [] });
        const wi = workItems.get(a.workItemId);
        wi?.actionIds.push(a.id);
        wi?.events.push(ev);
        break;
      }
      case "ActionExecuted":
        executed.set(ev.actionId, ev.by);
        pushToItemOfAction(ev, ev.actionId);
        break;
      case "HumanDecision":
        decisions.set(ev.actionId, { decision: ev.decision, note: ev.note });
        pushToItemOfAction(ev, ev.actionId);
        break;
      case "ConflictResolved":
        resolutions.push({ conflictId: ev.conflictId, proceedActionId: ev.proceedActionId, note: ev.note, at: ev.at, ev });
        break;
      case "AgentEscalated": {
        const wi = workItems.get(ev.workItemId);
        wi?.escalations.push({ agent: ev.agent, reason: ev.reason, at: ev.at });
        wi?.events.push(ev);
        break;
      }
      case "AgentPaused":
        if (ev.paused) pausedAgents.add(ev.agent);
        else pausedAgents.delete(ev.agent);
        break;
    }
  }

  function pushToItemOfAction(ev: PhcEvent, actionId: string) {
    const wi = workItems.get(actions.get(actionId)?.action.workItemId ?? "");
    wi?.events.push(ev);
  }

  // Actions removed from play by a human (rejected, or held by a conflict resolution).
  const held = new Set<string>();
  const resolvedIds = new Set(resolutions.map((r) => r.conflictId));
  const live = () =>
    [...actions.values()]
      .filter((v) => decisions.get(v.action.id)?.decision !== "rejected" && !held.has(v.action.id))
      .map((v) => v.action);

  const allConflicts = detectConflicts(live());
  const resolvedConflicts: DerivedState["resolvedConflicts"] = [];
  for (const r of resolutions) {
    const c = allConflicts.find((x) => x.id === r.conflictId);
    if (!c) continue;
    for (const id of c.actionIds) if (id !== r.proceedActionId) held.add(id);
    const touched = new Set(c.actionIds.map((id) => actions.get(id)!.action.workItemId));
    for (const w of touched) workItems.get(w)?.events.push(r.ev);
    resolvedConflicts.push({ conflict: c, proceedActionId: r.proceedActionId, note: r.note, at: r.at });
  }
  const openConflicts = allConflicts.filter((c) => !resolvedIds.has(c.id));

  for (const v of actions.values()) {
    const id = v.action.id;
    const d = decisions.get(id);
    v.conflictIds = allConflicts.filter((c) => c.actionIds.includes(id)).map((c) => c.id);
    v.humanNote = d?.note;
    v.executedBy = executed.get(id);

    if (d?.decision === "rejected") v.status = "rejected";
    else if (held.has(id)) v.status = "held";
    else if (executed.has(id) || d?.decision === "approved" || d?.decision === "handled_offline") {
      v.status = "done";
      v.executedBy ??= "human:operator";
    } else if (openConflicts.some((c) => c.actionIds.includes(id))) v.status = "blocked_conflict";
    else if (pausedAgents.has(v.action.agent)) v.status = "paused";
    else if (v.gate.level === "human_only") v.status = "human_only";
    else if (!canRunUnattended(v.gate)) v.status = "awaiting_human";
    else v.status = "queued";
  }

  for (const wi of workItems.values()) {
    wi.events.sort((a, b) => a.seq - b.seq);
    wi.owner = ownership[wi.meta.id];
    wi.urgency = urgency(wi.meta, now, wi.escalations.length > 0);
  }

  return { workItems, actions, openConflicts, resolvedConflicts, pausedAgents, ownership, integrity };
}

export const NEEDS_HUMAN: ActionStatus[] = ["awaiting_human", "human_only", "blocked_conflict"];
