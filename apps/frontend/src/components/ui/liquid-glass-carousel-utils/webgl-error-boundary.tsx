"use client";

import React, { Component, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WebGLFallbackProps {
  className?: string;
  message?: string;
}

export function WebGLFallback({
  className,
  message = "WebGL is not supported or encountered an error.",
}: WebGLFallbackProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center rounded-2xl bg-[#1E1E1B] p-6 text-center text-sm font-medium text-sand-600",
        className
      )}
    >
      <p>{message}</p>
    </div>
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class WebGLErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("WebGL Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <WebGLFallback message="A WebGL rendering error occurred." />
        )
      );
    }
    return this.props.children;
  }
}
