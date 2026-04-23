import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import FraudByStateChart from "@/components/charts/FraudByStateChart";
import { tooltipStyle } from "@/components/charts/tooltipStyle";
import { useDataStore } from "@/store/dataStore";
import { formatPercent, formatNumber } from "@/lib/utils";

export default function Insights() {
  const aggregated = useDataStore((s) => s.aggregated);
  if (!aggregated) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FraudByStateChart
          data={aggregated.fraudByState}
          metric="rate"
          title="Top 10 states by fraud rate"
          description="Rate = fraud / total transactions in that state"
          limit={10}
        />
        <TopByRateChart
          title="Top 10 merchant categories by fraud rate"
          description="MCC categories with highest proportion of fraud (min 1,000 tx)"
          data={aggregated.fraudByMcc.filter((d) => d.total >= 1000).slice(0, 10)}
          keyField="label"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Histogram
          title="Fraud by age group"
          description="Proportion of fraudulent tx in each group"
          data={aggregated.fraudByAgeGroup.map((d) => ({ label: d.group, value: d.rate, total: d.total }))}
        />
        <Histogram
          title="Fraud by income bracket"
          description="Yearly income bucket"
          data={aggregated.fraudByIncomeBracket.map((d) => ({ label: d.bracket, value: d.rate, total: d.total }))}
        />
        <Histogram
          title="Fraud by credit score"
          description="FICO range bucket"
          data={aggregated.fraudByCreditScore.map((d) => ({ label: d.range, value: d.rate, total: d.total }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TemporalChart
          title="Fraud by day of week"
          data={aggregated.fraudByDayOfWeek.map((d) => ({
            label: d.day,
            rate: d.total ? d.fraud / d.total : 0,
            total: d.total,
          }))}
        />
        <TemporalChart
          title="Fraud by hour of day"
          data={aggregated.fraudByHour.map((d) => ({
            label: String(d.hour).padStart(2, "0"),
            rate: d.total ? d.fraud / d.total : 0,
            total: d.total,
          }))}
        />
        <TemporalChart
          title="Fraud by month"
          data={aggregated.fraudByMonth.map((d) => ({
            label: d.month.slice(5),
            rate: d.total ? d.fraud / d.total : 0,
            total: d.total,
          }))}
        />
      </div>
    </div>
  );
}

function Histogram({
  title,
  description,
  data,
}: {
  title: string;
  description?: string;
  data: { label: string; value: number; total: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name, entry) => {
                  if (name === "value") {
                    const total = (entry?.payload as { total?: number })?.total ?? 0;
                    return [`${(v * 100).toFixed(3)}% (${formatNumber(total)} tx)`, "Fraud rate"];
                  }
                  return [v, name];
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function TemporalChart({ title, data }: { title: string; data: { label: string; rate: number; total: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatPercent(v, 3)}
              />
              <Bar dataKey="rate" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function TopByRateChart({
  title,
  description,
  data,
  keyField,
}: {
  title: string;
  description?: string;
  data: { label?: string; mcc?: string; rate: number; total: number }[];
  keyField: "label" | "mcc";
}) {
  const formatted = data.map((d) => ({ name: (keyField === "label" ? d.label : d.mcc) ?? "—", rate: d.rate, total: d.total }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatPercent(v, 3)}
              />
              <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
