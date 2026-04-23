import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tooltipStyle } from "./tooltipStyle";

interface Props {
  data: { state: string; fraud: number; total: number; rate: number }[];
  limit?: number;
  title?: string;
  description?: string;
  metric?: "fraud" | "rate";
}

export default function FraudByStateChart({
  data,
  limit = 10,
  title = "Top 10 states by fraud count",
  description,
  metric = "fraud",
}: Props) {
  const chartData = [...data]
    .sort((a, b) => (metric === "rate" ? b.rate - a.rate : b.fraud - a.fraud))
    .slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="state" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name) => {
                  if (name === "rate") return [`${(v * 100).toFixed(2)}%`, "Fraud rate"];
                  return [v, name];
                }}
              />
              <Bar
                dataKey={metric}
                fill="hsl(var(--primary))"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
