import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) =>
  <input ref={ref} className={cn("flex h-10 w-full rounded-xl border border-[#eae6e4] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6d5d0] focus-visible:border-[#e77c70] disabled:opacity-50", className)} {...props} />);
Input.displayName = "Input";
