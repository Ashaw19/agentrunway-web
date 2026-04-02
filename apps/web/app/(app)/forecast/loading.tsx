// Forecast loading skeleton — mirrors the forecast page layout.

const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function ForecastLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-2">
        <Sk className="h-7 w-36" />
        <Sk className="h-4 w-64" />
      </div>

      {/* Financial waterfall / main card */}
      <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <Sk className="h-5 w-44" />
          <Sk className="h-6 w-20 rounded-full" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <Sk className="h-4 w-40" />
            <Sk className="h-4 w-24" />
          </div>
        ))}
        <div className="border-t border-border/50 pt-3 flex items-center justify-between">
          <Sk className="h-5 w-32" />
          <Sk className="h-5 w-28" />
        </div>
      </div>

      {/* Two-column: probability bands + tax estimates */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-4 animate-pulse"
          >
            <Sk className="h-5 w-36" />
            <Sk className="h-32 w-full rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Sk className="h-3.5 w-24" />
                  <Sk className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 5-year growth plan */}
      <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4 animate-pulse">
        <Sk className="h-5 w-40" />
        <Sk className="h-40 w-full rounded-lg" />
      </div>

      {/* Advisor cards row */}
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-4 space-y-3 animate-pulse"
          >
            <Sk className="h-4 w-28" />
            <div className="space-y-1.5">
              <Sk className="h-3 w-full" />
              <Sk className="h-3 w-3/4" />
            </div>
            <Sk className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
