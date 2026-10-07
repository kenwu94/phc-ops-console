import { useState, type ReactNode } from "react";
import type { ActionView } from "../data/derive";
import { useStore } from "../store";
import { ACTION_LABEL, AgentChip, Avatar, Button, DomainDot, LevelBadge, StatusBadge, edgeFor, fmtDue } from "./ui";

/**
 * One action as a list row. Status and gate come from the governance layer via
 * derive(); this component only renders them and offers the decisions they allow.
 */
export function ActionCard({ view, onOpenItem, defaultOpen = false, showStatus = false }: {
  view: ActionView;
  onOpenItem?: (id: string) => void;
  defaultOpen?: boolean;
  /** Show the status word; the home queue omits it because every row there needs you. */
  showStatus?: boolean;
}) {
  const { dispatch, state, now, policy } = useStore();
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState("");
  const a = view.action;
  const item = state.workItems.get(a.workItemId);
  const due = fmtDue(item?.meta.deadline, now);
  const lowConfidence = a.confidence < policy.confidenceThreshold;
  const decide = (decision: "approved" | "rejected" | "handled_offline") =>
    dispatch({ type: "HumanDecision", actionId: a.id, decision, note: note.trim() || undefined });

  return (
    <div className="relative transition-colors hover:bg-paper/50">
      <span className={`absolute inset-y-0 left-0 w-1 ${edgeFor(view.status, view.gate.level)}`} aria-hidden />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-3 pl-5">
        <Avatar a={a.agent} />
        <div className="min-w-0 flex-1">
          {onOpenItem && item ? (
            <button onClick={() => onOpenItem(item.meta.id)} className="text-left font-bold text-ink hover:underline">
              {a.summary}
            </button>
          ) : (
            <p className="font-bold text-ink">{a.summary}</p>
          )}
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
            <DomainDot d={a.domain} />
            <AgentChip a={a.agent} />
            {/* On a case page the case's due date is already in the header. */}
            {due && onOpenItem && <span className={due.cls}>{due.text}</span>}
            {lowConfidence && <span className="font-bold text-approve">Agent is {Math.round(a.confidence * 100)}% sure</span>}
            {a.unresolved.length > 0 && (
              <span className="text-muted">
                {a.unresolved.length} open question{a.unresolved.length > 1 ? "s" : ""}
              </span>
            )}
            {showStatus && <StatusBadge s={view.status} />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {view.status === "awaiting_human" && (
            <>
              <Button kind="primary" onClick={() => decide("approved")}>Approve</Button>
              <Button kind="danger" onClick={() => decide("rejected")}>Reject</Button>
            </>
          )}
          {view.status === "human_only" && (
            <>
              <Button kind="secondary" onClick={() => decide("handled_offline")} title="A person did this; record it">
                Mark done by staff
              </Button>
              <Button kind="danger" onClick={() => decide("rejected")}>Dismiss</Button>
            </>
          )}
          <Button kind="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Details"}</Button>
        </div>
      </div>
      {open && <Details view={view} note={note} setNote={setNote} />}
    </div>
  );
}

function Details({ view, note, setNote }: { view: ActionView; note: string; setNote: (s: string) => void }) {
  const a = view.action;
  const decisive = view.gate.rules.filter((r) => r.level === view.gate.level);
  const needsDecision = view.status === "awaiting_human" || view.status === "human_only";
  return (
    <div className="grid gap-5 border-t border-line bg-paper/60 py-4 pr-4 pl-[4.25rem] text-sm md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Field label="Why the agent proposed this">{a.rationale}</Field>
        {a.unresolved.length > 0 && (
          <Field label="Open questions">
            <ul className="list-disc space-y-0.5 pl-4">{a.unresolved.map((u) => <li key={u}>{u}</li>)}</ul>
          </Field>
        )}
        <Field label="Evidence">
          <ul className="space-y-1">
            {a.evidence.map((e) => (
              <li key={e.ref}>
                {e.label} <code className="ml-1 font-mono text-xs text-faint">{e.ref}</code>
              </li>
            ))}
            {a.evidence.length === 0 && <li className="font-bold text-human">No evidence attached</li>}
          </ul>
        </Field>
      </div>
      <div className="flex flex-col gap-4">
        <Field label={<span className="flex items-center gap-2">Why it needs you <LevelBadge l={view.gate.level} /></span>}>
          <ul className="space-y-1">
            {decisive.map((r) => <li key={r.id}>{r.description}</li>)}
          </ul>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">All {view.gate.rules.length} rules checked ({ACTION_LABEL[a.type]})</summary>
            <ul className="mt-1 space-y-1">
              {view.gate.rules.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <code className="w-36 shrink-0 font-mono">{r.id}</code>
                  <span>{r.description}</span>
                </li>
              ))}
            </ul>
          </details>
        </Field>
        {view.humanNote && <Field label="Your note">{view.humanNote}</Field>}
        {needsDecision && (
          <Field label={<label htmlFor={`note-${a.id}`}>Note for the record (optional)</label>}>
            <input
              id={`note-${a.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Called P-0877, Thursday works"
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </Field>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div>
    <div className="mb-1 text-sm font-bold text-muted">{label}</div>
    <div className="text-ink">{children}</div>
  </div>
);
