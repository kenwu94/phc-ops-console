export const DOMAINS = ["clinical", "operations", "finance", "research", "partnerships"] as const;
export type Domain = (typeof DOMAINS)[number];

export const ACTION_TYPES = [
  "schedule_change",
  "patient_communication",
  "clinical_document_release",
  "protocol_change",
  "result_filing",
  "lab_flag",
  "invoice_reconcile",
  "payment",
  "collections_escalation",
  "data_export",
  "literature_summary",
  "external_outreach",
  "contract_change",
  "inventory_reorder",
  "agent_permission_change",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Ordered from least to most restrictive. */
export const AUTONOMY_LEVELS = ["auto", "notify", "approval", "human_only"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export type AgentId =
  | "intake_scheduling"
  | "lab_triage"
  | "docs_drafter"
  | "billing"
  | "research_monitor"
  | "partnerships"
  | "inventory";

export interface Evidence {
  label: string;
  /** Pointer to the source record, e.g. "lab:P-1042/2026-09-28#p2". */
  ref: string;
}

/** A subject is the thing an action affects; conflicts are detected per subject. */
export interface Subject {
  kind: "patient" | "resource" | "vendor" | "protocol";
  id: string;
}

export interface ProposedAction {
  id: string;
  workItemId: string;
  agent: AgentId;
  domain: Domain;
  type: ActionType;
  subject: Subject;
  summary: string;
  rationale: string;
  evidence: Evidence[];
  unresolved: string[];
  /** Agent's self-reported confidence, 0..1. */
  confidence: number;
  /** Used by finance hard rules. */
  amountCad?: number;
  /** Patient-facing or leaves the PHC boundary. */
  external?: boolean;
  /** Discloses identifiable health information to someone other than the patient or PHC staff. */
  containsPhi?: boolean;
  /**
   * Stance of the action toward its subject. Conflicts are raised when two
   * actions on the same subject have incompatible stances.
   */
  stance?: Stance;
}

export type Stance =
  | "escalate_care" // e.g. urgent follow-up
  | "escalate_financial_pressure" // e.g. collections
  | "pause_engagement"
  | "reduce_access" // e.g. bump an appointment
  | "neutral";

export type PolicyMatrix = Partial<Record<Domain, Partial<Record<ActionType, AutonomyLevel>>>>;

export interface PolicyConfig {
  matrix: PolicyMatrix;
  confidenceThreshold: number;
  paymentApprovalThresholdCad: number;
}

export interface RuleHit {
  id: string;
  description: string;
  level: AutonomyLevel;
}

export interface GateDecision {
  level: AutonomyLevel;
  /** Every rule that contributed; the strictest one determines `level`. */
  rules: RuleHit[];
}
