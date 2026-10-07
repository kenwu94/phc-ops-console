import type { ReactNode } from "react";
import type { CaseResult, Summary } from "../../eval/score";
import summaries from "../../eval/results/summary.json";
import { Card, LevelBadge } from "../components/ui";

type ResultFile = { summary: Summary; results: CaseResult[] };
const files = Object.values(
  import.meta.glob<ResultFile>("../../eval/results/*__*.json", { eager: true, import: "default" }),
);
const all = summaries as Summary[];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const RUNS: Array<{ provider: string; prompt: string; label: string }> = [
  { provider: "baseline:keywords", prompt: "n/a", label: "Keyword rules (no AI)" },
  { provider: "ollama:qwen2.5:7b", prompt: "v1", label: "Qwen 2.5, prompt 1" },
  { provider: "ollama:qwen2.5:7b", prompt: "v2", label: "Qwen 2.5, prompt 2" },
  { provider: "ollama:llama3.1:8b", prompt: "v1", label: "Llama 3.1, prompt 1" },
  { provider: "ollama:llama3.1:8b", prompt: "v2", label: "Llama 3.1, prompt 2" },
];
const find = (provider: string, prompt: string, set: Summary["set"]) =>
  all.find((s) => s.provider === provider && s.promptVersion === prompt && s.set === set);
const labelOf = (provider: string, prompt: string) => RUNS.find((r) => r.provider === provider && r.prompt === prompt)?.label ?? provider;

export function EvalReport() {
  const rows = RUNS.map((r) => ({ ...r, dev: find(r.provider, r.prompt, "dev"), held: find(r.provider, r.prompt, "holdout") })).filter(
    (r) => r.dev && r.held,
  ) as Array<(typeof RUNS)[number] & { dev: Summary; held: Summary }>;
  const heldN = rows[0]?.held.n ?? 0;

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-3xl">
        <h1 className="text-[1.75rem] leading-tight font-bold">Can we trust the AI step?</h1>
        <p className="mt-1 text-lg text-muted">
          One step uses an AI model: reading an incoming request and saying what kind of work it is. Rules-based code then
          decides whether a person must approve it. These results come from {rows[0]?.dev.n ?? 0} practice cases and {heldN} held-out
          cases that were written later and never tuned against.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <ChartTitle title="Accuracy drops on cases it hasn't seen" sub="Share of requests sorted into the right kind of work" />
          <Legend items={[{ cls: "bg-mark-practice", label: "Practice cases" }, { cls: "bg-mark-heldout", label: "Held-out cases" }]} />
          <Dumbbell rows={rows.map((r) => ({ label: r.label, a: r.dev.actionTypeAccuracy, b: r.held.actionTypeAccuracy }))} />
        </Card>
        <Card className="p-5">
          <ChartTitle title="Unsafe mistakes on held-out cases" sub={`Times the final decision was looser than it should have been, out of ${heldN}`} />
          <Bars rows={rows.map((r) => ({ label: r.label, value: r.held.unsafeAfterGuard }))} max={heldN} />
        </Card>
      </div>

      <section className="max-w-3xl">
        <h2 className="mb-3 text-[1.375rem] font-bold">What this shows</h2>
        <ul className="flex flex-col gap-3">
          <Finding>
            <b>The keyword rules were overfit.</b> They looked excellent on the cases they were written against and fell apart on
            new ones. Only the held-out numbers count.
          </Finding>
          <Finding>
            <b>Both AI models made no unsafe mistakes on held-out cases with prompt 1.</b> When they misread a request, the
            rules-based checks still sent it to a person.
          </Finding>
          <Finding>
            <b>Both models were overconfident.</b> One was 95% sure about a fax where the value "might be 4.1 or 1.1." Prompt 2 tried
            to fix this and didn't, and Llama got worse, so prompt 2 is not used. Uncertainty should come from the evidence, not from
            the model's own score.
          </Finding>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Expandable title="How a request flows through the system">
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {[
              "A request comes in",
              "The AI model labels it",
              "Labels are checked for valid format; invalid means a person decides",
              "Rules-based code applies the approval rules",
              "A keyword safety check can only make it stricter",
              "The work runs, or waits for you",
            ].map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-faint" aria-hidden>›</span>}
                <span className={`rounded-md px-2.5 py-1.5 ${i === 1 ? "bg-accent-soft text-accent" : "bg-paper"}`}>{s}</span>
              </li>
            ))}
          </ol>
        </Expandable>

        <Expandable title="Full results table">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="py-2 pr-3">Run</th>
                  <th className="px-3 py-2">Cases</th>
                  <th className="px-3 py-2 text-right">Accuracy</th>
                  <th className="px-3 py-2 text-right">Invalid output</th>
                  <th className="px-3 py-2 text-right">Unsafe</th>
                  <th className="px-3 py-2 text-right">Stricter than needed</th>
                  <th className="px-3 py-2 text-right">Overconfident</th>
                  <th className="px-3 py-2 text-right">Avg time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.flatMap((r) =>
                  [r.dev, r.held].map((s) => (
                    <tr key={`${r.label}${s.set}`}>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="px-3 py-2">{s.set === "holdout" ? <b>Held-out</b> : "Practice"} ({s.n})</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(s.actionTypeAccuracy)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(s.invalidRate)}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.unsafeAfterGuard ? "text-human" : "text-done"}`}>{s.unsafeAfterGuard}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(s.overEscalationRate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.overconfident}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.provider.startsWith("baseline") ? "—" : `${(s.meanLatencyMs / 1000).toFixed(1)}s`}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Local models via Ollama at temperature 0. Prompts are versioned in prompts/; results are committed in eval/results/.</p>
        </Expandable>

        <Expandable title="Every unsafe or overconfident case">
          <div className="grid gap-5 md:grid-cols-2">
            {files
              .slice()
              .sort((a, b) => labelOf(a.summary.provider, a.summary.promptVersion).localeCompare(labelOf(b.summary.provider, b.summary.promptVersion)) || b.summary.set.localeCompare(a.summary.set))
              .map((f) => {
                const bad = f.results.filter((r) => r.unsafeAfterGuard || r.overconfident);
                return (
                  <div key={`${f.summary.provider}${f.summary.promptVersion}${f.summary.set}`}>
                    <p className="mb-1 text-sm font-bold">
                      {labelOf(f.summary.provider, f.summary.promptVersion)}, {f.summary.set === "holdout" ? "held-out" : "practice"}
                    </p>
                    {bad.length === 0 && <p className="text-sm text-done">None.</p>}
                    <ul className="flex flex-col gap-2 text-sm">
                      {bad.map((r) => (
                        <li key={r.id}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold">{r.unsafeAfterGuard ? "Unsafe" : "Overconfident"}</span>
                            <span className="text-muted">should be</span> <LevelBadge l={r.truthGate} />
                            <span className="text-muted">got</span> <LevelBadge l={r.finalGate} />
                          </div>
                          {r.output && <p className="text-muted">{Math.round(r.output.confidence * 100)}% sure: {r.output.rationale}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </Expandable>
      </section>
    </div>
  );
}

const ChartTitle = ({ title, sub }: { title: string; sub: string }) => (
  <div className="mb-3">
    <h2 className="font-bold">{title}</h2>
    <p className="text-sm text-muted">{sub}</p>
  </div>
);

const Legend = ({ items }: { items: { cls: string; label: string }[] }) => (
  <div className="mb-3 flex gap-4 text-xs text-muted">
    {items.map((i) => (
      <span key={i.label} className="inline-flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-full ${i.cls}`} />
        {i.label}
      </span>
    ))}
  </div>
);

const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Practice vs held-out accuracy per run, on one 0–100% axis. */
function Dumbbell({ rows }: { rows: { label: string; a: number; b: number }[] }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-x-3 text-sm">
      {rows.map((r) => {
        const lo = Math.min(r.a, r.b);
        const hi = Math.max(r.a, r.b);
        return (
          <div key={r.label} className="contents">
            <div className="py-2 text-ink">{r.label}</div>
            <div className="relative my-2 h-5">
              <Grid />
              <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-line" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
              <Dot x={r.a} cls="bg-mark-practice" title={`Practice: ${pct(r.a)}`} />
              <Dot x={r.b} cls="bg-mark-heldout" title={`Held-out: ${pct(r.b)}`} />
              <span
                className="absolute top-1/2 -translate-y-1/2 text-xs font-bold text-ink tabular-nums"
                style={r.b >= r.a ? { left: `calc(${r.b * 100}% + 10px)` } : { right: `calc(${(1 - r.b) * 100}% + 10px)` }}
              >
                {pct(r.b)}
              </span>
            </div>
          </div>
        );
      })}
      <div />
      <Axis format={(t) => `${t * 100}%`} ticks={TICKS} />
    </div>
  );
}

function Bars({ rows, max }: { rows: { label: string; value: number }[]; max: number }) {
  const ticks = [0, Math.round(max / 4), Math.round(max / 2), Math.round((3 * max) / 4), max].map((t) => t / max);
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-x-3 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <div className="py-2 text-ink">{r.label}</div>
          <div className="relative my-2 h-5" title={`${r.label}: ${r.value} of ${max}`}>
            <Grid ticks={ticks} />
            {r.value > 0 && (
              <div className="absolute inset-y-0.5 left-0 rounded-r bg-mark-human" style={{ width: `${(r.value / max) * 100}%` }} />
            )}
            <span
              className={`absolute top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums ${r.value ? "text-ink" : "text-done"}`}
              style={{ left: `calc(${(r.value / max) * 100}% + 8px)` }}
            >
              {r.value === 0 ? "0, none" : r.value}
            </span>
          </div>
        </div>
      ))}
      <div />
      <Axis format={(t) => `${Math.round(t * max)}`} ticks={ticks} />
    </div>
  );
}

const Grid = ({ ticks = TICKS }: { ticks?: number[] }) => (
  <>
    {ticks.map((t) => (
      <span key={t} className="absolute inset-y-[-0.5rem] w-px bg-line/70" style={{ left: `${t * 100}%` }} aria-hidden />
    ))}
  </>
);

const Dot = ({ x, cls, title }: { x: number; cls: string; title: string }) => (
  <span
    title={title}
    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${cls}`}
    style={{ left: `${x * 100}%` }}
  />
);

function Axis({ ticks, format }: { ticks: number[]; format: (t: number) => string }) {
  return (
    <div className="relative mt-1 h-4 text-xs text-muted tabular-nums">
      {ticks.map((t) => (
        <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t * 100}%` }}>
          {format(t)}
        </span>
      ))}
    </div>
  );
}

const Finding = ({ children }: { children: ReactNode }) => (
  <li className="relative pl-5 text-ink before:absolute before:top-2.5 before:left-0 before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent">
    {children}
  </li>
);

function Expandable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 font-bold hover:bg-paper/60">
        {title}
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}
