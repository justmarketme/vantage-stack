"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
  /** Icon-only button: the caller must pass `aria-label`. */
  iconOnly?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", iconOnly, loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("cc-btn", `cc-btn-${variant}`, size === "sm" && "cc-btn-sm", iconOnly && "cc-btn-icon", className)}
      {...rest}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
