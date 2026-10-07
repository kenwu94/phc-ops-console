import type { ReactNode } from "react";
import type { HandoffPacket } from "../governance";
import { AGENTS } from "../data/agents";
import type { PhcEvent } from "../data/events";
import { useStore } from "../store";
import { ActionCard } from "../components/ActionCard";
import { ConflictCard } from "../components/ConflictCard";
import { Card, DomainDot, PriorityBadge, SectionTitle, actorName, fmtDue, fmtTime } from "../components/ui";

export function WorkItemDetail({ id, onBack, onOpenItem }: { id: string; onBack: () => void; onOpenItem: (id: string) => void }) {
  const { state, now } = useStore();
  const wi = state.workItems.get(id);
  if (!wi) return <p>This case no longer exists. Go back to Today.</p>;

  const views = wi.actionIds.map((a) => state.actions.get(a)!);
  const conflicts = state.openConflicts.filter((c) => c.actionIds.some((a) => wi.actionIds.includes(a)));
  const due = fmtDue(wi.meta.deadline, now);
  const chain = [...new Set([...(wi.handoffs[0] ? [wi.handoffs[0].from] : wi.owner ? [wi.owner] : []), ...wi.handoffs.map((h) => h.to)])];
  // Ownership grabs are implied by the chain above; leave them out of the story.
  const timeline = wi.events.filter((e) => e.type !== "OwnershipAcquired");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <button onClick={onBack} className="text-sm font-bold text-accent hover:underline">Back to Today</button>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-bold text-ink">{wi.meta.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <PriorityBadge p={wi.meta.priority} />
          <DomainDot d={wi.meta.domain} />
          {due && <span className={due.cls}>{due.text}</span>}
        </div>
        <p className="mt-3 max-w-2xl text-muted">{wi.meta.description}</p>
        {chain.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Handled by{" "}
            {chain.map((a, i) => (
              <span key={a}>
                {i > 0 && (i === chain.length - 1 ? ", then " : ", ")}
                <span className={a === wi.owner ? "font-bold text-ink" : ""}>{AGENTS[a].name}</span>
              </span>
            ))}
          </p>
        )}
      </div>

      {wi.escalations.map((e) => (
        <div key={e.at} className="relative max-w-3xl rounded-lg bg-approve-soft py-3 pr-4 pl-5">
          <span className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-approve" aria-hidden />
          <p className="font-bold">{AGENTS[e.agent].name} stopped instead of guessing</p>
          <p className="text-sm text-muted">{e.reason}</p>
        </div>
      ))}

      {conflicts.length > 0 && (
        <section>
          <SectionTitle count={conflicts.length} hint="Blocks this case until you choose">Agents disagree</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} onOpenItem={onOpenItem} />)}
          </Card>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <SectionTitle count={views.length}>Actions</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {views.map((v) => (
              <ActionCard
                key={v.action.id}
                view={v}
                showStatus
                defaultOpen={v.status === "awaiting_human" || v.status === "human_only"}
              />
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle hint="Every step, in order">History</SectionTitle>
          <ol className="flex flex-col gap-4 border-l border-line pl-4">
            {timeline.map((ev) => <TimelineEntry key={ev.seq} ev={ev} />)}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Entry({ at, children }: { at: string; children: ReactNode }) {
  return (
    <li className="text-sm">
      <div className="text-xs text-faint">{fmtTime(at)}</div>
      {children}
    </li>
  );
}

function TimelineEntry({ ev }: { ev: PhcEvent }) {
  const { state } = useStore();
  const summary = (id: string) => state.actions.get(id)?.action.summary ?? id;
  const note = (n?: string) => n && <p className="mt-0.5 text-muted">Note: {n}</p>;
  const DECISION = { approved: "You approved", rejected: "You rejected", handled_offline: "Staff handled" } as const;

  switch (ev.type) {
    case "WorkItemOpened":
      return <Entry at={ev.at}>Case opened by {actorName(ev.by)}</Entry>;
    case "ActionProposed":
      return <Entry at={ev.at}><b>{AGENTS[ev.action.agent].name}</b> proposed: {ev.action.summary}</Entry>;
    case "ActionExecuted":
      return <Entry at={ev.at}><b>{actorName(ev.by)}</b> completed: {summary(ev.actionId)}</Entry>;
    case "HumanDecision":
      return <Entry at={ev.at}><b>{DECISION[ev.decision]}</b>: {summary(ev.actionId)}{note(ev.note)}</Entry>;
    case "AgentEscalated":
      return <Entry at={ev.at}><b>{AGENTS[ev.agent].name}</b> asked for help: {ev.reason}</Entry>;
    case "HandoffCreated":
      return (
        <Entry at={ev.at}>
          <b>{AGENTS[ev.from].name}</b> handed over to <b>{AGENTS[ev.to].name}</b>
          <Packet p={ev.packet} />
        </Entry>
      );
    case "ConflictResolved":
      return (
        <Entry at={ev.at}>
          <b>You settled a disagreement</b>: {ev.proceedActionId ? `went ahead with "${summary(ev.proceedActionId)}"` : "held both"}
          {note(ev.note)}
        </Entry>
      );
    default:
      return null;
  }
}

/** What the receiving agent is guaranteed to know. */
function Packet({ p }: { p: HandoffPacket }) {
  const row = (label: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <dt className="font-bold text-muted">{label}</dt>
        <dd>
          <ul className="list-disc pl-4">{items.map((i) => <li key={i}>{i}</li>)}</ul>
        </dd>
      </div>
    );
  return (
    <dl className="mt-2 flex flex-col gap-1.5 rounded-md bg-surface p-3 text-xs ring-1 ring-line">
      <div>
        <dt className="font-bold text-muted">Goal</dt>
        <dd>{p.goal}</dd>
      </div>
      {row("Already done", p.done)}
      {row("Open questions", p.openQuestions)}
      {row("Constraints", p.constraints)}
    </dl>
  );
}
