// CRM loading skeleton — heavy queries (clients + deals + appointments).
const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function CrmLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Sk className="h-8 w-40" />
        <Sk className="h-9 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Sk key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 animate-pulse">
            <Sk className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-48" />
              <Sk className="h-3 w-32" />
            </div>
            <Sk className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
