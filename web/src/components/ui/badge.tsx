import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-border bg-white text-foreground",
        secondary: "border-border bg-white text-muted-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        success: "border-border bg-white text-foreground",
        warning: "border-warning/30 bg-warning/10 text-warning",
        outline: "border-border bg-white text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
