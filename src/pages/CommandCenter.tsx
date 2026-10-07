import { useState } from "react";
import { DOMAINS, rank, type AgentId, type Domain } from "../governance";
import { AGENTS } from "../data/agents";
import { NEEDS_HUMAN, type ActionView } from "../data/derive";
import { useStore } from "../store";
import { ActionCard } from "../components/ActionCard";
import { ConflictCard } from "../components/ConflictCard";
import { ACTION_LABEL, Avatar, Card, DOMAIN_STYLE, SectionTitle } from "../components/ui";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CommandCenter({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const { state, now } = useStore();
  const [domain, setDomain] = useState<Domain | "all">("all");
  const inDomain = (d: Domain) => domain === "all" || d === domain;

  const actions = [...state.actions.values()];
  const urgencyOf = (v: ActionView) => state.workItems.get(v.action.workItemId)?.urgency ?? 0;

  const waiting = actions
    .filter((v) => NEEDS_HUMAN.includes(v.status) && v.status !== "blocked_conflict" && inDomain(v.action.domain))
    .sort((x, y) => urgencyOf(y) - urgencyOf(x) || rank(y.gate.level) - rank(x.gate.level));
  const conflicts = state.openConflicts.filter((c) => c.actionIds.some((id) => inDomain(state.actions.get(id)!.action.domain)));
  const autonomous = actions.filter((v) => v.status === "done" && v.executedBy !== "human:operator");
  const decided = actions.filter((v) => v.executedBy === "human:operator" || v.status === "rejected" || v.status === "held");

  const dueWithinDay = waiting.filter((v) => {
    const d = state.workItems.get(v.action.workItemId)?.meta.deadline;
    return d && new Date(d).getTime() - new Date(now).getTime() < 24 * 3_600_000;
  }).length;
  const total = waiting.length + conflicts.length;

  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-3xl">
        <h1 className="text-[1.75rem] leading-tight font-bold text-ink">
          {total === 0
            ? "Nothing needs you right now."
            : `${plural(total, "decision is", "decisions are")} waiting on you.`}
        </h1>
        {total > 0 && (
          <p className="mt-1 text-lg text-muted">
            {[
              conflicts.length > 0 && `${plural(conflicts.length, "is a disagreement", "are disagreements")} between agents`,
              dueWithinDay > 0 && `${dueWithinDay} ${dueWithinDay === 1 ? "is" : "are"} due within a day`,
            ]
              .filter(Boolean)
              .join(", and ")
              .replace(/^./, (c) => c.toUpperCase())}
            {(conflicts.length > 0 || dueWithinDay > 0) && ". "}
            Agents handled {autonomous.length} routine tasks on their own since yesterday afternoon.
          </p>
        )}
        <WorkMix
          done={autonomous.length}
          approval={actions.filter((v) => v.status === "awaiting_human").length}
          conflicts={state.openConflicts.length}
          humanOnly={actions.filter((v) => v.status === "human_only").length}
        />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <DomainFilter value={domain} onChange={setDomain} />

          {conflicts.length > 0 && (
            <section>
              <SectionTitle count={conflicts.length} hint="Neither side goes ahead until you choose">Agents disagree</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} onOpenItem={onOpenItem} />)}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle count={waiting.length} hint="Most urgent first">Waiting on you</SectionTitle>
            <Legend />
            {waiting.length > 0 ? (
              <Card className="divide-y divide-line overflow-hidden">
                {waiting.map((v) => <ActionCard key={v.action.id} view={v} onOpenItem={onOpenItem} />)}
              </Card>
            ) : (
              <Card className="p-6 text-muted">
                Nothing waiting{domain !== "all" ? ` in ${DOMAIN_STYLE[domain].label}` : ""}. New items appear here when an agent needs a decision.
              </Card>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-8">
          <section>
            <SectionTitle count={autonomous.length}>Done by agents</SectionTitle>
            <Digest actions={autonomous} onOpenItem={onOpenItem} />
          </section>
          {decided.length > 0 && (
            <section>
              <SectionTitle count={decided.length}>Your decisions</SectionTitle>
              <ul className="flex flex-col gap-2 text-sm">
                {decided.slice(-5).reverse().map((v) => (
                  <li key={v.action.id}>
                    <button onClick={() => onOpenItem(v.action.workItemId)} className="text-left hover:underline">
                      <span className="font-bold">{v.status === "done" ? "Approved" : v.status === "held" ? "Held" : "Rejected"}:</span>{" "}
                      <span className="text-muted">{v.action.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-1 rounded-sm ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 text-xs text-muted">
      {item("bg-mark-approve", "You approve, agent acts")}
      {item("bg-mark-human", "A person has to do it")}
    </div>
  );
}

function Digest({ actions, onOpenItem }: { actions: ActionView[]; onOpenItem: (id: string) => void }) {
  const [openAgent, setOpenAgent] = useState<AgentId | null>(null);
  const groups = new Map<AgentId, ActionView[]>();
  for (const v of actions) groups.set(v.action.agent, [...(groups.get(v.action.agent) ?? []), v]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <ul className="flex flex-col">
      {sorted.map(([agent, vs]) => (
        <li key={agent} className="border-b border-line last:border-0">
          <button
            onClick={() => setOpenAgent(openAgent === agent ? null : agent)}
            aria-expanded={openAgent === agent}
            className="flex w-full items-center gap-3 py-2.5 text-left hover:text-accent"
          >
            <Avatar a={agent} size="sm" />
            <span className="flex-1">
              <span className="block text-sm font-bold">{AGENTS[agent].name}</span>
              <span className="block text-xs text-muted">{summarize(vs)}</span>
            </span>
            <span className="text-sm tabular-nums text-muted">{vs.length}</span>
          </button>
          {openAgent === agent && (
            <ul className="flex flex-col gap-1 pb-3 pl-9 text-xs">
              {vs.map((v) => (
                <li key={v.action.id}>
                  <button onClick={() => onOpenItem(v.action.workItemId)} className="text-left text-muted hover:text-ink hover:underline">
                    {v.action.summary}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function summarize(vs: ActionView[]) {
  const counts = new Map<string, number>();
  for (const v of vs) counts.set(ACTION_LABEL[v.action.type], (counts.get(ACTION_LABEL[v.action.type]) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => (n > 1 ? `${t} (${n})` : t)).join(", ");
}

function DomainFilter({ value, onChange }: { value: Domain | "all"; onChange: (d: Domain | "all") => void }) {
  const opts: Array<Domain | "all"> = ["all", ...DOMAINS];
  return (
    <nav aria-label="Filter by area" className="-mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-line text-sm">
      {opts.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          aria-current={value === d}
          className={`-mb-px border-b-2 pb-2 font-bold transition-colors ${
            value === d ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {d === "all" ? "Everything" : DOMAIN_STYLE[d].label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Part-to-whole bar of everything agents touched: most of it ran on its own,
 * and the slices that need a person are what the queue below lists.
 * Drawn to scale; each segment keeps a small minimum width so a count of 1 stays visible.
 */
function WorkMix({ done, approval, conflicts, humanOnly }: { done: number; approval: number; conflicts: number; humanOnly: number }) {
  const parts = [
    { key: "done", label: "Done by agents", n: done, cls: "bg-mark-done" },
    { key: "approval", label: "Needs your approval", n: approval, cls: "bg-mark-approve" },
    { key: "conflict", label: "Agents disagree", n: conflicts, cls: "bg-mark-conflict" },
    { key: "human", label: "Needs a person", n: humanOnly, cls: "bg-mark-human" },
  ].filter((p) => p.n > 0);
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (total === 0) return null;

  return (
    <figure className="mt-5" aria-label="Today's work by who needs to act">
      <div className="flex h-3 gap-0.5" role="img" aria-hidden>
        {parts.map((p) => (
          <div
            key={p.key}
            title={`${p.label}: ${p.n}`}
            className={`${p.cls} min-w-1.5 first:rounded-l last:rounded-r`}
            style={{ flexGrow: p.n, flexBasis: 0 }}
          />
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />
            {p.label} <b className="tabular-nums text-ink">{p.n}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
