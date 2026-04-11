"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Mail } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Reusable error boundary component for app pages.
 * Usage in error.tsx:
 *   export { PageError as default } from "@/components/page-error";
 * Or with a custom page name:
 *   export default function MyError(props) { return <PageError {...props} pageName="My Page" />; }
 */
export function PageError({
  error,
  reset,
  pageName = "Page",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  pageName?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { page: pageName.toLowerCase() } });
  }, [error, pageName]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="rounded-full bg-rose-500/10 p-4">
        <AlertTriangle className="h-8 w-8 text-rose-500" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{pageName} Error</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Something went wrong loading this page. We&apos;ve been notified.
          Try refreshing or contact support if it persists.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <Button variant="ghost" className="gap-2 text-muted-foreground" asChild>
          <a href="mailto:support@agentrunway.ca">
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
        </Button>
      </div>
    </div>
  );
}
