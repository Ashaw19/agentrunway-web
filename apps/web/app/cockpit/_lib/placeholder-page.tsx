import type { LucideIcon } from "lucide-react";

export function PlaceholderPage({
  title,
  blurb,
  icon: Icon,
  upcoming,
}: {
  title: string;
  blurb: string;
  icon: LucideIcon;
  upcoming: string[];
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-foreground inline-flex items-center gap-2 font-mono text-2xl tracking-tight">
          <Icon className="text-primary h-5 w-5" aria-hidden />
          {title}
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{blurb}</p>
      </header>

      <section
        aria-label="Coming in Phase 2"
        className="border-border/60 bg-card/40 rounded-lg border p-6"
      >
        <p className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
          Phase 2 · planned content
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {upcoming.map((item) => (
            <li key={item} className="text-foreground/80 flex items-start gap-2">
              <span
                aria-hidden
                className="bg-muted-foreground/40 mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground/80 mt-5 font-mono text-[11px]">
          Wired once Hugo / Vera / Quinn / Tessa start producing findings (after QuickBooks MCP
          authenticates).
        </p>
      </section>
    </div>
  );
}
