"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  Plus,
  Copy,
  Trash2,
  Check,
  ExternalLink,
  Eye,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface AccountantShare {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
  share_t2125: boolean;
  share_expenses: boolean;
  share_transactions: boolean;
  share_mileage: boolean;
  last_accessed_at: string | null;
  access_count: number;
  expires_at: string | null;
  created_at: string;
}

export function AccountantShareManager() {
  const supabase = useMemo(() => createClient(), []);
  const [shares, setShares] = useState<AccountantShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    supabase
      .from("accountant_shares")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[accountant-share-manager] Load error:", error);
          setLoadError(true);
        } else {
          setShares((data ?? []) as AccountantShare[]);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createShare() {
    if (!newLabel.trim()) {
      toast.error("Enter a label (e.g. your accountant's name)");
      return;
    }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase
      .from("accountant_shares")
      .insert({ label: newLabel.trim(), user_id: user.id })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create share link");
      console.error(error);
    } else {
      setShares((prev) => [data as AccountantShare, ...prev]);
      setNewLabel("");
      toast.success("Share link created!");
    }
    setCreating(false);
  }

  async function deleteShare(id: string) {
    const { error } = await supabase
      .from("accountant_shares")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      setShares((prev) => prev.filter((s) => s.id !== id));
      toast.success("Share link deleted");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const { error } = await supabase
      .from("accountant_shares")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update");
    } else {
      setShares((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s))
      );
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/accountant/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-blue-600" />
          Accountant Access
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Generate secure, read-only links to share your financial data with
          your accountant. No login required — they just open the link.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Failed to load share links. Please refresh the page.
          </div>
        )}
        {/* Create new */}
        <div className="flex gap-2">
          <Input
            placeholder="Accountant name or firm..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createShare()}
            className="flex-1"
          />
          <Button onClick={createShare} disabled={creating} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Link
          </Button>
        </div>

        {/* Existing shares */}
        {shares.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No share links yet. Create one above to get started.
          </p>
        )}

        {shares.map((share) => (
          <div
            key={share.id}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{share.label}</span>
                <Badge
                  variant={share.is_active ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {share.is_active ? "Active" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyLink(share.token)}
                  className="gap-1.5"
                >
                  {copied === share.token ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied === share.token ? "Copied" : "Copy Link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    window.open(`/accountant/${share.token}`, "_blank")
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => deleteShare(share.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {share.last_accessed_at ? (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Last viewed{" "}
                  {new Date(share.last_accessed_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                  {share.access_count} view{share.access_count !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Never accessed
                </span>
              )}
              <span>
                Created{" "}
                {new Date(share.created_at).toLocaleDateString("en-CA")}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={share.is_active}
                  onCheckedChange={(v) => toggleActive(share.id, v)}
                />
                <span className="text-xs text-muted-foreground">Enabled</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
