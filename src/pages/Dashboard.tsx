import { useMemo } from "react";
import { CreditCard, ShieldAlert, Target, AlertTriangle } from "lucide-react";
import MetricCard from "@/components/shared/MetricCard";
import FraudByDateChart from "@/components/charts/FraudByDateChart";
import FraudByStateChart from "@/components/charts/FraudByStateChart";
import AmountHistogram from "@/components/charts/AmountHistogram";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataStore } from "@/store/dataStore";
import { formatNumber, formatPercent, formatCurrency } from "@/lib/utils";

export default function Dashboard() {
  const aggregated = useDataStore((s) => s.aggregated);
  const source = useDataStore((s) => s.source);

  const metrics = useMemo(() => {
    if (!aggregated) return null;
    return source === "train" ? aggregated.metricsTrain : aggregated.metricsEval;
  }, [aggregated, source]);

  if (!aggregated) return null;
  const { summary } = aggregated;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total transactions"
          value={formatNumber(summary.totalTransactions + summary.totalEvaluation)}
          sub={`${formatNumber(summary.totalTransactions)} train + ${formatNumber(summary.totalEvaluation)} eval`}
          icon={CreditCard}
          accent="primary"
        />
        <MetricCard
          label="Fraud count (train)"
          value={formatNumber(summary.fraudCount)}
          sub={`${formatPercent(summary.fraudRate, 3)} of training`}
          icon={ShieldAlert}
          accent="destructive"
        />
        <MetricCard
          label={source === "train" ? "Model accuracy (train)" : "Model accuracy (eval)"}
          value={metrics ? formatPercent(metrics.accuracy) : "—"}
          sub={metrics ? `F1 ${formatPercent(metrics.f1)}` : "Awaiting labels"}
          icon={Target}
          accent="success"
        />
        <MetricCard
          label="Total volume"
          value={formatCurrency(summary.totalAmount)}
          sub={`${summary.dateRange.min.slice(0, 10)} → ${summary.dateRange.max.slice(0, 10)}`}
          icon={AlertTriangle}
          accent="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FraudByDateChart data={aggregated.fraudByDate} description="Monthly fraud count vs total transactions" />
        <FraudByStateChart data={aggregated.fraudByState} />
      </div>

      <AmountHistogram data={aggregated.amountHistogram} />

      <Card>
        <CardHeader>
          <CardTitle>Generalization note</CardTitle>
          <CardDescription>
            Evaluation transactions belong to clients never seen in training. The toggle in the header switches metrics &
            summary views between the two sets so you can spot performance drift.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Keep an eye on the gap between training-set accuracy and evaluation-set accuracy — a large gap signals the
          model is memorizing client-specific patterns instead of learning generalizable fraud signals.
        </CardContent>
      </Card>
    </div>
  );
}
