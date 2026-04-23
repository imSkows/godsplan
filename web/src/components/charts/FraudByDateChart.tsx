import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tooltipStyle } from "./tooltipStyle";

interface Props {
  data: { date: string; fraud: number; total: number }[];
  title?: string;
  description?: string;
}

export default function FraudByDateChart({ data, title = "Fraud trend over time", description }: Props) {
  // aggregate per month for readability
  const byMonth = new Map<string, { fraud: number; total: number }>();
  for (const row of data) {
    const key = row.date.slice(0, 7);
    const cur = byMonth.get(key) ?? { fraud: 0, total: 0 };
    cur.fraud += row.fraud;
    cur.total += row.total;
    byMonth.set(key, cur);
  }
  const chartData = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, fraud: v.fraud, total: v.total }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground) / 0.5)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground) / 0.5)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
              <Line type="monotone" dataKey="fraud" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ fill: "hsl(var(--destructive))", r: 3 }} activeDot={{ r: 5 }} name="Fraud count" />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 2.5 }} activeDot={{ r: 4 }} name="Total transactions" strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
