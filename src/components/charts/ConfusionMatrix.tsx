import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { MetricsData } from "@/types";

interface Props {
  metrics: MetricsData;
  title?: string;
  description?: string;
}

export default function ConfusionMatrix({ metrics, title = "Confusion Matrix", description }: Props) {
  const { tp, fp, tn, fn, total } = metrics;
  const cell = "flex flex-col items-center justify-center rounded-md p-4 text-center min-h-[92px]";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs text-muted-foreground">
          <div />
          <div className="text-center font-semibold">Predicted: Legit</div>
          <div className="text-center font-semibold">Predicted: Fraud</div>

          <div className="flex items-center font-semibold">Actual: Legit</div>
          <div className={`${cell} bg-success/15 border border-success/30`}>
            <div className="text-xs text-muted-foreground">TN</div>
            <div className="text-xl font-bold text-success">{formatNumber(tn)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(tn / total)}</div>
          </div>
          <div className={`${cell} bg-warning/15 border border-warning/30`}>
            <div className="text-xs text-muted-foreground">FP</div>
            <div className="text-xl font-bold text-warning">{formatNumber(fp)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(fp / total)}</div>
          </div>

          <div className="flex items-center font-semibold">Actual: Fraud</div>
          <div className={`${cell} bg-destructive/15 border border-destructive/30`}>
            <div className="text-xs text-muted-foreground">FN</div>
            <div className="text-xl font-bold text-destructive">{formatNumber(fn)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(fn / total)}</div>
          </div>
          <div className={`${cell} bg-primary/15 border border-primary/30`}>
            <div className="text-xs text-muted-foreground">TP</div>
            <div className="text-xl font-bold text-primary">{formatNumber(tp)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(tp / total)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
