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
  primary: "bg-gradient-to-br from-primary/18 to-primary/6 text-primary ring-1 ring-inset ring-primary/20 shadow-sm shadow-primary/10",
  success: "bg-gradient-to-br from-success/18 to-success/6 text-success ring-1 ring-inset ring-success/20 shadow-sm shadow-success/10",
  warning: "bg-gradient-to-br from-warning/22 to-warning/7 text-warning ring-1 ring-inset ring-warning/25 shadow-sm shadow-warning/12",
  destructive: "bg-gradient-to-br from-destructive/18 to-destructive/6 text-destructive ring-1 ring-inset ring-destructive/20 shadow-sm shadow-destructive/10",
  muted: "bg-gradient-to-br from-muted to-muted/80 text-muted-foreground ring-1 ring-inset ring-border/50",
};

export default function MetricCard({ label, value, sub, icon: Icon, accent = "primary" }: Props) {
  return (
    <Card className="group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/90 font-semibold">{label}</div>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground/80 truncate">{sub}</div>}
          </div>
          {Icon && (
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3", accents[accent])}>
              <Icon className="h-5 w-5" strokeWidth={2.5} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
