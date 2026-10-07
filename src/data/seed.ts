import type { AgentId, ProposedAction } from "../governance";
import { append, type NewEvent, type PhcEvent, type WorkItemMeta } from "./events";

/** Fixed demo clock so the walkthrough is reproducible. */
export const NOW = "2026-10-03T09:00:00";

const t = (minutesAgo: number) => {
  const d = new Date(new Date(NOW).getTime() - minutesAgo * 60_000);
  return d.toISOString().slice(0, 19);
};

type ActionInput = Omit<ProposedAction, "unresolved" | "evidence"> &
  Partial<Pick<ProposedAction, "unresolved" | "evidence">>;
const act = (a: ActionInput): ProposedAction => ({ unresolved: [], evidence: [], ...a });

function build(): PhcEvent[] {
  let log: PhcEvent[] = [];
  let clock = 60 * 20; // start 20h ago, move forward
  const push = (ev: NewEvent, step = 7) => {
    clock -= step;
    log = append(log, ev, t(Math.max(clock, 1)));
  };
  const open = (item: WorkItemMeta, agent: AgentId) => {
    push({ type: "WorkItemOpened", item, by: agent });
    push({ type: "OwnershipAcquired", workItemId: item.id, agent }, 1);
  };
  const propose = (a: ActionInput) => push({ type: "ActionProposed", action: act(a) });
  const exec = (actionId: string, by: AgentId) => push({ type: "ActionExecuted", actionId, by }, 1);

  // ── Routine work agents handled on their own (summarized in the digest) ──
  const routine: Array<[AgentId, "operations" | "clinical" | "finance" | "research", ProposedAction["type"], string, number]> = [
    ["intake_scheduling", "operations", "schedule_change", "Confirmed appointment", 9],
    ["intake_scheduling", "operations", "schedule_change", "Rescheduled at patient request", 3],
    ["lab_triage", "clinical", "result_filing", "Filed lab panel (all in range)", 11],
    ["billing", "finance", "invoice_reconcile", "Reconciled patient invoice", 6],
    ["research_monitor", "research", "literature_summary", "Summarized new paper for protocol library", 2],
  ];
  let n = 0;
  for (const [agent, domain, type, label, count] of routine) {
    for (let i = 0; i < count; i++) {
      n++;
      const id = `R${n}`;
      const pid = `P-${1100 + n * 7}`;
      open({ id: `WR${n}`, title: `${label} — ${pid}`, domain, priority: "low", description: label, routine: true }, agent);
      propose({
        id,
        workItemId: `WR${n}`,
        agent,
        domain,
        type,
        subject: { kind: "patient", id: pid },
        summary: `${label} for ${pid}`,
        rationale: "Routine; matches standing policy",
        evidence: [{ label: "Source record", ref: `rec:${pid}/${n}` }],
        confidence: 0.97,
      });
      exec(id, agent);
    }
  }

  // ── W1: critical ferritin → urgent follow-up (the headline scenario) ──
  open(
    {
      id: "W1",
      title: "Critical ferritin result — P-1042 follow-up",
      domain: "clinical",
      priority: "critical",
      deadline: "2026-10-06T17:00:00",
      description: "Ferritin 8 µg/L (ref 30–400) on 2026-10-02 panel; prior 41 µg/L in June. Needs clinician review and follow-up within 7 days per Iron Protocol v3.",
    },
    "lab_triage",
  );
  propose({
    id: "A1",
    workItemId: "W1",
    agent: "lab_triage",
    domain: "clinical",
    type: "result_filing",
    subject: { kind: "patient", id: "P-1042" },
    summary: "Filed 2026-10-02 iron panel to P-1042 record",
    rationale: "Lab report parsed; all fields mapped; patient token matched",
    evidence: [{ label: "Northgate Labs report, p.1–2", ref: "lab:P-1042/2026-10-02" }],
    confidence: 0.99,
  });
  exec("A1", "lab_triage");
  propose({
    id: "A2",
    workItemId: "W1",
    agent: "lab_triage",
    domain: "clinical",
    type: "lab_flag",
    subject: { kind: "patient", id: "P-1042" },
    summary: "Flagged ferritin 8 µg/L as critically low (ref 30–400)",
    rationale: "Value below critical threshold (<15) and down 80% from 41 µg/L on 2026-06-11",
    evidence: [
      { label: "Northgate Labs report, p.2 (ferritin)", ref: "lab:P-1042/2026-10-02#p2" },
      { label: "Prior result 2026-06-11", ref: "lab:P-1042/2026-06-11#p2" },
      { label: "Iron Protocol v3 §2.1 thresholds", ref: "protocol:iron/v3#2.1" },
    ],
    confidence: 0.98,
  });
  exec("A2", "lab_triage");
  push({
    type: "HandoffCreated",
    workItemId: "W1",
    from: "lab_triage",
    to: "intake_scheduling",
    packet: {
      goal: "Book clinician follow-up for P-1042 within 7 days (by 2026-10-09)",
      done: ["Filed iron panel", "Flagged ferritin as critical with prior-value comparison"],
      openQuestions: ["Patient on oral iron since June? Not found in supplement list"],
      constraints: ["Clinician must review result before any patient contact", "Prefer Dr. Osei (treating clinician)"],
      evidenceRefs: ["lab:P-1042/2026-10-02#p2", "protocol:iron/v3#2.1"],
    },
  });
  propose({
    id: "A3",
    workItemId: "W1",
    agent: "intake_scheduling",
    domain: "clinical",
    type: "schedule_change",
    subject: { kind: "patient", id: "P-1042" },
    summary: "Book P-1042 with Dr. Osei, Tue Oct 6 10:00 (moves P-0877 routine review to Thu)",
    rationale:
      "Only Dr. Osei slot inside the 7-day window. P-0877's slot is a routine 6-month review with no open results, so moving it has the least clinical impact.",
    evidence: [
      { label: "Dr. Osei calendar, Oct 5–9", ref: "cal:osei/2026-W41" },
      { label: "P-0877 appointment type: routine review", ref: "appt:P-0877/2026-10-06" },
      { label: "Handoff packet from Lab Triage", ref: "handoff:W1/1" },
    ],
    unresolved: ["P-0877 has not been asked whether Thursday works", "Alternative: Dr. Lam has Wed 14:00 but is not the treating clinician"],
    confidence: 0.68,
    stance: "escalate_care",
  });
  push({
    type: "HandoffCreated",
    workItemId: "W1",
    from: "intake_scheduling",
    to: "docs_drafter",
    packet: {
      goal: "Prepare clinician pre-read and draft patient message for P-1042 follow-up",
      done: ["Proposed Tue Oct 6 10:00 with Dr. Osei (awaiting approval)"],
      openQuestions: ["Confirm current iron supplementation"],
      constraints: ["Do not send anything to the patient before clinician sign-off"],
      evidenceRefs: ["lab:P-1042/2026-10-02#p2", "lab:P-1042/2026-06-11#p2"],
    },
  });
  propose({
    id: "A4",
    workItemId: "W1",
    agent: "docs_drafter",
    domain: "clinical",
    type: "clinical_document_release",
    subject: { kind: "patient", id: "P-1042" },
    summary: "Release patient message: 'Your recent results need a follow-up visit'",
    rationale: "Template PM-07 (non-alarming result follow-up); no values or interpretation included pending clinician review",
    evidence: [
      { label: "Template PM-07 v2", ref: "template:PM-07/v2" },
      { label: "Ferritin result", ref: "lab:P-1042/2026-10-02#p2" },
    ],
    unresolved: ["Supplement history for June–Oct is incomplete"],
    confidence: 0.86,
    external: true,
  });

  // ── W2: Billing wants to escalate P-1042's balance — contradicts W1 ──
  open(
    {
      id: "W2",
      title: "Overdue balance — P-1042 ($1,240, 74 days)",
      domain: "finance",
      priority: "normal",
      deadline: "2026-10-10T17:00:00",
      description: "Balance from July advanced panel. Two reminders sent.",
    },
    "billing",
  );
  propose({
    id: "A5",
    workItemId: "W2",
    agent: "billing",
    domain: "finance",
    type: "collections_escalation",
    subject: { kind: "patient", id: "P-1042" },
    summary: "Send P-1042 balance to collections agency",
    rationale: "Balance > 60 days with 2 reminders sent; matches Finance SOP F-12 escalation criteria",
    evidence: [
      { label: "Ledger P-1042", ref: "ledger:P-1042" },
      { label: "Reminder log (Aug 14, Sep 15)", ref: "msg:P-1042/reminders" },
      { label: "SOP F-12", ref: "sop:F-12" },
    ],
    confidence: 0.93,
    amountCad: 1240,
    stance: "escalate_financial_pressure",
  });

  // ── W3: lab invoice payment over threshold ──
  open(
    {
      id: "W3",
      title: "Q3 reference-lab invoice — Northgate Labs",
      domain: "finance",
      priority: "high",
      deadline: "2026-10-04T17:00:00",
      description: "Quarterly invoice; net-30 due tomorrow.",
    },
    "billing",
  );
  propose({
    id: "A6",
    workItemId: "W3",
    agent: "billing",
    domain: "finance",
    type: "invoice_reconcile",
    subject: { kind: "vendor", id: "northgate-labs" },
    summary: "Reconciled 212 of 214 line items against requisitions",
    rationale: "Line items matched by requisition id and test code",
    evidence: [{ label: "Invoice NG-2026-Q3", ref: "inv:NG-2026-Q3" }],
    unresolved: ["2 line items (genomic panel ×2) have no matching requisition — $460 total"],
    confidence: 0.9,
  });
  exec("A6", "billing");
  propose({
    id: "A7",
    workItemId: "W3",
    agent: "billing",
    domain: "finance",
    type: "payment",
    subject: { kind: "vendor", id: "northgate-labs" },
    summary: "Pay Northgate Labs $18,940 (excludes $460 disputed)",
    rationale: "Pay matched items before net-30 deadline; hold the 2 unmatched lines and open a dispute",
    evidence: [
      { label: "Reconciliation result", ref: "recon:NG-2026-Q3" },
      { label: "Contract payment terms", ref: "contract:northgate/2025#4" },
    ],
    unresolved: ["Dispute for 2 unmatched genomic panels not yet sent"],
    confidence: 0.91,
    amountCad: 18940,
  });

  // ── W4: research data request with PHI ──
  open(
    {
      id: "W4",
      title: "Data request — university metabolic cohort study",
      domain: "research",
      priority: "normal",
      deadline: "2026-10-15T17:00:00",
      description: "Partner requests 3 years of HbA1c + intervention data for 140 patients.",
    },
    "partnerships",
  );
  propose({
    id: "A8",
    workItemId: "W4",
    agent: "partnerships",
    domain: "research",
    type: "data_export",
    subject: { kind: "protocol", id: "metabolic-cohort" },
    summary: "Export cohort dataset (140 patients) to university partner",
    rationale: "Request matches the scope of the 2025 research MOU",
    evidence: [
      { label: "Request email 2026-09-29", ref: "mail:partner/2026-09-29" },
      { label: "Research MOU 2025", ref: "contract:univ-mou/2025" },
    ],
    unresolved: ["No REB/ethics approval number in the request", "Dataset has not been through the de-identification pipeline"],
    confidence: 0.72,
    containsPhi: true,
    external: true,
  });

  // ── W5: literature → protocol suggestion ──
  open(
    {
      id: "W5",
      title: "New meta-analysis: berberine and HbA1c",
      domain: "research",
      priority: "normal",
      description: "Research Monitor matched a 2026 meta-analysis to Metabolic Protocol v4.",
    },
    "research_monitor",
  );
  propose({
    id: "A9",
    workItemId: "W5",
    agent: "research_monitor",
    domain: "research",
    type: "literature_summary",
    subject: { kind: "protocol", id: "metabolic/v4" },
    summary: "Summarized meta-analysis (24 RCTs, n=2,310) and linked to Metabolic Protocol v4 §3",
    rationale: "Paper matches protocol keywords and intervention list",
    evidence: [{ label: "Meta-analysis DOI", ref: "doi:10.0000/example.2026.0412" }],
    confidence: 0.94,
  });
  exec("A9", "research_monitor");
  propose({
    id: "A10",
    workItemId: "W5",
    agent: "research_monitor",
    domain: "research",
    type: "protocol_change",
    subject: { kind: "protocol", id: "metabolic/v4" },
    summary: "Suggest clinician review of berberine dosing in Metabolic Protocol v4 §3.2",
    rationale: "Pooled effect largest at 1,000–1,500 mg/day; protocol currently specifies 500 mg/day",
    evidence: [
      { label: "Meta-analysis, Table 3", ref: "doi:10.0000/example.2026.0412#t3" },
      { label: "Metabolic Protocol v4 §3.2", ref: "protocol:metabolic/v4#3.2" },
    ],
    unresolved: ["Heterogeneity high (I² = 71%)", "Conflicts with 2024 PHC note on GI tolerance at higher doses — surfaced, not resolved"],
    confidence: 0.77,
  });

  // ── W6: inventory reorder, autonomous but visible ──
  open(
    {
      id: "W6",
      title: "Vitamin D3 5,000 IU below reorder point",
      domain: "operations",
      priority: "low",
      description: "Stock 18 units; reorder point 25.",
    },
    "inventory",
  );
  propose({
    id: "A11",
    workItemId: "W6",
    agent: "inventory",
    domain: "operations",
    type: "inventory_reorder",
    subject: { kind: "resource", id: "sku:D3-5000" },
    summary: "Reordered 60 units from usual supplier ($312)",
    rationale: "Below reorder point; 30-day usage 41 units",
    evidence: [{ label: "Stock ledger", ref: "inv:D3-5000" }],
    confidence: 0.99,
    amountCad: 312,
  });
  exec("A11", "inventory");

  // ── W7: Lab triage could not read a scanned report — escalates instead of guessing ──
  open(
    {
      id: "W7",
      title: "Unreadable scanned report — P-2219",
      domain: "clinical",
      priority: "high",
      deadline: "2026-10-04T12:00:00",
      description: "Faxed thyroid panel from external lab; low-quality scan.",
    },
    "lab_triage",
  );
  propose({
    id: "A12",
    workItemId: "W7",
    agent: "lab_triage",
    domain: "clinical",
    type: "result_filing",
    subject: { kind: "patient", id: "P-2219" },
    summary: "File thyroid panel for P-2219 (TSH 4.1?, free T4 unreadable)",
    rationale: "OCR confidence on values below threshold; TSH could be 4.1 or 1.1",
    evidence: [{ label: "Fax scan, 3 pages", ref: "fax:2026-10-02/0193" }],
    unresolved: ["Reference range on page 3 is illegible", "Free T4 value unreadable", "Request a clean copy from the lab?"],
    confidence: 0.41,
  });
  push({ type: "AgentEscalated", workItemId: "W7", agent: "lab_triage", reason: "OCR confidence 0.41 on numeric values; refusing to file a possibly wrong TSH" });

  // ── W8: partnership renewal ──
  open(
    {
      id: "W8",
      title: "Imaging centre referral agreement renewal",
      domain: "partnerships",
      priority: "high",
      deadline: "2026-10-12T17:00:00",
      description: "Agreement with Lakeshore Imaging expires Oct 31.",
    },
    "partnerships",
  );
  propose({
    id: "A13",
    workItemId: "W8",
    agent: "partnerships",
    domain: "partnerships",
    type: "external_outreach",
    subject: { kind: "vendor", id: "lakeshore-imaging" },
    summary: "Send renewal request to Lakeshore Imaging with proposed 12-month term",
    rationale: "Referral volume up 22% YoY; prior terms acceptable per ops notes",
    evidence: [
      { label: "Current agreement", ref: "contract:lakeshore/2025" },
      { label: "Referral volume report", ref: "report:referrals/2026-Q3" },
    ],
    confidence: 0.88,
    external: true,
  });

  // ── W9/W10: two agents about to message the same patient — duplicate ──
  open(
    {
      id: "W9",
      title: "Fasting instructions — P-1530 (lab draw Mon)",
      domain: "operations",
      priority: "normal",
      deadline: "2026-10-04T18:00:00",
      description: "Patient has a fasting lipid panel Monday 08:00.",
    },
    "intake_scheduling",
  );
  propose({
    id: "A14",
    workItemId: "W9",
    agent: "intake_scheduling",
    domain: "operations",
    type: "patient_communication",
    subject: { kind: "patient", id: "P-1530" },
    summary: "SMS fasting instructions for Monday lab draw",
    rationale: "Standard prep reminder 48h before fasting draw",
    evidence: [{ label: "Appointment", ref: "appt:P-1530/2026-10-05" }],
    confidence: 0.96,
  });
  open(
    {
      id: "W10",
      title: "Pre-visit packet — P-1530",
      domain: "clinical",
      priority: "normal",
      description: "New-patient packet for Oct 8 visit.",
    },
    "docs_drafter",
  );
  propose({
    id: "A15",
    workItemId: "W10",
    agent: "docs_drafter",
    domain: "operations",
    type: "patient_communication",
    subject: { kind: "patient", id: "P-1530" },
    summary: "Email pre-visit packet incl. lab prep instructions",
    rationale: "New-patient workflow step 3",
    evidence: [{ label: "New patient checklist", ref: "sop:NP-03" }],
    confidence: 0.92,
  });

  return log;
}

export const SEED_EVENTS: PhcEvent[] = build();
