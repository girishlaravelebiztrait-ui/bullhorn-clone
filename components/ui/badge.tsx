import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground ring-border",
        primary: "bg-primary-subtle text-primary ring-primary/20",
        success: "bg-success-subtle text-success-text ring-success/20",
        warning: "bg-warning-subtle text-warning-text ring-warning/20",
        danger: "bg-danger-subtle text-danger-text ring-danger/20",
        info: "bg-info-subtle text-info-text ring-info/20",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map a candidate status to a semantic badge variant. */
export function statusVariant(status: string): NonNullable<BadgeProps["variant"]> {
  switch (status) {
    case "Active":
      return "success";
    case "Placed":
      return "info";
    case "Do Not Contact":
      return "warning";
    case "Blacklisted":
      return "danger";
    default:
      return "neutral";
  }
}
