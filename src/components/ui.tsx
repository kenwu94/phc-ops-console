import type { ReactNode } from "react";
import type { ActionType, AgentId, AutonomyLevel, Domain } from "../governance";
import { AGENTS } from "../data/agents";
import type { ActionStatus } from "../data/derive";
import type { Actor, Priority } from "../data/events";

export const DOMAIN_STYLE: Record<Domain, { label: string; dot: string; avatar: string }> = {
  clinical: { label: "Clinical", dot: "bg-rose-500", avatar: "bg-rose-100 text-rose-800" },
  operations: { label: "Operations", dot: "bg-sky-600", avatar: "bg-sky-100 text-sky-800" },
  finance: { label: "Finance", dot: "bg-amber-500", avatar: "bg-amber-100 text-amber-900" },
  research: { label: "Research", dot: "bg-violet-500", avatar: "bg-violet-100 text-violet-800" },
  partnerships: { label: "Partnerships", dot: "bg-emerald-600", avatar: "bg-emerald-100 text-emerald-800" },
};

const INITIALS: Record<AgentId, string> = {
  lab_triage: "LT",
  intake_scheduling: "SC",
  docs_drafter: "DD",
  billing: "BI",
  research_monitor: "RM",
  partnerships: "PA",
  inventory: "IN",
};

/** Monogram tinted by the agent's home domain, so the same agent is recognizable everywhere. */
export const Avatar = ({ a, size = "md" }: { a: AgentId; size?: "sm" | "md" | "lg" }) => (
  <span
    title={AGENTS[a].name}
    className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${DOMAIN_STYLE[AGENTS[a].domain].avatar} ${
      size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs"
    }`}
    aria-hidden
  >
    {INITIALS[a]}
  </span>
);

/** Plain-language names for action types, so system identifiers never reach the operator. */
export const ACTION_LABEL: Record<ActionType, string> = {
  schedule_change: "Scheduling change",
  patient_communication: "Message to patient",
  clinical_document_release: "Clinical message to patient",
  protocol_change: "Treatment or protocol change",
  result_filing: "File lab result",
  lab_flag: "Flag lab result",
  invoice_reconcile: "Invoice check",
  payment: "Payment",
  collections_escalation: "Send to collections",
  data_export: "Share data outside PHC",
  literature_summary: "Literature summary",
  external_outreach: "External outreach",
  contract_change: "Contract change",
  inventory_reorder: "Stock reorder",
  agent_permission_change: "Agent permission change",
};

export const LEVEL_STYLE: Record<AutonomyLevel, { label: string; cls: string; edge: string }> = {
  auto: { label: "Runs on its own", cls: "bg-paper text-muted", edge: "bg-line" },
  notify: { label: "Runs, then tells you", cls: "bg-accent-soft text-accent", edge: "bg-mark-done" },
  approval: { label: "Needs approval", cls: "bg-approve-soft text-approve", edge: "bg-mark-approve" },
  human_only: { label: "Human only", cls: "bg-human-soft text-human", edge: "bg-mark-human" },
};

const STATUS_STYLE: Record<ActionStatus, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-done" },
  queued: { label: "Queued", cls: "text-muted" },
  awaiting_human: { label: "Needs approval", cls: "text-approve" },
  human_only: { label: "Human only", cls: "text-human" },
  blocked_conflict: { label: "Blocked by a disagreement", cls: "text-conflict" },
  paused: { label: "Agent paused", cls: "text-muted" },
  rejected: { label: "Rejected", cls: "text-faint line-through" },
  held: { label: "Held", cls: "text-faint" },
};

/** Thin colored edge that encodes what kind of decision a row needs. */
export function edgeFor(status: ActionStatus, level: AutonomyLevel): string {
  if (status === "blocked_conflict") return "bg-mark-conflict";
  if (status === "done") return "bg-mark-done/40";
  if (status === "rejected" || status === "held") return "bg-line";
  return LEVEL_STYLE[level].edge;
}

export const DomainDot = ({ d }: { d: Domain }) => (
  <span className="inline-flex items-center gap-1.5 text-muted">
    <span className={`h-2 w-2 rounded-full ${DOMAIN_STYLE[d].dot}`} />
    {DOMAIN_STYLE[d].label}
  </span>
);
/** Kept for pages that list mixed domains. */
export const DomainBadge = DomainDot;

export const LevelBadge = ({ l }: { l: AutonomyLevel }) => (
  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap ${LEVEL_STYLE[l].cls}`}>{LEVEL_STYLE[l].label}</span>
);
export const StatusBadge = ({ s }: { s: ActionStatus }) => (
  <span className={`text-xs font-bold whitespace-nowrap ${STATUS_STYLE[s].cls}`}>{STATUS_STYLE[s].label}</span>
);

const PRIORITY_CLS: Record<Priority, string> = {
  critical: "text-human",
  high: "text-approve",
  normal: "text-muted",
  low: "text-faint",
};
export const PriorityBadge = ({ p }: { p: Priority }) => (
  <span className={`text-xs font-bold capitalize ${PRIORITY_CLS[p]}`}>{p} priority</span>
);

export const actorName = (a: Actor | AgentId) => (a === "human:operator" ? "You" : AGENTS[a].name);
export const AgentChip = ({ a }: { a: Actor | AgentId }) => <span className="text-muted">{actorName(a)}</span>;

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-line bg-surface ${className}`}>{children}</div>
);

export const SectionTitle = ({ children, count, hint }: { children: ReactNode; count?: number; hint?: string }) => (
  <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
    <h2 className="text-base font-bold text-ink">
      {children}
      {count !== undefined && <span className="ml-1.5 font-normal text-faint tabular-nums">{count}</span>}
    </h2>
    {hint && <span className="text-sm text-muted">{hint}</span>}
  </div>
);

type BtnKind = "primary" | "secondary" | "danger" | "ghost";
const BTN: Record<BtnKind, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-ink ring-1 ring-line hover:bg-paper",
  danger: "text-human hover:bg-human-soft",
  ghost: "text-muted hover:text-ink hover:bg-paper",
};
export const Button = ({ kind = "secondary", onClick, children, title }: { kind?: BtnKind; onClick: () => void; children: ReactNode; title?: string }) => (
  <button title={title} onClick={onClick} className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${BTN[kind]}`}>
    {children}
  </button>
);

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDue(deadline: string | undefined, now: string) {
  if (!deadline) return null;
  const h = (new Date(deadline).getTime() - new Date(now).getTime()) / 3_600_000;
  if (h < 0) return { text: "Overdue", cls: "text-human font-bold" };
  if (h < 24) return { text: `Due in ${Math.round(h)}h`, cls: "text-human font-bold" };
  const d = Math.round(h / 24);
  return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, cls: h < 72 ? "text-approve font-bold" : "text-muted" };
}
