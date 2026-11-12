import React from "react";
import { cn } from "@/utils/cn";
import Spinner from "./Spinner";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

/**
 * Workbench button (Phase 3 design system).
 * Primary is solid emerald on near-black — the product's action colour — never
 * indigo/purple. Secondary/ghost use the sand scale. State changes are colour
 * only: no hover scale, translate or shadow animation (owner ban list).
 * md hits the 44 px touch target; sm is 36 px for dense rows.
 */
export default function Button({
  className,
  children,
  variant = "primary",
  size = "md",
  isLoading,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#141412] disabled:cursor-not-allowed disabled:opacity-50",
        {
          // Size (min-height = touch target)
          "min-h-9 px-3 py-2 text-xs": size === "sm",
          "min-h-11 px-5 py-2.5 text-sm": size === "md",
          "min-h-12 px-6 py-3 text-base": size === "lg",

          // Variants — all on the dark sand/emerald tokens, no indigo
          "bg-emerald-accent text-[#141412] hover:bg-[#4BE0A5]": variant === "primary",
          "border border-sand-200 bg-sand-100 text-ink hover:border-sand-300 hover:bg-sand-200":
            variant === "secondary",
          "bg-[#E5484D] text-[#FFFFEB] hover:bg-[#D93A3F]": variant === "danger",
          "bg-transparent text-sand-600 hover:bg-sand-100 hover:text-ink":
            variant === "ghost",
        },
        className
      )}
      {...props}
    >
      {isLoading && <Spinner className="mr-2 h-4 w-4" />}
      {children}
    </button>
  );
}
