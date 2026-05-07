"use client";

import { useState } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorpVendor } from "@agent-runway/core/types/database";

interface EditState {
  vendor: CorpVendor;
  corpPct: number;
  rationale: string;
  busy: boolean;
  error: string | null;
}

export function AllocationPanel({ vendors: initial }: { vendors: CorpVendor[] }) {
  const [vendors, setVendors] = useState<CorpVendor[]>(initial);
  const [editing, setEditing] = useState<EditState | null>(null);

  function openEdit(vendor: CorpVendor) {
    setEditing({
      vendor,
      corpPct: vendor.corp_pct,
      rationale: "",
      busy: false,
      error: null,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setEditing((e) => e && { ...e, busy: true, error: null });

    const res = await fetch(`/api/cockpit/allocations/${editing.vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        corp_pct:       editing.corpPct,
        rationale_text: editing.rationale,
      }),
    });

    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setEditing((e) => e && { ...e, busy: false, error: json.error ?? "Save failed" });
      return;
    }

    // Optimistic: update the local list so the table reflects the new split
    // without a full page reload.
    setVendors((vs) =>
      vs.map((v) =>
        v.id === editing.vendor.id ? { ...v, corp_pct: editing.corpPct } : v,
      ),
    );
    setEditing(null);
  }

  // Sort: mixed-split vendors (corp_pct < 100) first so they're easy to find.
  const sorted = [...vendors].sort((a, b) => a.corp_pct - b.corp_pct);

  return (
    <>
      {editing && (
        <EditModal
          state={editing}
          onChange={(patch) => setEditing((e) => e && { ...e, ...patch })}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
            Allocation ratios
          </h2>
          <span className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline">
            Corp% · Personal% · applied to new transactions
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-muted-foreground/60 px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.08em] uppercase">
                  Vendor
                </th>
                <th className="text-muted-foreground/60 px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.08em] uppercase">
                  Corp%
                </th>
                <th className="text-muted-foreground/60 px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.08em] uppercase">
                  Personal%
                </th>
                <th className="w-12 px-4 py-2.5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const isMixed = v.corp_pct < 100;
                return (
                  <tr
                    key={v.id}
                    className="group border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">
                      <span className={cn("font-medium", isMixed ? "text-foreground/90" : "text-foreground/60")}>
                        {v.name}
                      </span>
                      {v.notes && (
                        <span className="text-muted-foreground/40 ml-2 text-[11px]">
                          {v.notes.slice(0, 40)}{v.notes.length > 40 ? "…" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={cn(
                          "font-mono tabular-nums text-[13px]",
                          isMixed ? "text-amber-300" : "text-foreground/50",
                        )}
                      >
                        {v.corp_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-muted-foreground/50 font-mono tabular-nums text-[13px]">
                        {100 - v.corp_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => openEdit(v)}
                        className="text-muted-foreground/40 hover:text-foreground opacity-0 transition-all group-hover:opacity-100"
                        title={`Edit allocation for ${v.name}`}
                        aria-label={`Edit allocation for ${v.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground/50 text-[11px]">
          Editing a ratio updates future transactions only — existing ledger entries keep their original split.
        </p>
      </section>
    </>
  );
}

function EditModal({
  state,
  onChange,
  onSave,
  onClose,
}: {
  state: EditState;
  onChange: (patch: Partial<EditState>) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const personalPct = Math.round((100 - state.corpPct) * 100) / 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[oklch(0.26_0.055_262)] p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <SlidersHorizontal className="text-amber-300/70 h-4 w-4" aria-hidden />
          <h2 className="text-foreground text-base font-semibold">Edit allocation</h2>
        </div>
        <p className="text-muted-foreground/80 mb-5 text-sm">{state.vendor.name}</p>

        <div className="space-y-4">
          <div>
            <label className="text-muted-foreground/70 mb-1.5 block text-[11px] tracking-[0.08em] uppercase">
              Corp%
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={state.corpPct}
                onChange={(e) => onChange({ corpPct: Number(e.target.value) })}
                className="h-1.5 flex-1 accent-amber-400"
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={state.corpPct}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)));
                  onChange({ corpPct: v });
                }}
                className="bg-white/[0.06] text-foreground w-16 rounded-lg border border-white/[0.08] px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <span className="text-muted-foreground/60 text-sm font-mono">%</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm">
            <span className="text-muted-foreground/70">Personal%</span>
            <span className="text-foreground/70 font-mono tabular-nums">{personalPct}%</span>
          </div>

          <div>
            <label className="text-muted-foreground/70 mb-1.5 block text-[11px] tracking-[0.08em] uppercase">
              Rationale <span className="text-white/30">(optional)</span>
            </label>
            <textarea
              className="bg-white/[0.04] text-foreground placeholder-muted-foreground/40 focus:ring-amber-500/40 w-full rounded-lg border border-white/[0.08] p-3 text-sm focus:ring-2 focus:outline-none"
              rows={2}
              placeholder="Why this split? e.g. sq-ft basis, % of phone usage"
              value={state.rationale}
              onChange={(e) => onChange({ rationale: e.target.value })}
            />
          </div>
        </div>

        {state.error && (
          <p className="mt-3 text-sm text-rose-400">{state.error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={state.busy}
            className="text-muted-foreground/80 hover:text-foreground rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={state.busy}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {state.busy ? "Saving…" : "Save allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}
