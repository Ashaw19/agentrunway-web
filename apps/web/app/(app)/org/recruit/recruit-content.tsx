"use client";

import { useState, useTransition } from "react";
import {
  Users,
  Eye,
  FileText,
  Link2,
  Check,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  UserPlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createRecruitmentPage,
  toggleRecruitmentPage,
  updateApplicationStatus,
} from "@/lib/actions/recruit-actions";

interface RecruitmentPageData {
  id: string;
  token: string;
  is_active: boolean;
  headline: string;
  view_count: number;
  application_count: number;
  created_at: string;
}

interface Application {
  id: string;
  recruitment_page_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  years_experience: number;
  current_brokerage: string;
  message: string;
  resume_url: string;
  status: string;
  created_at: string;
}

interface Props {
  orgName: string;
  recruitmentPage: RecruitmentPageData | null;
  applications: Application[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  new: { label: "New", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  contacted: { label: "Contacted", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  interviewing: { label: "Interviewing", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  offered: { label: "Offered", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  hired: { label: "Hired", className: "bg-green-500/15 text-green-300 border-green-500/30" },
  declined: { label: "Declined", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

export function RecruitContent({
  orgName,
  recruitmentPage: initialPage,
  applications: initialApplications,
}: Props) {
  const [page, setPage] = useState(initialPage);
  const [applications, setApplications] = useState(initialApplications);
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const publicUrl = page
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/recruit/${page.token}`
    : "";

  function handleCopyUrl() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Recruitment URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createRecruitmentPage();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        setPage({
          id: result.data.id,
          token: result.data.token,
          is_active: true,
          headline: "Join Our Team",
          view_count: 0,
          application_count: 0,
          created_at: new Date().toISOString(),
        });
        toast.success("Recruitment page created!");
      }
    });
  }

  function handleToggle(checked: boolean) {
    if (!page) return;
    startTransition(async () => {
      const result = await toggleRecruitmentPage(page.id, checked);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPage({ ...page, is_active: checked });
      toast.success(checked ? "Page enabled" : "Page disabled");
    });
  }

  function handleStatusChange(applicationId: string, newStatus: string) {
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, newStatus);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setApplications((prev) =>
        prev.map((a) =>
          a.id === applicationId ? { ...a, status: newStatus } : a,
        ),
      );
      toast.success("Status updated");
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <UserPlus className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">Recruiting</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your public recruitment page and review applications for{" "}
          {orgName}.
        </p>
      </div>

      {/* Section 1: Recruitment Page Management */}
      <Card>
        <CardContent className="pt-6">
          {!page ? (
            /* No page exists — show create button */
            <div className="text-center py-8">
              <UserPlus className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
              <h2 className="text-lg font-semibold mb-1">
                No Recruitment Page Yet
              </h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
                Create a public recruitment page to attract new agents. Share
                the link on social media, your website, or via email.
              </p>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Recruitment Page
              </Button>
            </div>
          ) : (
            /* Page exists — show URL, toggle, stats */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your Recruitment Page</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {page.is_active ? "Active" : "Disabled"}
                  </span>
                  <Switch
                    checked={page.is_active}
                    onCheckedChange={handleToggle}
                    disabled={isPending}
                  />
                </div>
              </div>

              {/* Public URL */}
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="flex-1 text-sm truncate text-muted-foreground">
                  {publicUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUrl}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-center">
                  <Eye className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-2xl font-bold">{page.view_count}</p>
                  <p className="text-xs text-muted-foreground">Views</p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-center">
                  <FileText className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-2xl font-bold">
                    {page.application_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Applications</p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-center">
                  <Users className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-2xl font-bold">
                    {
                      applications.filter((a) => a.status === "hired").length
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">Hired</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Applications List */}
      {page && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Applications</h2>
              <span className="text-sm text-muted-foreground">
                {applications.length} total
              </span>
            </div>

            {applications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No applications yet.</p>
                <p className="text-xs mt-1">
                  Share your recruitment link to start receiving applications.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">
                          Applicant
                        </th>
                        <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">
                          Brokerage
                        </th>
                        <th className="px-4 py-3 text-left font-medium hidden md:table-cell">
                          Exp.
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">
                          Applied
                        </th>
                        <th className="px-4 py-3 text-left font-medium w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => {
                        const isExpanded = expandedId === app.id;
                        const statusCfg =
                          STATUS_CONFIG[app.status] ?? STATUS_CONFIG.new;
                        return (
                          <ApplicationRow
                            key={app.id}
                            app={app}
                            isExpanded={isExpanded}
                            statusCfg={statusCfg}
                            isPending={isPending}
                            onToggleExpand={() =>
                              setExpandedId(isExpanded ? null : app.id)
                            }
                            onStatusChange={handleStatusChange}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Application Row ───────────────────────────────────────────────── */

function ApplicationRow({
  app,
  isExpanded,
  statusCfg,
  isPending,
  onToggleExpand,
  onStatusChange,
}: {
  app: Application;
  isExpanded: boolean;
  statusCfg: { label: string; className: string };
  isPending: boolean;
  onToggleExpand: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <>
      <tr
        className="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={onToggleExpand}
      >
        <td className="px-4 py-3">
          <div>
            <p className="font-medium">{app.applicant_name}</p>
            <p className="text-xs text-muted-foreground">
              {app.applicant_email}
            </p>
          </div>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
          {app.current_brokerage || "---"}
        </td>
        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
          {app.years_experience > 0 ? `${app.years_experience}yr` : "---"}
        </td>
        <td className="px-4 py-3">
          <Badge
            variant="outline"
            className={statusCfg.className}
          >
            {statusCfg.label}
          </Badge>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
          {new Date(app.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Phone
                </p>
                <p className="text-sm">
                  {app.applicant_phone || "Not provided"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Email
                </p>
                <p className="text-sm">{app.applicant_email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Years of Experience
                </p>
                <p className="text-sm">{app.years_experience}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Current Brokerage
                </p>
                <p className="text-sm">
                  {app.current_brokerage || "Not provided"}
                </p>
              </div>
              {app.message && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Message
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{app.message}</p>
                </div>
              )}
              {app.resume_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Resume
                  </p>
                  <a
                    href={app.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:underline"
                  >
                    View Resume
                  </a>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Update Status
                </p>
                <Select
                  value={app.status}
                  onValueChange={(val) => onStatusChange(app.id, val)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="interviewing">Interviewing</SelectItem>
                    <SelectItem value="offered">Offered</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
