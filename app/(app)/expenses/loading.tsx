// Expenses loading skeleton — mirrors the expenses page layout.

const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function ExpensesLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-7 w-32" />
          <Sk className="h-4 w-56" />
        </div>
        <Sk className="h-9 w-32 rounded-lg" />
      </div>

      {/* 4 KPI summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <Sk className="h-3.5 w-24" />
            <Sk className="h-8 w-20" />
            <Sk className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Sk key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Main content area — category list */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden animate-pulse">
        {/* Table header */}
        <div className="flex items-center gap-4 p-4 border-b border-border/50">
          <Sk className="h-4 w-36" />
          <div className="flex-1" />
          <Sk className="h-4 w-20" />
          <Sk className="h-4 w-24" />
          <Sk className="h-4 w-20" />
        </div>
        {/* Category rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border-b border-border/30 last:border-0"
          >
            <Sk className="h-4 w-4 rounded-full shrink-0" />
            <Sk className="h-4 w-44" />
            <div className="flex-1" />
            <Sk className="h-4 w-16" />
            <Sk className="h-4 w-20" />
            <Sk className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
