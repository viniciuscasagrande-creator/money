"use client";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({ className, children, ...props }, ref) =>
  <SelectPrimitive.Trigger ref={ref} className={cn("flex h-10 w-full items-center justify-between rounded-xl border border-[#eae6e4] bg-white px-3 text-left text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#f6d5d0]", className)} {...props}>{children}<SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon></SelectPrimitive.Trigger>);
SelectTrigger.displayName = "SelectTrigger";
export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(({ className, children, ...props }, ref) =>
  <SelectPrimitive.Portal><SelectPrimitive.Content ref={ref} position="popper" sideOffset={5} className={cn("z-50 max-h-72 min-w-[180px] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl", className)} {...props}><SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>);
SelectContent.displayName = "SelectContent";
export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({ className, children, ...props }, ref) =>
  <SelectPrimitive.Item ref={ref} className={cn("relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-slate-700 outline-none focus:bg-slate-100", className)} {...props}><SelectPrimitive.ItemIndicator className="absolute left-2"><Check size={14}/></SelectPrimitive.ItemIndicator><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>);
SelectItem.displayName = "SelectItem";
