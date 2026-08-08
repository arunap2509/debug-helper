import { Connection } from "@/lib/types";
import { ChevronDown } from "lucide-react";

export default function ConnectionPicker({
  connections,
  selected,
  onChange,
}: {
  connections: Connection[];
  selected: string | null;
  onChange: (id: string) => void;
}) {
  if (connections.length <= 1) return null;
  return (
    <div className="relative inline-flex items-center">
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-slate-800 bg-slate-900/90 pl-3 pr-8 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-700 focus:border-amber-500 focus:outline-none transition-all cursor-pointer"
      >
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}
