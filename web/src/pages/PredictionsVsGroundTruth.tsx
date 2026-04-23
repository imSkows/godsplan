import { useMemo, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tooltipStyle } from "@/components/charts/tooltipStyle";
import TransactionDetail from "@/components/shared/TransactionDetail";
import { useEnsureTransactions } from "@/hooks/useData";
import { useDataStore } from "@/store/dataStore";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { Transaction } from "@/types";
import LoadingScreen from "@/components/shared/LoadingScreen";

type Filter = "fp" | "fn" | "tp" | "tn";

export default function PredictionsVsGroundTruth() {
  const { ready } = useEnsureTransactions();
  const train = useDataStore((s) => s.trainTransactions);
  const labels = useDataStore((s) => s.fraudLabels);
  const predictions = useDataStore((s) => s.predictions);
  const [filter, setFilter] = useState<Filter>("fp");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const bucketed = useMemo(() => {
    const result = { tp: [] as Transaction[], fp: [] as Transaction[], tn: [] as Transaction[], fn: [] as Transaction[] };
    if (!ready) return result;
    for (const tx of train) {
      const actual = labels[tx.transaction_id] === "Yes";
      const pred = predictions[tx.transaction_id]?.predicted_fraud ?? false;
      if (actual && pred) result.tp.push(tx);
      else if (!actual && pred) result.fp.push(tx);
      else if (!actual && !pred) result.tn.push(tx);
      else result.fn.push(tx);
    }
    return result;
  }, [train, labels, predictions, ready]);

  const scatterData = useMemo(() => {
    const rows = bucketed[filter];
    return rows.slice(0, 2000).map((tx) => ({
      x: new Date(tx.date.replace(" ", "T")).getTime(),
      y: tx.amount,
      transaction_id: tx.transaction_id,
      prob: predictions[tx.transaction_id]?.probability ?? 0,
    }));
  }, [bucketed, filter, predictions]);

  if (!ready) return <LoadingScreen message="Loading transactions & labels…" />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <BucketCard label="True Positives" count={bucketed.tp.length} color="muted" active={filter === "tp"} onClick={() => setFilter("tp")} />
        <BucketCard label="False Positives" count={bucketed.fp.length} color="warning" active={filter === "fp"} onClick={() => setFilter("fp")} />
        <BucketCard label="False Negatives" count={bucketed.fn.length} color="destructive" active={filter === "fn"} onClick={() => setFilter("fn")} />
        <BucketCard label="True Negatives" count={bucketed.tn.length} color="muted" active={filter === "tn"} onClick={() => setFilter("tn")} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Amount vs Date — {filterLabel(filter)}</CardTitle>
            <CardDescription>
              Showing up to 2,000 samples. Click a row in the table below to inspect full transaction.
            </CardDescription>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="fp">FP</TabsTrigger>
              <TabsTrigger value="fn">FN</TabsTrigger>
              <TabsTrigger value="tp">TP</TabsTrigger>
              <TabsTrigger value="tn">TN</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { year: "2-digit", month: "short" })}
                />
                <YAxis dataKey="y" type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <ZAxis dataKey="prob" range={[30, 240]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number | string, key) => {
                    if (key === "x") return [new Date(v as number).toLocaleDateString(), "Date"];
                    if (key === "y") return [`$${v}`, "Amount"];
                    if (key === "prob") return [(v as number).toFixed(3), "Prob."];
                    return [v, key];
                  }}
                />
                <Scatter data={scatterData} fill={scatterColor(filter)} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filterLabel(filter)} — sample rows</CardTitle>
          <CardDescription>First 50 rows. Click any row to view full transaction details.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[480px] border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2">Transaction</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-left p-2">Merchant</th>
                  <th className="text-right p-2">P(fraud)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bucketed[filter].slice(0, 50).map((tx) => {
                  const p = predictions[tx.transaction_id]?.probability ?? 0;
                  return (
                    <tr key={tx.transaction_id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={() => setSelected(tx)}>
                      <td className="p-2 font-mono text-xs">{tx.transaction_id}</td>
                      <td className="p-2">{formatDate(tx.date)}</td>
                      <td className="p-2 text-right">{formatCurrency(tx.amount)}</td>
                      <td className="p-2">
                        {tx.merchant_city}, {tx.merchant_state}
                      </td>
                      <td className="p-2 text-right">{p.toFixed(3)}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost">View</Button>
                      </td>
                    </tr>
                  );
                })}
                {bucketed[filter].length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      No transactions in this bucket.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Total in bucket: {formatNumber(bucketed[filter].length)}
          </div>
        </CardContent>
      </Card>

      <TransactionDetail open={!!selected} onOpenChange={(o) => !o && setSelected(null)} tx={selected} isTraining />
    </div>
  );
}

function filterLabel(f: Filter) {
  return { tp: "True Positives", fp: "False Positives", tn: "True Negatives", fn: "False Negatives" }[f];
}
function scatterColor(f: Filter) {
  return {
    tp: "hsl(var(--muted-foreground))",
    fp: "hsl(var(--warning))",
    tn: "hsl(var(--muted-foreground))",
    fn: "hsl(var(--destructive))",
  }[f];
}

function BucketCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`glass text-left rounded-xl p-5 ${active ? "border-foreground/30 bg-white/80" : ""}`}
    >
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1 tracking-tight">{formatNumber(count)}</div>
      <Badge variant="secondary" className="mt-2">
        {label.split(" ").map((w) => w[0]).join("")}
      </Badge>
    </button>
  );
}
