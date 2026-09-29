import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
}

export function Card({ interactive, padded = true, className, ...rest }: CardProps) {
  return <div className={cx("cc-card", interactive && "cc-card-interactive", padded && "p-5", className)} {...rest} />;
}
