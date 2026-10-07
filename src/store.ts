import { createContext, useContext, useMemo, useReducer } from "react";
import {
  DEFAULT_POLICY,
  setMatrixCell,
  type ActionType,
  type AutonomyLevel,
  type Domain,
  type PolicyConfig,
} from "./governance";
import { derive, type DerivedState } from "./data/derive";
import { append, type NewEvent, type PhcEvent } from "./data/events";
import { NOW, SEED_EVENTS } from "./data/seed";

interface StoreState {
  log: PhcEvent[];
  policy: PolicyConfig;
  /** Simulated clock: each human action advances it by one minute. */
  clock: string;
}

type Msg =
  | { type: "append"; event: NewEvent }
  | { type: "setCell"; domain: Domain; actionType: ActionType; level: AutonomyLevel }
  | { type: "reset" };

const tick = (iso: string) => new Date(new Date(iso).getTime() + 60_000).toISOString().slice(0, 19);

const initial: StoreState = { log: SEED_EVENTS, policy: DEFAULT_POLICY, clock: NOW };

function reducer(s: StoreState, m: Msg): StoreState {
  switch (m.type) {
    case "append": {
      const clock = tick(s.clock);
      return { ...s, clock, log: append(s.log, m.event, clock) };
    }
    case "setCell":
      return { ...s, policy: { ...s.policy, matrix: setMatrixCell(s.policy.matrix, m.domain, m.actionType, m.level) } };
    case "reset":
      return initial;
  }
}

export interface Store {
  log: PhcEvent[];
  policy: PolicyConfig;
  state: DerivedState;
  now: string;
  dispatch: (e: NewEvent) => void;
  setCell: (domain: Domain, actionType: ActionType, level: AutonomyLevel) => void;
  reset: () => void;
}

export function useStoreRoot(): Store {
  const [s, send] = useReducer(reducer, initial);
  const state = useMemo(() => derive(s.log, s.policy, NOW), [s.log, s.policy]);
  return {
    log: s.log,
    policy: s.policy,
    state,
    now: s.clock,
    dispatch: (event) => send({ type: "append", event }),
    setCell: (domain, actionType, level) => send({ type: "setCell", domain, actionType, level }),
    reset: () => send({ type: "reset" }),
  };
}

export const StoreContext = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside StoreContext");
  return s;
};
