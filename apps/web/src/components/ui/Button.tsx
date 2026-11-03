import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ children, tone = "neutral", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "neutral" | "primary" | "danger"; children: ReactNode }) {
  return <button className={`btn btn-${tone} ${className}`} {...props}>{children}</button>;
}
