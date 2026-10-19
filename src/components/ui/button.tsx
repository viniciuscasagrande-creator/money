import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E03629] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#0F1113] text-white hover:bg-[#E03629] shadow-[0_4px_14px_rgba(15,17,19,0.14)]",
        secondary: "bg-[#EBEBED] text-[#0F1113] hover:bg-[#BBBFC5]/50",
        outline:
          "border border-[#BBBFC5]/80 bg-white text-[#0F1113] hover:border-[#0F1113] hover:bg-[#EBEBED]/40",
        ghost: "text-[#47505A] hover:bg-[#EBEBED]/60 hover:text-[#0F1113]",
        destructive: "bg-[#E03629] text-white hover:bg-[#c82d21] shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(variants({ variant, size, className }))} {...props} />;
  }
);
Button.displayName = "Button";
