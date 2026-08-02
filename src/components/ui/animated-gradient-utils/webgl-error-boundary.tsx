"use client";

import { Component, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export class WebGLErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function WebGLFallback({ className }: { className?: string }) {
  return <div className={cn("animated-gradient-fallback", className)} aria-hidden="true" />;
}
