import { Connection } from "@/lib/types";

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
    <select
      value={selected ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
    >
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
