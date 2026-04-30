// Transactions loading skeleton — joins transactions + pipeline_deals + clients.
const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function TransactionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Sk className="h-7 w-48" />
        <Sk className="h-9 w-36 rounded-lg" />
      </div>
      <div className="flex gap-2 border-b border-border pb-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Sk key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-xl divide-y divide-border/40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-64" />
              <Sk className="h-3 w-40" />
            </div>
            <Sk className="h-5 w-24" />
            <Sk className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
