"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, pickerLocales, localeNames, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Language picker dropdown. Renders a globe icon button that opens a list
 * of all supported locales. On selection it navigates to the same page
 * under the new locale prefix and sets the NEXT_LOCALE cookie so the
 * choice persists.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: Locale) {
    if (newLocale === currentLocale) return;

    // Set the NEXT_LOCALE cookie so next-intl remembers the choice
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;

    // Build the new path: strip the current locale prefix (if any) and
    // prepend the new one (unless it's the default 'en' with localePrefix: 'as-needed').
    let cleanPath = pathname;

    // Remove existing locale prefix from the path
    for (const loc of locales) {
      if (pathname === `/${loc}` || pathname.startsWith(`/${loc}/`)) {
        cleanPath = pathname.slice(`/${loc}`.length) || "/";
        break;
      }
    }

    // For non-default locales, prepend the locale prefix
    const newPath = newLocale === "en" ? cleanPath : `/${newLocale}${cleanPath}`;

    router.push(newPath);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            className,
          )}
          title="Switch language"
          aria-label="Switch language"
        >
          <Globe className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 max-h-80 overflow-y-auto">
        {pickerLocales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchLocale(locale)}
            className={cn(
              "flex items-center justify-between cursor-pointer",
              locale === currentLocale && "font-semibold bg-accent",
            )}
          >
            <span>{localeNames[locale]}</span>
            {locale === currentLocale && (
              <span className="text-xs text-muted-foreground ml-2">&#10003;</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
