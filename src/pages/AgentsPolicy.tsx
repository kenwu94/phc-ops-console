import {
  ACTION_TYPES,
  AUTONOMY_LEVELS,
  DEFAULT_POLICY,
  DOMAINS,
  HARD_RULES,
  evaluateAction,
  type AgentId,
  type AutonomyLevel,
} from "../governance";
import { AGENTS } from "../data/agents";
import { NEEDS_HUMAN, type ActionView } from "../data/derive";
import { useStore } from "../store";
import { ACTION_LABEL, Avatar, Card, DOMAIN_STYLE, DomainDot, LEVEL_STYLE, LevelBadge, SectionTitle } from "../components/ui";

const BUILT_AS = {
  deterministic: { label: "Rules-based code", cls: "bg-paper text-muted ring-1 ring-line" },
  llm: { label: "AI model", cls: "bg-accent-soft text-accent" },
  "llm+retrieval": { label: "AI model + records search", cls: "bg-accent-soft text-accent" },
} as const;

/** Clicking a matrix cell steps through the levels in order of strictness, then wraps. */
const nextLevel = (l: AutonomyLevel | undefined): AutonomyLevel =>
  l === undefined ? "auto" : AUTONOMY_LEVELS[(AUTONOMY_LEVELS.indexOf(l) + 1) % AUTONOMY_LEVELS.length];

export function AgentsPolicy() {
  const { state, policy, setCell, dispatch } = useStore();
  const all = [...state.actions.values()];

  const stats = (id: AgentId) => {
    const mine = all.filter((v) => v.action.agent === id);
    return {
      done: mine.filter((v) => v.status === "done" && v.executedBy === id).length,
      waiting: mine.filter((v) => NEEDS_HUMAN.includes(v.status)).length,
      escalations: [...state.workItems.values()].reduce((n, w) => n + w.escalations.filter((e) => e.agent === id).length, 0),
    };
  };

  // What changed versus the default policy, measured on the actions currently in the system.
  const impact = all
    .filter((v) => !["done", "rejected", "held"].includes(v.status))
    .map((v) => ({ v, before: evaluateAction(v.action, DEFAULT_POLICY).level, after: v.gate.level }))
    .filter((x) => x.before !== x.after);
  const changedCount = DOMAINS.reduce(
    (n, d) => n + ACTION_TYPES.filter((t) => policy.matrix[d]?.[t] !== DEFAULT_POLICY.matrix[d]?.[t]).length,
    0,
  );

  return (
    <div className="flex flex-col gap-12">
      <section>
        <h1 className="text-[1.75rem] leading-tight font-bold">Agents</h1>
        <p className="mt-1 mb-5 max-w-2xl text-muted">
          Seven agents, each with one job. Pausing an agent stops its work right away. Lab triage, billing and inventory are
          rules-based code. AI models are used only where the input is written language.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(AGENTS).map((a) => {
            const s = stats(a.id);
            const paused = state.pausedAgents.has(a.id);
            return (
              <Card key={a.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className={paused ? "opacity-50" : ""}><Avatar a={a.id} size="lg" /></span>
                  <PauseSwitch paused={paused} name={a.name} onToggle={() => dispatch({ type: "AgentPaused", agent: a.id, paused: !paused })} />
                </div>
                <div className={paused ? "opacity-50" : ""}>
                  <div className="min-w-0">
                    <p className="font-bold">{a.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <DomainDot d={a.domain} />
                      <span className={`rounded px-1.5 py-0.5 font-bold ${BUILT_AS[a.implementation].cls}`}>{BUILT_AS[a.implementation].label}</span>
                    </div>
                  </div>
                </div>
                <p className={`text-sm text-muted ${paused ? "opacity-50" : ""}`}>{a.purpose}</p>
                <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <Stat label="Done alone" value={s.done} />
                  <Stat label="Waiting on you" value={s.waiting} tone={s.waiting ? "text-approve" : undefined} />
                  <Stat label="Asked for help" value={s.escalations} />
                </dl>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-[1.375rem] font-bold">How much each kind of work can run on its own</h2>
        <p className="mt-1 mb-4 max-w-2xl text-muted">
          Click a cell to change its level. The rules at the bottom of this page are hard floors in code, so a change here can
          make the system stricter than them but never looser.
        </p>

        <ImpactNote changed={changedCount} impact={impact} />

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {AUTONOMY_LEVELS.map((l) => <LevelBadge key={l} l={l} />)}
          <span className="text-muted">A dash means not set, which is treated as human only.</span>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-muted">Kind of work</th>
                {DOMAINS.map((d) => (
                  <th key={d} className="px-2 py-3 text-left font-bold text-muted">
                    <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${DOMAIN_STYLE[d].dot}`} />
                    {DOMAIN_STYLE[d].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ACTION_TYPES.map((t) => (
                <tr key={t}>
                  <td className="px-4 py-1.5">{ACTION_LABEL[t]}</td>
                  {DOMAINS.map((d) => {
                    const v = policy.matrix[d]?.[t];
                    const changed = v !== DEFAULT_POLICY.matrix[d]?.[t];
                    return (
                      <td key={d} className="px-2 py-1.5">
                        <button
                          onClick={() => setCell(d, t, nextLevel(v))}
                          title={`${DOMAIN_STYLE[d].label}, ${ACTION_LABEL[t]}. Click to change.`}
                          className={`w-full rounded-md px-2 py-1 text-left text-xs font-bold transition-colors ${
                            v ? LEVEL_STYLE[v].cls : "text-faint hover:bg-paper"
                          } ${changed ? "ring-2 ring-accent" : ""}`}
                        >
                          {v ? LEVEL_STYLE[v].label : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle count={HARD_RULES.length + 2} hint="Changing these requires a code change and review">Rules that can't be switched off</SectionTitle>
        <Card className="divide-y divide-line">
          {[
            ...HARD_RULES.map((r) => ({ id: r.id, text: r.description, level: r.level })),
            { id: "CONF-01", text: `An agent less than ${Math.round(policy.confidenceThreshold * 100)}% sure has to ask a person`, level: "approval" as const },
            { id: "PROV-01", text: "An action with no evidence attached can't run on its own", level: "approval" as const },
          ].map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">{r.text}</span>
              <LevelBadge l={r.level} />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function ImpactNote({ changed, impact }: { changed: number; impact: { v: ActionView; before: AutonomyLevel; after: AutonomyLevel }[] }) {
  if (changed === 0) return null;
  const settings = `${changed} setting${changed > 1 ? "s" : ""}`;
  return (
    <div className="relative mb-4 rounded-lg bg-accent-soft py-3 pr-4 pl-5" role="status">
      <span className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-accent" aria-hidden />
      <p className="font-bold">
        {impact.length === 0
          ? `You changed ${settings}. Nothing currently open is handled differently.`
          : `You changed ${settings}. ${impact.length} open item${impact.length > 1 ? "s are" : " is"} now handled differently:`}
      </p>
      {impact.length === 0 && (
        <p className="text-sm text-muted">Either a hard rule already sets a stricter floor for that work, or no open work is affected.</p>
      )}
      {impact.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {impact.map(({ v, before, after }) => (
            <li key={v.action.id} className="flex flex-wrap items-center gap-2">
              <span>{v.action.summary}</span>
              <LevelBadge l={before} />
              <span className="text-muted">becomes</span>
              <LevelBadge l={after} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[11px] leading-tight text-muted">{label}</dt>
      <dd className={`text-lg leading-tight font-bold tabular-nums ${tone ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}

function PauseSwitch({ paused, onToggle, name }: { paused: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      role="switch"
      aria-checked={!paused}
      aria-label={`${name}: ${paused ? "paused, click to resume" : "running, click to pause"}`}
      onClick={onToggle}
      className="flex shrink-0 items-center gap-2 text-xs font-bold text-muted"
    >
      {paused ? "Paused" : "Running"}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${paused ? "bg-line" : "bg-accent"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${paused ? "left-0.5" : "left-[1.125rem]"}`} />
      </span>
    </button>
  );
}
