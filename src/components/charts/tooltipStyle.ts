import type { CSSProperties } from "react";

export const tooltipStyle: CSSProperties = {
  background: "hsl(var(--glass-bg) / 0.92)",
  border: "1px solid hsl(var(--glass-border) / 0.6)",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 500,
  padding: "10px 14px",
  boxShadow:
    "0 1px 0 0 hsl(var(--glass-highlight) / 0.5) inset, 0 8px 28px -8px hsl(var(--glass-shadow) / 0.2)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
};
