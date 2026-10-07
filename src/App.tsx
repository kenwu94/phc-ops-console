import { useState } from "react";
import { StoreContext, useStoreRoot } from "./store";
import { CommandCenter } from "./pages/CommandCenter";
import { WorkItemDetail } from "./pages/WorkItemDetail";
import { AgentsPolicy } from "./pages/AgentsPolicy";
import { EvalReport } from "./pages/EvalReport";
import { fmtTime } from "./components/ui";

type View = { page: "home" } | { page: "item"; id: string } | { page: "agents" } | { page: "eval" };

export default function App() {
  const store = useStoreRoot();
  const [view, setView] = useState<View>({ page: "home" });
  const openItem = (id: string) => {
    setView({ page: "item", id });
    window.scrollTo({ top: 0 });
  };

  const tab = (p: "home" | "agents" | "eval", label: string) => {
    const active = view.page === p || (p === "home" && view.page === "item");
    return (
      <button
        onClick={() => setView({ page: p })}
        aria-current={active}
        className={`border-b-2 py-3 text-sm font-bold transition-colors ${active ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <StoreContext.Provider value={store}>
      <header className="sticky top-0 z-10 bg-accent">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 sm:px-6">
          <span className="py-3 font-bold text-white">PHC Operations</span>
          <nav className="flex gap-6">
            {tab("home", "Today")}
            {tab("agents", "Agents and rules")}
            {tab("eval", "Triage evaluation")}
          </nav>
          <button onClick={store.reset} className="ml-auto py-3 text-sm text-white/60 hover:text-white">
            Reset demo
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {view.page === "home" && <CommandCenter onOpenItem={openItem} />}
        {view.page === "item" && <WorkItemDetail id={view.id} onBack={() => setView({ page: "home" })} onOpenItem={openItem} />}
        {view.page === "agents" && <AgentsPolicy />}
        {view.page === "eval" && <EvalReport />}
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 pb-10 text-xs text-faint sm:px-6">
        <span>Prototype with synthetic data. Agents are simulated; the approval rules, ownership and conflict checks are real and tested.</span>
        <span>Demo clock {fmtTime(store.now)}</span>
        <span>{store.log.length} events in the audit log</span>
      </footer>
    </StoreContext.Provider>
  );
}
