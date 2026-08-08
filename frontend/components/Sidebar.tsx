"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";
import { SERVICE_THEME } from "@/lib/theme";

type NavLink = { href: string; label: string; icon: LucideIcon; activeNav: string };

const TOP: NavLink[] = [
  { href: "/workflows", label: "Workflows", icon: Workflow, activeNav: "bg-emerald-500/15 text-emerald-300" },
  { href: "/events", label: "Events", icon: Activity, activeNav: "bg-cyan-500/15 text-cyan-300" },
];

const SERVICES: NavLink[] = [
  { href: "/postgres", label: "Postgres", icon: SERVICE_THEME.postgres.icon, activeNav: SERVICE_THEME.postgres.activeNav },
  { href: "/redis", label: "Redis", icon: SERVICE_THEME.redis.icon, activeNav: SERVICE_THEME.redis.activeNav },
  { href: "/wiremock", label: "Wiremock", icon: SERVICE_THEME.wiremock.icon, activeNav: SERVICE_THEME.wiremock.activeNav },
  { href: "/localstack", label: "LocalStack", icon: SERVICE_THEME.localstack.icon, activeNav: SERVICE_THEME.localstack.activeNav },
];

const BOTTOM: NavLink[] = [
  { href: "/admin", label: "Admin", icon: ShieldCheck, activeNav: "bg-indigo-500/15 text-indigo-300" },
];

function NavSection({ links, pathname }: { links: NavLink[]; pathname: string }) {
  return (
    <>
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              active ? link.activeNav : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/95">
      <Link href="/workflows" className="px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400" />
          <span className="text-sm font-semibold tracking-wide text-slate-100">Polaris Debugger</span>
        </div>
      </Link>
      <nav className="flex flex-col gap-0.5 px-2">
        <NavSection links={TOP} pathname={pathname} />
        <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Connections
        </div>
        <NavSection links={SERVICES} pathname={pathname} />
        <div className="mt-3 border-t border-slate-800/80 pt-2">
          <NavSection links={BOTTOM} pathname={pathname} />
        </div>
      </nav>
    </aside>
  );
}
