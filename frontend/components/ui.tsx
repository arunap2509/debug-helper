"use client";

import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
  icon: Icon,
  iconClassName = "bg-indigo-500/15 text-indigo-400",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-800/80 bg-slate-900/50 shadow-sm shadow-black/20 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "secondary" | "success";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    default:
      "border border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-slate-500 hover:bg-slate-800 hover:text-white shadow-sm shadow-black/50 backdrop-blur-md font-semibold",
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-500/50 shadow-sm shadow-indigo-950/50 font-semibold",
    success:
      "bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500/50 shadow-sm shadow-emerald-950/50 font-semibold",
    danger:
      "bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-500/50 shadow-sm shadow-rose-950/50 font-semibold",
    secondary:
      "border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 hover:text-slate-100",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${styles}`}
    >
      {children}
    </button>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-800 text-slate-300",
  green: "bg-emerald-500/15 text-emerald-300",
  red: "bg-rose-500/15 text-rose-300",
  amber: "bg-amber-500/15 text-amber-300",
  blue: "bg-sky-500/15 text-sky-300",
  violet: "bg-violet-500/15 text-violet-300",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
      {message}
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
      {text}
    </pre>
  );
}
