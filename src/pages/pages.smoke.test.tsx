import { createElement as h, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreContext, type Store } from "../store";
import { derive } from "../data/derive";
import { NOW, SEED_EVENTS } from "../data/seed";
import { DEFAULT_POLICY } from "../governance";
import { CommandCenter } from "./CommandCenter";
import { WorkItemDetail } from "./WorkItemDetail";
import { AgentsPolicy } from "./AgentsPolicy";
import { EvalReport } from "./EvalReport";

const store: Store = {
  log: SEED_EVENTS,
  policy: DEFAULT_POLICY,
  state: derive(SEED_EVENTS, DEFAULT_POLICY, NOW),
  now: NOW,
  dispatch: () => {},
  setCell: () => {},
  reset: () => {},
};
const render = (node: ReactNode) => renderToString(h(StoreContext.Provider, { value: store }, node));
const noop = () => {};

describe("pages render against the seed scenario", () => {
  it("Command Center shows conflicts, the queue and the digest", () => {
    const html = render(h(CommandCenter, { onOpenItem: noop }));
    expect(html).toContain("P-1042: financial escalation on a patient in active clinical escalation");
    expect(html).toContain("Pay Northgate Labs $18,940");
    expect(html).toContain("Done by agents");
    expect(html).toContain("decisions are waiting on you");
  });

  it("renders every work item detail page", () => {
    for (const id of store.state.workItems.keys()) {
      expect(render(h(WorkItemDetail, { id, onBack: noop, onOpenItem: noop }))).toContain(store.state.workItems.get(id)!.meta.title.replace(/&/g, "&amp;"));
    }
  });

  it("W1 shows the handoff packets", () => {
    const html = render(h(WorkItemDetail, { id: "W1", onBack: noop, onOpenItem: noop }));
    expect(html).toContain("Book clinician follow-up for P-1042 within 7 days");
  });

  it("Agents & Policy and Eval render", () => {
    expect(render(h(AgentsPolicy))).toContain("How much each kind of work can run on its own");
    expect(render(h(EvalReport))).toContain("Unsafe mistakes on held-out cases");
  });
});
