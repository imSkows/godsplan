import { NavLink } from "react-router-dom";
import { BarChart3, Gauge, GitCompare, Search, Lightbulb, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/metrics", label: "Model Metrics", icon: Gauge },
  { to: "/predictions", label: "Predictions vs Truth", icon: GitCompare },
  { to: "/transactions", label: "Transaction Search", icon: Search },
  { to: "/insights", label: "Insights", icon: Lightbulb },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 flex-col h-screen sticky top-0 p-3">
      <div className="glass flex flex-col h-full rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25">
            <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none text-foreground">FraudGuard</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80 mt-1 font-medium">IBM · Hackathon</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-primary/12 to-primary/6 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)] shadow-sm"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground hover:shadow-sm"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <it.icon className={cn("h-[18px] w-[18px] transition-all duration-200 group-hover:scale-110", isActive && "text-primary drop-shadow-sm")} strokeWidth={2.5} />
                  <span className="tracking-tight">{it.label}</span>
                  {isActive && (
                    <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.4)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-border/50 text-[11px] text-muted-foreground bg-gradient-to-t from-muted/30 to-transparent">
          <div className="font-semibold text-foreground/90 mb-0.5">Fraud Detection Demo</div>
          <div className="opacity-75">210k tx · 2016–2018</div>
        </div>
      </div>
    </aside>
  );
}
