import { readFileSync } from "node:fs";
import { z } from "zod";
import { ACTION_TYPES, DOMAINS } from "../src/governance/types";
import { TriageOutput } from "./schema";

export interface Provider {
  id: string;
  temperature: number;
  /** Returns the raw model text; parsing and validation happen in the harness, not here. */
  classify(request: string): Promise<string>;
}

export function loadPrompt(version: string): string {
  return readFileSync(new URL(`../prompts/triage.${version}.md`, import.meta.url), "utf8");
}

export function renderPrompt(template: string, request: string): string {
  return template
    .replace("{{DOMAINS}}", DOMAINS.join(", "))
    .replace("{{ACTION_TYPES}}", ACTION_TYPES.join(", "))
    .replace("{{REQUEST}}", request);
}

/** Local model via Ollama. Output is constrained by the same JSON schema the harness validates against. */
export function ollama(model: string, promptVersion: string, host = "http://localhost:11434"): Provider {
  const template = loadPrompt(promptVersion);
  const format = z.toJSONSchema(TriageOutput);
  return {
    id: `ollama:${model}`,
    temperature: 0,
    async classify(request) {
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format,
          options: { temperature: 0, seed: 42 },
          messages: [{ role: "user", content: renderPrompt(template, request) }],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { message: { content: string } };
      return body.message.content;
    },
  };
}

/**
 * Non-LLM baseline. If the model can't beat this, the model isn't earning its place.
 */
export function keywordBaseline(): Provider {
  const rules: Array<[RegExp, string, string]> = [
    [/\b(export|forward|share)\b.*\b(records?|data|history)\b|\bcount\b.*\bpatients?\b|\brequests?\b.*\bpatients\b/i, "research", "data_export"],
    [/\b(dose|dosing|increase|discontinue|stop)\b.*\b(mg|protocol|iron|magnesium)\b|\bchange\b.*\bprotocol\b/i, "clinical", "protocol_change"],
    [/\bcollections?\b/i, "finance", "collections_escalation"],
    [/\bpermission\b/i, "operations", "agent_permission_change"],
    [/\b(countersign|sign)\b/i, "partnerships", "contract_change"],
    [/\b(reach out|email|propos)\w*\b.*\b(lab|imaging|partner|renewal)\b/i, "partnerships", "external_outreach"],
    [/\bpay\b|\brefund\b/i, "finance", "payment"],
    [/\binvoice\b/i, "finance", "invoice_reconcile"],
    [/\breorder\b/i, "operations", "inventory_reorder"],
    [/\bsummar/i, "research", "literature_summary"],
    [/\bflag\b/i, "clinical", "lab_flag"],
    [/\bfile\b.*\bchart\b|\bpanel\b.*\b(received|file)\b/i, "clinical", "result_filing"],
    [/\bexplain|what it means\b/i, "clinical", "clinical_document_release"],
    [/\breminder|sms\b/i, "operations", "patient_communication"],
    [/\b(book|confirm|appointment|slot|pause)\b/i, "operations", "schedule_change"],
  ];
  return {
    id: "baseline:keywords",
    temperature: 0,
    async classify(request) {
      const hit = rules.find(([re]) => re.test(request));
      const amount = request.match(/\$\s?([\d,]+(?:\.\d+)?)/);
      return JSON.stringify({
        domain: hit?.[1] ?? "operations",
        actionType: hit?.[2] ?? "schedule_change",
        containsPhi: /\b(birth|health card|genetic|lab history|names)\b/i.test(request),
        external: /\b(partner|naturopath|external|email|lab|imaging|university|send)\b/i.test(request),
        amountCad: amount ? Number(amount[1].replace(/,/g, "")) : null,
        confidence: hit ? 0.8 : 0.3,
        rationale: hit ? `keyword ${hit[0].source.slice(0, 40)}` : "no rule matched",
      });
    },
  };
}
