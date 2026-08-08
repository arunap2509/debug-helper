export default function StatusDot({ connected }: { connected: boolean | undefined }) {
  if (connected === undefined) {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-600" />;
  }
  if (!connected) {
    return <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />;
  }
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}
