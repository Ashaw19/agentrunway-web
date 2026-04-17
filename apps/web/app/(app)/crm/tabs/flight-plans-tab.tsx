"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plane,
  Plus,
  Trash2,
  Pencil,
  ArrowRight,
  ListTodo,
  Mail,
  MessageSquare,
  Zap,
  Sparkles,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FlightPlan,
  FlightPlanStep,
  ClientStatus,
} from "@/lib/types/database";
import { CLIENT_STATUS_LABELS } from "@/lib/types/database";

// ── Props ───────────────────────────────────────────────────────────────────

interface FlightPlansTabProps {
  flightPlans: FlightPlan[];
  flightPlanSteps: FlightPlanStep[];
  onSaveFlightPlan: (
    plan: { id?: string; name: string; description: string; trigger_status: ClientStatus | null; trigger_tag: string | null; is_active: boolean },
    steps: { step_order: number; delay_days: number; action_type: "task" | "email" | "text"; template: string }[],
  ) => Promise<void>;
  onDeleteFlightPlan: (planId: string) => Promise<void>;
  onToggleFlightPlan: (planId: string, isActive: boolean) => Promise<void>;
  onLoadDefaults: () => Promise<void>;
}

// ── Step Builder Row Type ───────────────────────────────────────────────────

interface StepRow {
  key: string;
  delay_days: number;
  action_type: "task" | "email" | "text";
  template: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FlightPlansTab({
  flightPlans,
  flightPlanSteps,
  onSaveFlightPlan,
  onDeleteFlightPlan,
  onToggleFlightPlan,
  onLoadDefaults,
}: FlightPlansTabProps) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // Builder form state
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [triggerStatus, setTriggerStatus] = useState<ClientStatus | "none">("boarding");
  const [triggerTag, setTriggerTag] = useState("");
  const [steps, setSteps] = useState<StepRow[]>([
    { key: crypto.randomUUID(), delay_days: 0, action_type: "task", template: "" },
  ]);

  const stepsForPlan = useMemo(() => {
    const map = new Map<string, FlightPlanStep[]>();
    for (const s of flightPlanSteps) {
      if (!map.has(s.flight_plan_id)) map.set(s.flight_plan_id, []);
      map.get(s.flight_plan_id)!.push(s);
    }
    // Sort by step_order
    for (const arr of map.values()) {
      arr.sort((a, b) => a.step_order - b.step_order);
    }
    return map;
  }, [flightPlanSteps]);

  function openCreateBuilder() {
    setEditingPlanId(null);
    setPlanName("");
    setPlanDescription("");
    setTriggerStatus("boarding");
    setTriggerTag("");
    setSteps([{ key: crypto.randomUUID(), delay_days: 0, action_type: "task", template: "" }]);
    setBuilderOpen(true);
  }

  function openEditBuilder(plan: FlightPlan) {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanDescription(plan.description || "");
    setTriggerStatus(plan.trigger_status ?? "none");
    setTriggerTag(plan.trigger_tag ?? "");
    const existingSteps = stepsForPlan.get(plan.id) ?? [];
    if (existingSteps.length > 0) {
      setSteps(
        existingSteps.map((s) => ({
          key: crypto.randomUUID(),
          delay_days: s.delay_days,
          action_type: s.action_type,
          template: s.template || "",
        })),
      );
    } else {
      setSteps([{ key: crypto.randomUUID(), delay_days: 0, action_type: "task", template: "" }]);
    }
    setBuilderOpen(true);
  }

  function addStep() {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
    setSteps((prev) => [
      ...prev,
      { key: crypto.randomUUID(), delay_days: lastDelay + 3, action_type: "task", template: "" },
    ]);
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }

  function updateStep(key: string, field: keyof StepRow, value: string | number) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
    );
  }

  async function handleLoadDefaultsClick() {
    setLoadingDefaults(true);
    await onLoadDefaults();
    setLoadingDefaults(false);
  }

  async function handleSave() {
    if (!planName.trim() || steps.length === 0) return;
    setSaving(true);
    await onSaveFlightPlan(
      {
        id: editingPlanId ?? undefined,
        name: planName.trim(),
        description: planDescription.trim(),
        trigger_status: triggerStatus === "none" ? null : triggerStatus,
        trigger_tag: triggerTag.trim() || null,
        is_active: true,
      },
      steps.map((s, i) => ({
        step_order: i + 1,
        delay_days: s.delay_days,
        action_type: s.action_type,
        template: s.template,
      })),
    );
    setSaving(false);
    setBuilderOpen(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plane className="h-5 w-5 text-sky-500" />
            Flight Plans
          </h2>
          <p className="text-sm text-muted-foreground">
            Automated task sequences triggered by Flight Status changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleLoadDefaultsClick}
            disabled={loadingDefaults}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            {loadingDefaults ? "Loading…" : "Load 20 Campaigns"}
          </Button>
          <Button size="sm" onClick={openCreateBuilder} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create Flight Plan
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {flightPlans.length === 0 && (
        <Card className="rounded-2xl border-dashed border-2 border-sky-200 bg-sky-50/30">
          <CardContent className="py-12 text-center space-y-3">
            <Sparkles className="h-12 w-12 text-amber-300 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">
              Start with 20 Pre-Built Campaigns
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Load industry-proven drip campaigns — New Buyer Speed Blitz, Seller
              Valuation Nurture, Post-Closing Follow-Up, Past Client SOI, and 16 more.
              Every campaign is editable, pausable, and deletable.
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Button size="sm" onClick={handleLoadDefaultsClick} disabled={loadingDefaults} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {loadingDefaults ? "Loading…" : "Load 20 Pre-Built Campaigns"}
              </Button>
              <Button size="sm" variant="outline" onClick={openCreateBuilder} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Build From Scratch
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan list */}
      <div className="space-y-3">
        {flightPlans.map((plan) => {
          const planSteps = stepsForPlan.get(plan.id) ?? [];
          const totalDays =
            planSteps.length > 0
              ? Math.max(...planSteps.map((s) => s.delay_days))
              : 0;

          return (
            <Card key={plan.id} className={cn("rounded-2xl shadow-sm", !plan.is_active && "opacity-60")}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                      {plan.is_system && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-200 gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" />
                          Default
                        </Badge>
                      )}
                      {plan.trigger_status && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-sky-50 text-sky-700 border-sky-200">
                          Fires → {CLIENT_STATUS_LABELS[plan.trigger_status]}
                        </Badge>
                      )}
                      {plan.trigger_tag && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-violet-50 text-violet-700 border-violet-200 gap-0.5">
                          <Tag className="h-2.5 w-2.5" />
                          {plan.trigger_tag}
                        </Badge>
                      )}
                      {!plan.is_active && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-gray-50 text-gray-500 border-gray-200">
                          Paused
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {planSteps.length} step{planSteps.length !== 1 ? "s" : ""}
                      {totalDays > 0 ? ` over ${totalDays} days` : ""}
                    </p>

                    {/* Mini timeline */}
                    {planSteps.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {planSteps.map((step, i) => (
                          <div key={step.id} className="flex items-center gap-1">
                            <div className="flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5">
                              <span className="text-[9px] font-semibold text-sky-600">
                                Day {step.delay_days}
                              </span>
                              <span className="text-[9px] text-sky-500">·</span>
                              <span className="text-[9px] text-sky-700">
                                {step.action_type === "task" ? "📋" : step.action_type === "email" ? "✉️" : "💬"}
                              </span>
                            </div>
                            {i < planSteps.length - 1 && (
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={plan.is_active}
                      onCheckedChange={(checked) => onToggleFlightPlan(plan.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditBuilder(plan)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      onClick={() => onDeleteFlightPlan(plan.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Builder Dialog                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlanId ? "Edit Flight Plan" : "Create Flight Plan"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs">Plan Name</Label>
              <Input
                placeholder="e.g. New Lead Welcome Sequence"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                placeholder="What does this flight plan do?"
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Trigger Status */}
            <div className="space-y-1">
              <Label className="text-xs">Trigger: Fire when status changes to</Label>
              <Select
                value={triggerStatus}
                onValueChange={(v) => setTriggerStatus(v as ClientStatus | "none")}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trigger (manual only)</SelectItem>
                  <SelectItem value="boarding">Boarding — Active lead, not yet under contract</SelectItem>
                  <SelectItem value="scheduled">Scheduled — Plans to act later</SelectItem>
                  <SelectItem value="in_flight">In-Flight — Under contract</SelectItem>
                  <SelectItem value="cruising">Cruising — Past client / long-term nurture</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trigger Tag (optional) */}
            {triggerStatus !== "none" && (
              <div className="space-y-1">
                <Label className="text-xs">Also require client tag (optional)</Label>
                <Input
                  placeholder="e.g. Buyer, Seller, Investor, First-Time Buyer"
                  value={triggerTag}
                  onChange={(e) => setTriggerTag(e.target.value)}
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  If set, this plan only fires when the client has this tag AND the status changes.
                </p>
              </div>
            )}

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Steps</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addStep}
                  className="h-6 text-[10px] px-2 gap-1"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Add Step
                </Button>
              </div>

              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={step.key}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Step {idx + 1}
                      </span>
                      {steps.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                          onClick={() => removeStep(step.key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">Delay (days)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={step.delay_days}
                          onChange={(e) =>
                            updateStep(step.key, "delay_days", parseInt(e.target.value) || 0)
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">Action</Label>
                        <Select
                          value={step.action_type}
                          onValueChange={(v) =>
                            updateStep(step.key, "action_type", v)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="task">
                              <span className="flex items-center gap-1.5">
                                <ListTodo className="h-3 w-3" />
                                Task
                              </span>
                            </SelectItem>
                            <SelectItem value="email">
                              <span className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                Email
                              </span>
                            </SelectItem>
                            <SelectItem value="text">
                              <span className="flex items-center gap-1.5">
                                <MessageSquare className="h-3 w-3" />
                                Text
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <Label className="text-[10px]">
                        {step.action_type === "task" ? "Task Title" : "Template"}
                      </Label>
                      <Input
                        placeholder={
                          step.action_type === "task"
                            ? "e.g. Send welcome email to {name}"
                            : "Template content…"
                        }
                        value={step.template}
                        onChange={(e) =>
                          updateStep(step.key, "template", e.target.value)
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual timeline preview */}
            {steps.length > 0 && (
              <div className="border-t border-border/40 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Timeline Preview
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1">
                    <span className="text-[10px] font-semibold text-emerald-700">Trigger</span>
                  </div>
                  {steps.map((step) => (
                    <div key={step.key} className="flex items-center gap-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      <div className="rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1">
                        <span className="text-[10px] font-semibold text-sky-700">
                          Day {step.delay_days} · {step.action_type === "task" ? "📋" : step.action_type === "email" ? "✉️" : "💬"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/40">
              <Button
                size="sm"
                disabled={!planName.trim() || steps.length === 0 || saving}
                onClick={handleSave}
                className="gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                {saving ? "Saving…" : editingPlanId ? "Update Plan" : "Create Plan"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBuilderOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
