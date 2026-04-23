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
    <aside className="hidden md:flex md:w-64 flex-col h-screen sticky top-0 p-4">
      <div className="glass flex flex-col h-full rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/20">
          <div>
            <div className="font-semibold tracking-wide text-foreground">
              FRAUD<span className="font-light">DETECTION</span>
            </div>
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
                    ? "bg-white/50 text-foreground shadow-sm ring-1 ring-black/5"
                    : "text-muted-foreground hover:bg-white/30 hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <it.icon className={cn("h-[18px] w-[18px] transition-all duration-200", isActive && "text-foreground")} strokeWidth={1.5} />
                  <span className="tracking-tight">{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/20 text-[11px] text-muted-foreground">
          <div className="font-semibold text-foreground/90 mb-0.5">Fraud Detection Demo</div>
          <div className="opacity-75 mb-2">210k tx · 2016–2018</div>
          <div className="font-medium text-foreground/80 mt-2 border-t border-border/50 pt-2">
            By Ilyes, Anthony, Maxime, Paul, Tom
          </div>
        </div>
      </div>
    </aside>
  );
}
