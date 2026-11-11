import React from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

/**
 * Workbench panel card (Phase 3 design system).
 * Solid sand surface, 12 px radius, hairline border. No glass (no
 * backdrop-blur, no translucent fill) and no hover lift/shadow — a hoverable
 * card only darkens its border (colour-only state change, owner ban list).
 */
export default function Card({
  className,
  children,
  hoverable = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-wb-panel border border-sand-200 bg-sand-100 p-6 text-ink",
        {
          "transition-colors hover:border-sand-300": hoverable,
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
