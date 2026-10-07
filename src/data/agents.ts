import type { AgentId, Domain } from "../governance";

export interface AgentProfile {
  id: AgentId;
  name: string;
  domain: Domain;
  purpose: string;
  /** How the agent is implemented — not everything should be an LLM. */
  implementation: "deterministic" | "llm" | "llm+retrieval";
}

export const AGENTS: Record<AgentId, AgentProfile> = {
  lab_triage: {
    id: "lab_triage",
    name: "Lab Results Triage",
    domain: "clinical",
    purpose: "Files incoming lab results, flags out-of-range markers against reference ranges",
    implementation: "deterministic",
  },
  intake_scheduling: {
    id: "intake_scheduling",
    name: "Intake & Scheduling",
    domain: "operations",
    purpose: "Confirms, reschedules and books appointments; finds slots for urgent follow-ups",
    implementation: "llm",
  },
  docs_drafter: {
    id: "docs_drafter",
    name: "Clinical Docs Drafter",
    domain: "clinical",
    purpose: "Drafts visit notes and patient messages from the record for clinician sign-off",
    implementation: "llm+retrieval",
  },
  billing: {
    id: "billing",
    name: "Billing & Claims",
    domain: "finance",
    purpose: "Reconciles invoices, prepares payments, manages patient balances",
    implementation: "deterministic",
  },
  research_monitor: {
    id: "research_monitor",
    name: "Research Monitor",
    domain: "research",
    purpose: "Summarizes new literature relevant to active PHC protocols",
    implementation: "llm+retrieval",
  },
  partnerships: {
    id: "partnerships",
    name: "Partnerships",
    domain: "partnerships",
    purpose: "Tracks lab/imaging agreements, drafts outreach, handles data requests",
    implementation: "llm",
  },
  inventory: {
    id: "inventory",
    name: "Supplements Inventory",
    domain: "operations",
    purpose: "Monitors dispensary stock against reorder points",
    implementation: "deterministic",
  },
};
