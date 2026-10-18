import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ink text-surface hover:opacity-90",
        ghost: "hover:bg-line/60",
        outline: "border border-line bg-panel hover:bg-line/50",
      },
      size: { md: "h-10 px-4", sm: "h-8 px-3", icon: "size-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(button({ variant, size }), className)} {...props} />;
}
