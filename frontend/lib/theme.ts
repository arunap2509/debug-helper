import { Database, Layers, Webhook, Cloud, type LucideIcon } from "lucide-react";
import { ServiceType } from "./types";

export interface ServiceTheme {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  activeNav: string;
  dot: string;
  badge: string;
}

export const SERVICE_THEME: Record<ServiceType, ServiceTheme> = {
  postgres: {
    label: "Postgres",
    icon: Database,
    iconBg: "bg-sky-500/15",
    iconText: "text-sky-400",
    activeNav: "bg-sky-500/15 text-sky-300",
    dot: "bg-sky-400",
    badge: "bg-sky-500/15 text-sky-300",
  },
  redis: {
    label: "Redis",
    icon: Layers,
    iconBg: "bg-rose-500/15",
    iconText: "text-rose-400",
    activeNav: "bg-rose-500/15 text-rose-300",
    dot: "bg-rose-400",
    badge: "bg-rose-500/15 text-rose-300",
  },
  wiremock: {
    label: "Wiremock",
    icon: Webhook,
    iconBg: "bg-violet-500/15",
    iconText: "text-violet-400",
    activeNav: "bg-violet-500/15 text-violet-300",
    dot: "bg-violet-400",
    badge: "bg-violet-500/15 text-violet-300",
  },
  localstack: {
    label: "LocalStack",
    icon: Cloud,
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-400",
    activeNav: "bg-amber-500/15 text-amber-300",
    dot: "bg-amber-400",
    badge: "bg-amber-500/15 text-amber-300",
  },
};
