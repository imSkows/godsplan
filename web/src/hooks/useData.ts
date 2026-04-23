import { useEffect } from "react";
import { useDataStore } from "@/store/dataStore";

export function useEnsureTransactions() {
  const status = useDataStore((s) => s.status);
  const loaded = useDataStore((s) => s.trainTransactions.length > 0);
  const load = useDataStore((s) => s.loadTransactions);
  useEffect(() => {
    if (status === "ready" && !loaded) void load();
  }, [status, loaded, load]);
  return { ready: status === "ready" && loaded };
}
