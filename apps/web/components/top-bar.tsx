"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Moon, Sun, CircleUser, Settings, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { LanguagePicker } from "@/components/language-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);
      const { data: settings } = await supabase
        .from("user_settings")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .single();
      if (settings) {
        setDisplayName(settings.display_name ?? null);
        setAvatarUrl(settings.avatar_url || null); // treat "" as no photo
      }
    }
    loadUser();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Derive initials: first letter of display_name, fallback to email
  const initials = (displayName?.[0] ?? email?.[0] ?? "?").toUpperCase();

  return (
    <div className="hidden md:flex h-12 shrink-0 items-center justify-end gap-3 border-b border-border/40 bg-background/60 px-6">
      {/* Portal target for page-specific action buttons (e.g. dashboard Customize) */}
      <div id="top-bar-actions" className="contents" />

      {/* Language picker */}
      <LanguagePicker />

      {/* Dark mode toggle */}
      {mounted && (
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      )}

      {/* Avatar dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-border hover:ring-primary/50 transition-all overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Account menu">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Profile"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #1E72F2 0%, #7C3AED 100%)" }}
              >
                {initials}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {(displayName || email) && (
            <>
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-foreground truncate">
                  {displayName ?? email}
                </p>
                {displayName && email && (
                  <p className="text-[11px] text-muted-foreground truncate">{email}</p>
                )}
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
              <CircleUser className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
