import { Target, Crosshair, Radar, Activity } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import ConfusionMatrix from "@/components/charts/ConfusionMatrix";
import RocCurve from "@/components/charts/RocCurve";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataStore } from "@/store/dataStore";
import { formatPercent } from "@/lib/utils";

export default function ModelMetrics() {
  const aggregated = useDataStore((s) => s.aggregated);
  const source = useDataStore((s) => s.source);
  if (!aggregated) return null;
  const metrics = source === "train" ? aggregated.metricsTrain : aggregated.metricsEval;

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Evaluation metrics unavailable</CardTitle>
          <CardDescription>
            Evaluation data has no ground-truth labels in this dataset. Switch the header toggle to "Training data" to
            view metrics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Accuracy" value={formatPercent(metrics.accuracy)} icon={Target} accent="success" />
        <MetricCard label="Precision" value={formatPercent(metrics.precision)} icon={Crosshair} accent="primary" />
        <MetricCard label="Recall" value={formatPercent(metrics.recall)} icon={Radar} accent="warning" />
        <MetricCard label="F1 score" value={formatPercent(metrics.f1)} icon={Activity} accent="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConfusionMatrix metrics={metrics} description={`${source === "train" ? "Training" : "Evaluation"} data`} />
        {metrics.rocCurve && metrics.rocCurve.length > 0 ? (
          <RocCurve metrics={metrics} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Rate breakdown</CardTitle>
              <CardDescription>True/False positive rates and related ratios</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <RateRow label="True Positive Rate" value={metrics.tpr} good />
              <RateRow label="False Positive Rate" value={metrics.fpr} bad />
              <RateRow label="True Negative Rate" value={1 - metrics.fpr} good />
              <RateRow label="False Negative Rate" value={1 - metrics.tpr} bad />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interpretation</CardTitle>
          <CardDescription>What these numbers mean for IBM reviewers</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Precision</strong> — of the transactions we flagged as fraud, how many
            actually were. Low precision means a lot of false alarms, costly for customer experience.
          </p>
          <p>
            <strong className="text-foreground">Recall</strong> — of actual fraud events, how many we caught. Low recall
            means money slipping through.
          </p>
          <p>
            <strong className="text-foreground">F1</strong> — harmonic mean of the two, a good single-number summary
            when the classes are as imbalanced as fraud detection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RateRow({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={good ? "font-semibold text-success" : bad ? "font-semibold text-destructive" : "font-semibold"}>
        {formatPercent(value)}
      </span>
    </div>
  );
}
