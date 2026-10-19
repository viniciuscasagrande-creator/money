"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(({ children, className, ...props }, ref) =>
  <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#17151b]/65 backdrop-blur-[3px]"/><DialogPrimitive.Content ref={ref} className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-[#eee8e8] bg-white p-6 shadow-[0_35px_100px_rgba(22,18,24,.25)] max-h-[90vh] overflow-y-auto", className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-5 top-5 rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={18}/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>);
DialogContent.displayName = "DialogContent";
