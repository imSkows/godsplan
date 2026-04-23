import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tooltipStyle } from "./tooltipStyle";
import type { MetricsData } from "@/types";

export default function RocCurve({ metrics }: { metrics: MetricsData }) {
  const curve = metrics.rocCurve ?? [];
  // Compute AUC trapezoidal from sorted points
  const sorted = [...curve].sort((a, b) => a.fpr - b.fpr);
  let auc = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i].fpr - sorted[i - 1].fpr;
    const avg = (sorted[i].tpr + sorted[i - 1].tpr) / 2;
    auc += dx * avg;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ROC Curve</CardTitle>
        <CardDescription>
          AUC ≈ {auc.toFixed(3)} — tradeoff between TPR and FPR across thresholds
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sorted} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="fpr"
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                tick={{ fontSize: 11 }}
                label={{ value: "FPR", position: "insideBottom", offset: -2, fontSize: 11 }}
              />
              <YAxis
                dataKey="tpr"
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                tick={{ fontSize: 11 }}
                label={{ value: "TPR", angle: -90, position: "insideLeft", fontSize: 11 }}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toFixed(3)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="tpr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
