import React from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

/**
 * Workbench field (Phase 3 design system).
 * Sand surface, 8 px radius, emerald focus border — never indigo. Label is
 * 12 px semibold, not uppercase-tracked shouting.
 */
export default function Input({
  className,
  error,
  label,
  id,
  type = "text",
  disabled,
  ...props
}: InputProps) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="select-none text-xs font-semibold text-sand-500"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        disabled={disabled}
        className={cn(
          "w-full rounded-wb-field border border-sand-200 bg-sand-50 px-3.5 py-2.5 text-sm text-ink transition-colors outline-none placeholder:text-sand-500 focus:border-emerald-accent disabled:cursor-not-allowed disabled:opacity-50",
          {
            "border-[#E5484D] focus:border-[#E5484D]": error,
          },
          className
        )}
        {...props}
      />
      {error && (
        <span className="text-xs font-medium text-[#E5484D]">
          {error}
        </span>
      )}
    </div>
  );
}
