// Tax loading skeleton — engine-heavy (HST, instalments, T1/T2 estimates).
const Sk = ({ className }: { className: string }) => (
  <div className={`bg-muted animate-pulse rounded-xl ${className}`} />
);

export default function TaxLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Sk className="h-7 w-44" />
        <Sk className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-xl p-5 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <Sk className="h-4 w-24" />
              <Sk className="h-4 w-4 rounded-full" />
            </div>
            <Sk className="h-9 w-32" />
            <div className="space-y-1.5">
              <Sk className="h-3 w-full" />
              <Sk className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
