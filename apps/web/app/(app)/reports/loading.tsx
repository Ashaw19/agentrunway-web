// Reports loading skeleton — mirrors the reports page layout.

const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-7 w-28" />
          <Sk className="h-4 w-60" />
        </div>
        <Sk className="h-9 w-36 rounded-lg" />
      </div>

      {/* Tab row */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Sk key={i} className="h-9 w-20 rounded-lg" />
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <Sk className="h-4 w-32" />
            <Sk className="h-8 w-24" />
            <div className="space-y-2 pt-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Sk className="h-3 w-28" />
                  <Sk className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Main table */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden animate-pulse">
        {/* Table header */}
        <div className="flex items-center gap-4 p-4 border-b border-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border-b border-border/30 last:border-0"
          >
            {Array.from({ length: 5 }).map((_, j) => (
              <Sk
                key={j}
                className={`h-4 flex-1 ${j === 0 ? "w-32" : j === 4 ? "w-16" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
