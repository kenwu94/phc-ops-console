import type { Conflict } from "../governance";
import { AGENTS } from "../data/agents";
import { useStore } from "../store";
import { Avatar, Button } from "./ui";

/** Short agent names for button labels ("Let Billing go ahead"). */
const SHORT: Record<string, string> = {
  intake_scheduling: "Scheduling",
  lab_triage: "Lab Triage",
  docs_drafter: "Docs Drafter",
  billing: "Billing",
  research_monitor: "Research",
  partnerships: "Partnerships",
  inventory: "Inventory",
};

export function ConflictCard({ conflict, onOpenItem }: { conflict: Conflict; onOpenItem: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const [a, b] = conflict.actionIds.map((id) => state.actions.get(id)!);
  const subject = conflict.subjectKey.split(":")[1];
  const resolve = (proceedActionId: string | null, note: string) =>
    dispatch({ type: "ConflictResolved", conflictId: conflict.id, proceedActionId, note });

  const headline =
    conflict.kind === "duplicate"
      ? `${AGENTS[a.action.agent].name} and ${AGENTS[b.action.agent].name} are both about to contact ${subject}`
      : `${subject}: ${conflict.reason.charAt(0).toLowerCase()}${conflict.reason.slice(1)}`;

  return (
    <div className="relative">
      <span className="absolute inset-y-0 left-0 w-1 bg-mark-conflict" aria-hidden />
      <div className="py-4 pr-4 pl-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-bold text-ink">{headline}</p>
          <Button kind="ghost" onClick={() => resolve(null, "Hold both pending review")}>Hold both</Button>
        </div>
        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
          {[a, b].map((v, i) => (
            <div key={v.action.id} className={`contents`}>
              {i === 1 && (
                <div className="flex items-center justify-center text-sm font-bold text-faint" aria-hidden>
                  or
                </div>
              )}
              <div className="flex flex-col gap-3 rounded-lg bg-paper p-3">
                <div className="flex items-start gap-3">
                  <Avatar a={v.action.agent} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-muted">{AGENTS[v.action.agent].name} wants to</p>
                    <button onClick={() => onOpenItem(v.action.workItemId)} className="text-left text-sm text-ink hover:underline">
                      {v.action.summary}
                    </button>
                  </div>
                </div>
                <div className="mt-auto">
                  <Button kind="secondary" onClick={() => resolve(v.action.id, `Let ${SHORT[v.action.agent]} go ahead; hold the other`)}>
                    Let {SHORT[v.action.agent]} go ahead
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
