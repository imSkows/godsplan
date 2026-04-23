import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type JobSnapshot } from "@/lib/api";
import { useDataStore } from "@/store/dataStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RunInferenceDialog({ open, onOpenChange }: Props) {
  const [status, setStatus] = useState<JobSnapshot | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const logsEnd = useRef<HTMLDivElement>(null);
  const bootstrap = useDataStore((s) => s.bootstrap);

  const refresh = async () => {
    try {
      const [s, l] = await Promise.all([api.status(), api.logs(0)]);
      setStatus(s);
      setLogs(l.lines);
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const interval = setInterval(async () => {
      const s = await refresh();
      if (s && s.status !== "running") {
        clearInterval(interval);
        if (s.status === "completed") {
          try {
            await bootstrap();
          } catch {
            /* ignore */
          }
        }
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [open, bootstrap]);

  // Client-side timer: ticks every second while running
  useEffect(() => {
    const isRunningNow = status?.status === "running";
    if (isRunningNow) {
      if (startRef.current == null) {
        startRef.current = status?.started_at ? status.started_at * 1000 : Date.now();
      }
      const tick = () => setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }
    if (status?.duration != null) {
      setElapsed(Math.round(status.duration));
    }
    startRef.current = null;
  }, [status?.status, status?.started_at, status?.duration]);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = async () => {
    setError(null);
    setLaunching(true);
    startRef.current = Date.now();
    setElapsed(0);
    try {
      await api.run({ no_optuna: false });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const isRunning = status?.status === "running";
  const isCompleted = status?.status === "completed";
  const isFailed = status?.status === "failed";
  const fmtTime = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run Pipeline
            {isRunning && <Badge variant="warning">Running</Badge>}
            {isCompleted && <Badge variant="success">Completed</Badge>}
            {isFailed && <Badge variant="destructive">Failed</Badge>}
            {status?.status === "idle" && <Badge variant="outline">Idle</Badge>}
          </DialogTitle>
          <DialogDescription>
            Trains on the training set, evaluates on the test set, then exports the
            submission and dashboard predictions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 py-2">
          <div className="text-sm text-muted-foreground min-h-[20px]">
            {isRunning && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {status?.current_step || "Running..."}
                <span className="tabular-nums opacity-70">· {fmtTime}</span>
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Completed in {fmtTime}
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {status?.error ?? "Pipeline failed"}
              </span>
            )}
          </div>
          <Button
            onClick={handleRun}
            disabled={isRunning || launching}
            variant="outline"
            className="bg-white"
            size="sm"
          >
            {isRunning || launching ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isRunning ? "Running..." : "Run"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-md border bg-slate-950 text-slate-100 font-mono text-xs overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] uppercase tracking-widest text-slate-400">
            Live logs
          </div>
          <div className="max-h-[360px] overflow-y-auto px-3 py-2 space-y-0.5">
            {logs.length === 0 && (
              <div className="text-slate-500 italic">
                No run yet. Click "Run" to trigger the pipeline.
              </div>
            )}
            {logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("error") || line.includes("ERROR")
                    ? "text-destructive whitespace-pre-wrap"
                    : line.startsWith("$")
                      ? "text-primary/90 whitespace-pre-wrap"
                      : line.includes("Submission saved") || line.includes("predictions")
                        ? "text-emerald-400 whitespace-pre-wrap"
                        : "whitespace-pre-wrap"
                }
              >
                {line}
              </div>
            ))}
            <div ref={logsEnd} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
