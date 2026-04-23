import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all duration-200",
  {
    variants: {
      variant: {
        default: "border-transparent bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-sm shadow-primary/20",
        secondary: "border-transparent bg-gradient-to-br from-secondary to-secondary/90 text-secondary-foreground",
        destructive: "border-transparent bg-gradient-to-br from-destructive to-destructive/90 text-destructive-foreground shadow-sm shadow-destructive/20",
        success: "border-transparent bg-gradient-to-br from-success to-success/90 text-success-foreground shadow-sm shadow-success/20",
        warning: "border-transparent bg-gradient-to-br from-warning to-warning/90 text-warning-foreground shadow-sm shadow-warning/20",
        outline: "text-foreground border-border/60 bg-background/50 hover:bg-background/80",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
