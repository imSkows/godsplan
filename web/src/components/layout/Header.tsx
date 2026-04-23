import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import ThemeToggle from "@/components/shared/ThemeToggle";
import SourceToggle from "@/components/shared/SourceToggle";
import { useDataStore } from "@/store/dataStore";

const titles: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard Overview", sub: "Key metrics & fraud activity at a glance" },
  "/metrics": { title: "Model Performance Metrics", sub: "Accuracy, confusion matrix, ROC" },
  "/predictions": { title: "Predictions vs Ground Truth", sub: "Inspect where the model got it right — and wrong" },
  "/transactions": { title: "Transaction Search", sub: "Explore individual transactions & profiles" },
  "/insights": { title: "Fraud Insights", sub: "Segment fraud by demographics, time & geography" },
};

export default function Header() {
  const { pathname } = useLocation();
  const predictionsAvailable = useDataStore((s) => s.predictionsAvailable);
  const t = titles[pathname] ?? { title: "Dashboard", sub: "" };

  return (
    <header className="sticky top-0 z-30 px-4 md:px-6 pt-3 pb-2">
      <div className="glass-strong flex items-center gap-4 px-6 h-16 rounded-2xl shadow-lg">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight truncate">{t.title}</h1>
          <p className="text-xs text-muted-foreground/90 truncate mt-0.5">{t.sub}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={predictionsAvailable ? "success" : "outline"} className="hidden sm:inline-flex shadow-sm">
            {predictionsAvailable ? "Predictions loaded" : "Mock predictions"}
          </Badge>
          <SourceToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
