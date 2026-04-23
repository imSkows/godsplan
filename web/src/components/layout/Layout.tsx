import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useDataStore } from "@/store/dataStore";

export default function Layout() {
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const progress = useDataStore((s) => s.progress);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 px-4 md:px-8 pt-6 pb-12 space-y-8">
          {status === "loading" && <LoadingScreen message={progress || "Loading..."} />}
          {status === "error" && (
            <div className="glass rounded-xl border border-destructive/20 bg-destructive/5 p-6">
              <div className="font-semibold text-destructive">Failed to load data</div>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <p className="text-xs text-muted-foreground mt-3">
                Run <code className="px-1 py-0.5 rounded bg-muted">npm run prepare-data</code> to generate data files.
              </p>
            </div>
          )}
          {status === "ready" && <Outlet />}
        </main>
      </div>
    </div>
  );
}
