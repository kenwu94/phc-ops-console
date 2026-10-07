/**
 * Triage eval runner.
 *   npm run eval -- --provider=ollama:qwen2.5:7b --prompt=v1
 *   npm run eval -- --provider=baseline --set=holdout
 * --set=dev (default) is the set the prompt/guard/baseline were developed against.
 * --set=holdout was written later and is never tuned against; report it as the honest number.
 * Writes eval/results/<provider>__<prompt>__<set>.json and updates eval/results/summary.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { keywordBaseline, ollama, type Provider } from "./providers";
import { EvalCase } from "./schema";
import { scoreCase, summarize, type CaseResult, type Summary } from "./score";

const arg = (name: string, dflt: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;

const providerArg = arg("provider", "baseline");
const promptVersion = arg("prompt", "v1");
const set = arg("set", "dev");
if (set !== "dev" && set !== "holdout") throw new Error(`--set must be dev or holdout, got ${set}`);

const provider: Provider = providerArg.startsWith("ollama:")
  ? ollama(providerArg.slice("ollama:".length), promptVersion)
  : keywordBaseline();

const cases = z.array(EvalCase).parse(JSON.parse(readFileSync(new URL(set === "dev" ? "./cases.json" : "./cases.holdout.json", import.meta.url), "utf8")));

const results: CaseResult[] = [];
for (const c of cases) {
  const t0 = performance.now();
  let raw: string;
  try {
    raw = await provider.classify(c.text);
  } catch (e) {
    raw = `<<provider error: ${(e as Error).message}>>`;
  }
  const r = scoreCase(c, raw, Math.round(performance.now() - t0));
  results.push(r);
  const mark = r.unsafeAfterGuard ? "UNSAFE" : r.unsafeBeforeGuard ? "caught" : r.valid ? "ok" : "invalid";
  console.log(
    `${c.id.padEnd(4)} ${mark.padEnd(8)} truth=${r.truthGate.padEnd(10)} model=${r.modelGate.padEnd(10)} final=${r.finalGate.padEnd(10)} ` +
      `${r.output ? `${r.output.domain}/${r.output.actionType} conf=${r.output.confidence}` : r.error}`,
  );
}

const usesPrompt = provider.id.startsWith("ollama:");
const summary = summarize(results, set, {
  provider: provider.id,
  promptVersion: usesPrompt ? promptVersion : "n/a",
  temperature: provider.temperature,
  ranAt: new Date().toISOString(),
});

const dir = new URL("./results/", import.meta.url);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const slug = `${provider.id}__${summary.promptVersion}__${set}`.replace(/[^\w.-]+/g, "_");
writeFileSync(new URL(`${slug}.json`, dir), JSON.stringify({ summary, results }, null, 2));

const summaryPath = new URL("summary.json", dir);
const all: Summary[] = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, "utf8")) : [];
const merged = [...all.filter((s) => !(s.provider === summary.provider && s.promptVersion === summary.promptVersion && s.set === set)), summary];
writeFileSync(summaryPath, JSON.stringify(merged, null, 2));

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`\n${provider.id} prompt=${summary.promptVersion} n=${summary.n}`);
console.log(
  `  domain ${pct(summary.domainAccuracy)} | type ${pct(summary.actionTypeAccuracy)} | invalid ${pct(summary.invalidRate)} | ` +
    `unsafe before guard ${summary.unsafeBeforeGuard} -> after guard ${summary.unsafeAfterGuard} | over-escalated ${pct(summary.overEscalationRate)} | overconfident ${summary.overconfident} | ${summary.meanLatencyMs}ms avg`,
);
