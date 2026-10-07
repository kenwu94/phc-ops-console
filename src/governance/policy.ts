import type {
  ActionType,
  AutonomyLevel,
  GateDecision,
  PolicyConfig,
  PolicyMatrix,
  ProposedAction,
  RuleHit,
} from "./types";
import { AUTONOMY_LEVELS } from "./types";

export const rank = (l: AutonomyLevel): number => AUTONOMY_LEVELS.indexOf(l);
export const stricter = (a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel =>
  rank(a) >= rank(b) ? a : b;

/**
 * The editable part of policy. Operators can change these cells from the UI;
 * hard rules below still apply on top, so editing a cell can only make the
 * system stricter than the hard-rule floor, never looser.
 */
export const DEFAULT_MATRIX: PolicyMatrix = {
  clinical: {
    result_filing: "auto",
    lab_flag: "notify",
    clinical_document_release: "approval",
    patient_communication: "approval",
    protocol_change: "human_only",
    schedule_change: "notify",
    literature_summary: "auto",
  },
  operations: {
    schedule_change: "auto",
    patient_communication: "notify",
    inventory_reorder: "auto",
    data_export: "human_only",
  },
  finance: {
    invoice_reconcile: "auto",
    payment: "notify",
    collections_escalation: "approval",
  },
  research: {
    literature_summary: "auto",
    protocol_change: "human_only",
    data_export: "human_only",
  },
  partnerships: {
    external_outreach: "approval",
    contract_change: "human_only",
  },
};

export const DEFAULT_POLICY: PolicyConfig = {
  matrix: DEFAULT_MATRIX,
  confidenceThreshold: 0.75,
  paymentApprovalThresholdCad: 500,
};

type HardRule = {
  id: string;
  description: string;
  level: AutonomyLevel;
  applies: (a: ProposedAction, cfg: PolicyConfig) => boolean;
};

const CLINICAL_PATIENT_FACING: ActionType[] = [
  "patient_communication",
  "clinical_document_release",
];

/**
 * Non-negotiable floors. These are code, not configuration, on purpose:
 * changing them should require a code review, not a click.
 */
export const HARD_RULES: HardRule[] = [
  {
    id: "HR-CLIN-01",
    description: "Protocol, medication or treatment changes are made by a clinician, never an agent",
    level: "human_only",
    applies: (a) => a.type === "protocol_change",
  },
  {
    id: "HR-CLIN-02",
    description: "Clinical content reaching a patient requires clinician sign-off",
    level: "approval",
    applies: (a) =>
      a.domain === "clinical" && (CLINICAL_PATIENT_FACING.includes(a.type) || !!a.external),
  },
  {
    id: "HR-PHI-01",
    description: "Identifiable health information leaving the PHC boundary is human-only",
    level: "human_only",
    applies: (a) => !!a.containsPhi && (!!a.external || a.type === "data_export"),
  },
  {
    id: "HR-FIN-01",
    description: "Money movement above threshold requires approval",
    level: "approval",
    applies: (a, cfg) => (a.amountCad ?? 0) > cfg.paymentApprovalThresholdCad,
  },
  {
    id: "HR-FIN-02",
    description: "Collections or financial pressure on a patient requires approval",
    level: "approval",
    applies: (a) => a.type === "collections_escalation",
  },
  {
    id: "HR-EXT-01",
    description: "Contracts and binding external commitments are human-only",
    level: "human_only",
    applies: (a) => a.type === "contract_change",
  },
  {
    id: "HR-EXT-02",
    description: "New external communication in PHC's name requires approval",
    level: "approval",
    applies: (a) => a.type === "external_outreach",
  },
  {
    id: "HR-GOV-01",
    description: "Changing an agent's permissions is human-only",
    level: "human_only",
    applies: (a) => a.type === "agent_permission_change",
  },
];

/**
 * Decide how much human involvement an action needs.
 * Pure and deterministic: same action + config always yields the same decision.
 * The strictest contributing rule wins; every contributing rule is returned.
 */
export function evaluateAction(action: ProposedAction, cfg: PolicyConfig = DEFAULT_POLICY): GateDecision {
  const rules: RuleHit[] = [];

  const cell = cfg.matrix[action.domain]?.[action.type];
  if (cell) {
    rules.push({
      id: `MATRIX:${action.domain}/${action.type}`,
      description: `Autonomy matrix sets ${action.domain} / ${action.type} to ${cell}`,
      level: cell,
    });
  } else {
    rules.push({
      id: "MATRIX:DEFAULT",
      description: `No policy defined for ${action.domain} / ${action.type}; unknown actions default to human-only`,
      level: "human_only",
    });
  }

  for (const r of HARD_RULES) {
    if (r.applies(action, cfg)) rules.push({ id: r.id, description: r.description, level: r.level });
  }

  if (!(action.confidence >= cfg.confidenceThreshold)) {
    // `!(>=)` also catches NaN: unknown confidence is treated as low.
    rules.push({
      id: "CONF-01",
      description: `Agent confidence ${fmtConf(action.confidence)} is below ${cfg.confidenceThreshold}; escalate to a human`,
      level: "approval",
    });
  }

  if (action.evidence.length === 0) {
    rules.push({
      id: "PROV-01",
      description: "Action has no evidence attached; cannot run unattended",
      level: "approval",
    });
  }

  const level = rules.reduce<AutonomyLevel>((acc, r) => stricter(acc, r.level), "auto");
  return { level, rules };
}

/** True when the action may execute without a human acting first. */
export const canRunUnattended = (d: GateDecision) => d.level === "auto" || d.level === "notify";

/** Update one matrix cell immutably (used by the policy editor). */
export function setMatrixCell(
  matrix: PolicyMatrix,
  domain: keyof PolicyMatrix,
  type: ActionType,
  level: AutonomyLevel,
): PolicyMatrix {
  return { ...matrix, [domain]: { ...matrix[domain], [type]: level } };
}

const fmtConf = (c: number) => (Number.isFinite(c) ? c.toFixed(2) : "unknown");
