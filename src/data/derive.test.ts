import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, setMatrixCell } from "../governance";
import { derive } from "./derive";
import { append } from "./events";
import { NOW, SEED_EVENTS } from "./seed";

const state = (log = SEED_EVENTS, policy = DEFAULT_POLICY) => derive(log, policy, NOW);

describe("seed scenario", () => {
  it("replays without governance integrity violations", () => {
    expect(state().integrity).toEqual([]);
  });

  it("surfaces the clinical-vs-billing contradiction on P-1042 and the P-1530 duplicate", () => {
    const s = state();
    expect(s.openConflicts.map((c) => [c.kind, c.subjectKey]).sort()).toEqual([
      ["contradiction", "patient:P-1042"],
      ["duplicate", "patient:P-1530"],
    ]);
    expect(s.actions.get("A5")!.status).toBe("blocked_conflict");
  });

  it("gates the expected actions", () => {
    const s = state();
    const st = (id: string) => s.actions.get(id)!.status;
    expect(st("A3")).toBe("blocked_conflict"); // low-confidence reschedule, also in conflict
    expect(st("A4")).toBe("awaiting_human"); // patient-facing clinical content
    expect(st("A7")).toBe("awaiting_human"); // payment over threshold
    expect(st("A8")).toBe("human_only"); // PHI export
    expect(st("A10")).toBe("human_only"); // protocol change
    expect(st("A12")).toBe("awaiting_human"); // low OCR confidence
    expect(st("A11")).toBe("done"); // routine reorder ran on its own
  });

  it("ends with docs_drafter owning W1 after two handoffs", () => {
    expect(state().workItems.get("W1")!.owner).toBe("docs_drafter");
  });
});

describe("human decisions and conflict resolution", () => {
  it("resolving a conflict lets one side proceed and holds the other", () => {
    const conflictId = state().openConflicts.find((c) => c.kind === "contradiction")!.id;
    const log = append(SEED_EVENTS, { type: "ConflictResolved", conflictId, proceedActionId: "A3", note: "Care first" }, NOW);
    const s = state(log);
    expect(s.actions.get("A5")!.status).toBe("held");
    // A3 is no longer blocked by the conflict but is still low confidence -> needs approval
    expect(s.actions.get("A3")!.status).toBe("awaiting_human");
  });

  it("approval marks the action done by the operator", () => {
    const log = append(SEED_EVENTS, { type: "HumanDecision", actionId: "A7", decision: "approved" }, NOW);
    expect(state(log).actions.get("A7")).toMatchObject({ status: "done", executedBy: "human:operator" });
  });

  it("pausing an agent stops its unattended work", () => {
    const log = append(SEED_EVENTS, { type: "AgentPaused", agent: "intake_scheduling", paused: true }, NOW);
    const resolved = append(log, { type: "ConflictResolved", conflictId: state().openConflicts.find((c) => c.kind === "duplicate")!.id, proceedActionId: "A14" }, NOW);
    expect(state(resolved).actions.get("A14")!.status).toBe("paused");
  });

  it("an owner conflict in the log is recorded, not silently applied", () => {
    const log = append(SEED_EVENTS, { type: "OwnershipAcquired", workItemId: "W1", agent: "billing" }, NOW);
    const s = state(log);
    expect(s.integrity).toHaveLength(1);
    expect(s.workItems.get("W1")!.owner).toBe("docs_drafter");
  });
});

describe("policy edits re-derive gates", () => {
  it("tightening a matrix cell moves queued work to awaiting_human", () => {
    const dupId = state().openConflicts.find((c) => c.kind === "duplicate")!.id;
    const log = append(SEED_EVENTS, { type: "ConflictResolved", conflictId: dupId, proceedActionId: "A14" }, NOW);
    expect(state(log).actions.get("A14")!.status).toBe("queued");
    const strict = { ...DEFAULT_POLICY, matrix: setMatrixCell(DEFAULT_POLICY.matrix, "operations", "patient_communication", "approval") };
    expect(state(log, strict).actions.get("A14")!.status).toBe("awaiting_human");
  });
});
