import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  DEFAULT_POLICY,
  DOMAINS,
  acquire,
  canRunUnattended,
  detectConflicts,
  evaluateAction,
  handoff,
  release,
  setMatrixCell,
  type HandoffPacket,
  type PolicyConfig,
  type ProposedAction,
} from "./index";

const base = (over: Partial<ProposedAction> = {}): ProposedAction => ({
  id: "A1",
  workItemId: "W1",
  agent: "intake_scheduling",
  domain: "operations",
  type: "schedule_change",
  subject: { kind: "patient", id: "P-1" },
  summary: "Confirm appointment",
  rationale: "Patient replied yes",
  evidence: [{ label: "SMS reply", ref: "msg:1" }],
  unresolved: [],
  confidence: 0.95,
  ...over,
});

const loosenEverything = (): PolicyConfig => {
  let matrix = DEFAULT_POLICY.matrix;
  for (const d of DOMAINS) for (const t of ACTION_TYPES) matrix = setMatrixCell(matrix, d, t, "auto");
  return { ...DEFAULT_POLICY, matrix };
};

describe("evaluateAction — AC1: every pair resolves to one level", () => {
  it("returns a level for every domain × action type, defaulting unknowns to human_only", () => {
    for (const domain of DOMAINS) {
      for (const type of ACTION_TYPES) {
        const d = evaluateAction(base({ domain, type }));
        expect(["auto", "notify", "approval", "human_only"]).toContain(d.level);
        if (!DEFAULT_POLICY.matrix[domain]?.[type]) {
          expect(d.level).toBe("human_only");
          expect(d.rules.map((r) => r.id)).toContain("MATRIX:DEFAULT");
        }
      }
    }
  });

  it("lets a routine, well-evidenced, confident action run unattended", () => {
    const d = evaluateAction(base());
    expect(d.level).toBe("auto");
    expect(canRunUnattended(d)).toBe(true);
  });
});

describe("evaluateAction — AC2: hard rules cannot be loosened via the matrix", () => {
  const cfg = loosenEverything();

  it.each([
    ["protocol change", base({ domain: "clinical", type: "protocol_change" }), "human_only", "HR-CLIN-01"],
    ["patient-facing clinical doc", base({ domain: "clinical", type: "clinical_document_release" }), "approval", "HR-CLIN-02"],
    ["PHI export", base({ domain: "research", type: "data_export", containsPhi: true }), "human_only", "HR-PHI-01"],
    ["large payment", base({ domain: "finance", type: "payment", amountCad: 4200 }), "approval", "HR-FIN-01"],
    ["collections", base({ domain: "finance", type: "collections_escalation" }), "approval", "HR-FIN-02"],
    ["contract", base({ domain: "partnerships", type: "contract_change" }), "human_only", "HR-EXT-01"],
    ["permission change", base({ domain: "operations", type: "agent_permission_change" }), "human_only", "HR-GOV-01"],
  ] as const)("%s stays gated even when the matrix says auto", (_n, action, level, ruleId) => {
    const d = evaluateAction(action, cfg);
    expect(d.level).toBe(level);
    expect(d.rules.map((r) => r.id)).toContain(ruleId);
  });

  it("payment at exactly the threshold is not escalated by HR-FIN-01", () => {
    const d = evaluateAction(base({ domain: "finance", type: "payment", amountCad: 500 }));
    expect(d.rules.map((r) => r.id)).not.toContain("HR-FIN-01");
  });
});

describe("evaluateAction — AC3: confidence can tighten, never loosen", () => {
  it("escalates low-confidence auto actions to approval", () => {
    const d = evaluateAction(base({ confidence: 0.4 }));
    expect(d.level).toBe("approval");
    expect(d.rules.map((r) => r.id)).toContain("CONF-01");
  });

  it("treats NaN confidence as low", () => {
    expect(evaluateAction(base({ confidence: Number.NaN })).level).toBe("approval");
  });

  it("perfect confidence does not lower a human_only gate", () => {
    const d = evaluateAction(base({ domain: "clinical", type: "protocol_change", confidence: 1 }));
    expect(d.level).toBe("human_only");
  });

  it("missing evidence blocks unattended execution", () => {
    const d = evaluateAction(base({ evidence: [] }));
    expect(d.level).toBe("approval");
    expect(d.rules.map((r) => r.id)).toContain("PROV-01");
  });
});

describe("evaluateAction — AC6: explainable", () => {
  it("returns every contributing rule, and the strictest determines the level", () => {
    const d = evaluateAction(base({ domain: "clinical", type: "protocol_change", confidence: 0.2, evidence: [] }));
    expect(d.rules.map((r) => r.id).sort()).toEqual(
      ["CONF-01", "HR-CLIN-01", "MATRIX:clinical/protocol_change", "PROV-01"].sort(),
    );
    expect(d.level).toBe("human_only");
  });

  it("is deterministic", () => {
    const a = base({ confidence: 0.5, amountCad: 900, domain: "finance", type: "payment" });
    expect(evaluateAction(a)).toEqual(evaluateAction(a));
  });
});

describe("ownership — AC4", () => {
  const packet: HandoffPacket = {
    goal: "Book follow-up within 7 days",
    done: ["Flagged ferritin"],
    openQuestions: [],
    constraints: ["Clinician must review before patient contact"],
    evidenceRefs: ["lab:P-1/2026-09-28#p2"],
  };

  it("refuses a second agent acquiring an owned work item", () => {
    const r1 = acquire({}, "W1", "lab_triage");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = acquire(r1.ownership, "W1", "billing");
    expect(r2).toMatchObject({ ok: false, owner: "lab_triage" });
  });

  it("re-acquiring by the owner is idempotent", () => {
    const r = acquire({ W1: "lab_triage" }, "W1", "lab_triage");
    expect(r).toEqual({ ok: true, ownership: { W1: "lab_triage" } });
  });

  it("transfers ownership on a valid handoff", () => {
    const r = handoff({ W1: "lab_triage" }, "W1", "lab_triage", "intake_scheduling", packet);
    expect(r).toEqual({ ok: true, ownership: { W1: "intake_scheduling" } });
  });

  it("rejects handoff from a non-owner", () => {
    expect(handoff({ W1: "lab_triage" }, "W1", "billing", "intake_scheduling", packet).ok).toBe(false);
  });

  it("rejects handoff without goal or evidence", () => {
    const own = { W1: "lab_triage" } as const;
    expect(handoff(own, "W1", "lab_triage", "billing", { ...packet, goal: "  " }).ok).toBe(false);
    expect(handoff(own, "W1", "lab_triage", "billing", { ...packet, evidenceRefs: [] }).ok).toBe(false);
  });

  it("does not mutate input on handoff or release", () => {
    const own = Object.freeze({ W1: "lab_triage" as const });
    handoff(own, "W1", "lab_triage", "billing", packet);
    release(own, "W1", "lab_triage");
    expect(own).toEqual({ W1: "lab_triage" });
  });
});

describe("detectConflicts — AC5", () => {
  const care = base({ id: "A-care", agent: "intake_scheduling", stance: "escalate_care", subject: { kind: "patient", id: "P-9" } });
  const collect = base({
    id: "A-coll",
    agent: "billing",
    domain: "finance",
    type: "collections_escalation",
    stance: "escalate_financial_pressure",
    subject: { kind: "patient", id: "P-9" },
  });

  it("flags contradictory stances on the same patient", () => {
    const cs = detectConflicts([care, collect]);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ kind: "contradiction", subjectKey: "patient:P-9" });
  });

  it("is order-independent (no last-write-wins)", () => {
    expect(detectConflicts([care, collect])).toEqual(detectConflicts([collect, care]));
  });

  it("ignores the same stances on different subjects", () => {
    expect(detectConflicts([care, { ...collect, subject: { kind: "patient", id: "P-10" } }])).toEqual([]);
  });

  it("flags duplicates: two agents proposing the same action type on one subject", () => {
    const a = base({ id: "X1", agent: "intake_scheduling" });
    const b = base({ id: "X2", agent: "lab_triage" });
    expect(detectConflicts([a, b])).toMatchObject([{ kind: "duplicate" }]);
  });
});
