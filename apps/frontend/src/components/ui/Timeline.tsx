import React from "react";
import { cn } from "@/utils/cn";
import Spinner from "./Spinner";

export interface TimelineStage {
  id: string;
  name: string;
  description?: string;
  status: "queued" | "processing" | "completed" | "failed" | "idle";
}

interface TimelineProps {
  stages: TimelineStage[];
  currentStageId?: string;
  className?: string;
}

export default function Timeline({ stages, currentStageId, className }: TimelineProps) {
  return (
    <div className={cn("space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-sand-200", className)}>
      {stages.map((stage, idx) => {
        const isCompleted = stage.status === "completed";
        const isProcessing = stage.status === "processing";
        const isFailed = stage.status === "failed";
        const isQueued = stage.status === "queued";
        
        return (
          <div key={stage.id} className="flex gap-4 relative animate-fade-in-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            {/* Step node */}
            <div className="z-10 flex items-center justify-center">
              <div
                className={cn(
                  "w-7.5 h-7.5 rounded-full flex items-center justify-center border text-xs font-semibold transition-all",
                  {
                    "bg-emerald-accent/10 border-emerald-accent text-emerald-accent": isProcessing,
                    "bg-green-500/15 border-green-500 text-green-400": isCompleted,
                    "bg-red-500/15 border-red-500 text-red-400": isFailed,
                    "bg-sand-100 border-sand-300 text-sand-500": isQueued,
                    "bg-sand-50 border-sand-200 text-sand-500": stage.status === "idle",
                  }
                )}
              >
                {isProcessing ? (
                  <Spinner className="w-3.5 h-3.5 text-emerald-accent" />
                ) : isCompleted ? (
                  "✓"
                ) : isFailed ? (
                  "✗"
                ) : (
                  idx + 1
                )}
              </div>
            </div>

            {/* Description */}
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <h4
                  className={cn("text-sm font-semibold transition-colors", {
                    "text-emerald-accent": isProcessing,
                    "text-green-400": isCompleted,
                    "text-red-400": isFailed,
                    "text-sand-800": isQueued,
                    "text-sand-500": stage.status === "idle",
                  })}
                >
                  {stage.name}
                </h4>
                {isProcessing && (
                  <span className="text-[10px] bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/20 rounded px-1.5 py-0.5 uppercase tracking-wider font-bold">
                    Active
                  </span>
                )}
              </div>
              {stage.description && (
                <p
                  className={cn("text-xs mt-0.5 transition-colors", {
                    "text-sand-600": isProcessing || isCompleted,
                    "text-sand-500": isQueued || stage.status === "idle",
                    "text-red-400/80": isFailed,
                  })}
                >
                  {stage.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
