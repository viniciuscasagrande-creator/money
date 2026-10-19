import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  className?: string;
}) {
  const tones = {
    neutral: "bg-[#EBEBED] text-[#47505A] border border-[#BBBFC5]/60",
    green: "bg-emerald-50 text-emerald-800 border border-emerald-200/80",
    amber: "bg-amber-50 text-amber-800 border border-amber-200/80",
    red: "bg-[#E03629]/10 text-[#E03629] border border-[#E03629]/25",
    blue: "bg-[#0F1113] text-white border border-[#0F1113]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-tight",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
