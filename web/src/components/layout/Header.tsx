import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import RunInferenceDialog from "@/components/shared/RunInferenceDialog";

const titles: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard Overview", sub: "Key metrics & fraud activity at a glance" },
  "/metrics": { title: "Model Performance Metrics", sub: "Accuracy, confusion matrix, ROC" },
  "/predictions": { title: "Predictions vs Ground Truth", sub: "Inspect where the model got it right — and wrong" },
  "/transactions": { title: "Transaction Search", sub: "Explore individual transactions & profiles" },
  "/insights": { title: "Fraud Insights", sub: "Segment fraud by demographics, time & geography" },
};

export default function Header() {
  const { pathname } = useLocation();
  const t = titles[pathname] ?? { title: "Dashboard", sub: "" };
  const [runOpen, setRunOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 px-4 md:px-8 pt-4 pb-2">
      <div className="glass-strong flex items-center gap-4 px-6 h-16 rounded-xl">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight truncate">{t.title}</h1>
          <p className="text-xs text-muted-foreground/90 truncate mt-0.5">{t.sub}</p>
        </div>
        <Button size="sm" variant="outline" className="bg-white" onClick={() => setRunOpen(true)}>
          Run
        </Button>
      </div>
      <RunInferenceDialog open={runOpen} onOpenChange={setRunOpen} />
    </header>
  );
}
