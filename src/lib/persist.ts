import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const NS = "vcap.";

/**
 * localStorage-backed state so a page refresh never loses an assessment.
 * All keys are namespaced (`vcap.*`) to avoid collisions on shared hosts.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = NS + key;
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // storage unavailable (private mode, quota) — non-fatal
    }
  }, [storageKey, state]);

  return [state, setState];
}
