import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive" | "muted";
}

const accents: Record<NonNullable<Props["accent"]>, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export default function MetricCard({ label, value, sub, icon: Icon, accent = "primary" }: Props) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/90 font-semibold">{label}</div>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground/80 truncate">{sub}</div>}
          </div>
          {Icon && (
            <div className={cn("flex h-11 w-11 items-center justify-center shrink-0", accents[accent])}>
              <Icon className="h-6 w-6" strokeWidth={1.5} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
