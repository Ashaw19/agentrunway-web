"use client";

/**
 * A card that can be minimized to its title bar. The title stays visible and
 * is the toggle (a button inside the heading, with aria-expanded); the
 * description, the right-hand figure or buttons, and the body are hidden
 * while it is collapsed. The body stays mounted (hidden), so anything typed
 * or toggled inside it is still there when it opens again.
 *
 * `useCollapsedSections` keeps the page's set of collapsed sections and saves
 * it to a cookie the page's server component reads (lib/collapsed-sections).
 */
import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  collapsedSectionsCookie,
  everySection,
  serializeCollapsedSections,
  toggledSections,
} from "@/lib/collapsed-sections";

export interface CollapsedSections<T extends string> {
  isCollapsed: (id: T) => boolean;
  toggle: (id: T) => void;
  /** Collapse or expand every section the page knows. */
  setAll: (collapsed: boolean) => void;
  /** Every section is collapsed. */
  allCollapsed: boolean;
}

export function useCollapsedSections<T extends string>(options: {
  cookie: string;
  known: readonly T[];
  /** Read from the cookie on the server; the defaults when it was absent. */
  initial: readonly T[];
}): CollapsedSections<T> {
  const { cookie, known } = options;
  const [collapsed, setCollapsed] = useState<ReadonlySet<T>>(() => new Set(options.initial));

  const save = useCallback(
    (next: ReadonlySet<T>) => {
      setCollapsed(next);
      try {
        document.cookie = collapsedSectionsCookie(cookie, serializeCollapsedSections(next, known));
      } catch {
        // Cookies blocked: the choice lasts until the page reloads.
      }
    },
    [cookie, known],
  );

  return {
    isCollapsed: (id) => collapsed.has(id),
    toggle: (id) => save(toggledSections(collapsed, id)),
    setAll: (all) => save(everySection(known, all)),
    allCollapsed: known.every((id) => collapsed.has(id)),
  };
}

export interface CollapsibleCardProps {
  /** Unique on the page: the body's DOM id is `${id}-body`. */
  id: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Shown whether collapsed or not. */
  title: ReactNode;
  icon?: ReactNode;
  titleClassName?: string;
  /** Hidden while collapsed. */
  description?: ReactNode;
  descriptionClassName?: string;
  /** Right-hand side of the header (a figure, a badge, buttons). Hidden while collapsed. */
  aside?: ReactNode;
  className?: string;
  headerClassName?: string;
  children?: ReactNode;
}

export function CollapsibleCard({
  id,
  collapsed,
  onToggle,
  title,
  icon,
  titleClassName,
  description,
  descriptionClassName,
  aside,
  className,
  headerClassName,
  children,
}: CollapsibleCardProps) {
  const bodyId = `${id}-body`;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <Card className={cn(className, collapsed && "py-4")} data-collapsed={collapsed ? "true" : "false"} data-section={id}>
      <CardHeader className={cn("pb-2", headerClassName, collapsed && "pb-0")}>
        {/* The title column takes the room the right-hand side leaves and
            wraps it onto its own line only below 10rem, so a long description
            never pushes the buttons down but a phone still fits both. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 grow basis-40">
            <CardTitle className={cn("text-base", titleClassName)}>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                title={collapsed ? "Expand" : "Minimize"}
                className="-mx-1 flex items-center gap-2 rounded-md px-1 text-left hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {icon}
                <span>{title}</span>
              </button>
            </CardTitle>
            {!collapsed && description && (
              <CardDescription className={cn("mt-0.5 text-xs", descriptionClassName)}>{description}</CardDescription>
            )}
          </div>
          {!collapsed && aside && <div className="ml-auto shrink-0">{aside}</div>}
        </div>
      </CardHeader>
      {/* `contents` keeps the body's cards in the Card's own flex layout. Not
          set while hidden: a display class would override the hidden attribute. */}
      <div id={bodyId} hidden={collapsed} className={collapsed ? undefined : "contents"}>
        {children}
      </div>
    </Card>
  );
}
