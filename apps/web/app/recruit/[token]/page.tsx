"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Users,
  Send,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Building2,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface RecruitmentData {
  headline: string;
  description: string;
  teamPhotoUrl: string;
  showTeamStats: boolean;
  showValueProps: boolean;
  customValues: { title: string; description: string }[];
  orgName: string;
  teamStats: { memberCount: number } | null;
  requireResume: boolean;
}

const DEFAULT_VALUE_PROPS = [
  {
    icon: TrendingUp,
    title: "Grow Your Business",
    desc: "Access powerful analytics, AI insights, and forecasting to outperform the competition.",
  },
  {
    icon: Users,
    title: "Collaborative Team",
    desc: "Work alongside experienced agents with shared knowledge and mentorship opportunities.",
  },
  {
    icon: Star,
    title: "Cutting-Edge Technology",
    desc: "Agent Runway platform included — CRM, tax estimation tools, Flight Crew, and more.",
  },
];

export default function RecruitPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<RecruitmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    experience: "",
    brokerage: "",
    message: "",
  });

  useEffect(() => {
    fetch(`/api/recruit?token=${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Page not found");
        return r.json();
      })
      .then((d) => setData(d as RecruitmentData))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Please fill in your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recruit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          applicant_name: form.name,
          applicant_email: form.email,
          applicant_phone: form.phone,
          years_experience: parseInt(form.experience) || 0,
          current_brokerage: form.brokerage,
          message: form.message,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-bold">Page Not Found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This recruitment page is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 mb-6">
            <Building2 className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-200">
              {data.orgName}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {data.headline}
          </h1>
          {data.description && (
            <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
              {data.description}
            </p>
          )}
          {data.teamStats && data.showTeamStats && (
            <div className="mt-8 inline-flex items-center gap-6 rounded-2xl bg-white/5 border border-white/10 px-8 py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-400">
                  {data.teamStats.memberCount}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Team Members</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Value Props */}
      {data.showValueProps && (
        <div className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-2xl font-bold text-center text-slate-900 mb-10">
              Why Join {data.orgName}?
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {data.customValues.length > 0
                ? data.customValues.map((v, i) => (
                    <div key={i} className="text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                        <Star className="h-5 w-5 text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-slate-900">
                        {v.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {v.description}
                      </p>
                    </div>
                  ))
                : DEFAULT_VALUE_PROPS.map((v, i) => {
                    const Icon = v.icon;
                    return (
                      <div key={i} className="text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                          <Icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-slate-900">
                          {v.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {v.desc}
                        </p>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      )}

      {/* Application Form */}
      <div className="bg-slate-50 py-16">
        <div className="mx-auto max-w-lg px-6">
          {submitted ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Application Submitted!
                </h2>
                <p className="text-sm text-slate-500">
                  Thank you for your interest in joining {data.orgName}. We will
                  be in touch shortly.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-8 pb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">
                  Apply to Join
                </h2>
                <p className="text-sm text-slate-500 mb-6 text-center">
                  Fill out the form below and we will reach out.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Full Name *</Label>
                      <Input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Email *</Label>
                      <Input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        placeholder="you@email.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        placeholder="(613) 555-0123"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Years of Experience</Label>
                      <Input
                        type="number"
                        value={form.experience}
                        onChange={(e) =>
                          setForm({ ...form, experience: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Current Brokerage</Label>
                    <Input
                      value={form.brokerage}
                      onChange={(e) =>
                        setForm({ ...form, brokerage: e.target.value })
                      }
                      placeholder="Current or most recent brokerage"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Message (optional)</Label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      rows={3}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {submitting ? "Submitting..." : "Submit Application"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t py-6 text-center">
        <p className="text-xs text-slate-400">
          Powered by{" "}
          <a
            href="https://agentrunway.ca"
            className="text-blue-500 hover:underline"
          >
            Agent Runway
          </a>{" "}
          · Built for Canadian real estate teams
        </p>
      </div>
    </div>
  );
}
