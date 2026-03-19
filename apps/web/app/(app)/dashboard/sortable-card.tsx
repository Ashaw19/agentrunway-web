"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableCardProps {
  id: string;
  label: string;
  customizeMode: boolean;
  onHide: () => void;
  children: React.ReactNode;
}

export function SortableCard({ id, label, customizeMode, onHide, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "z-50 opacity-60 shadow-2xl")}
    >
      {customizeMode && (
        <div className="flex items-center justify-between rounded-t-xl bg-slate-100 border border-b-0 border-slate-200 px-3 py-1.5">
          <div
            className="flex items-center gap-2 cursor-grab active:cursor-grabbing touch-none select-none"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">{label}</span>
          </div>
          <button
            onClick={onHide}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
          >
            <EyeOff className="h-3 w-3" />
            <span>Hide</span>
          </button>
        </div>
      )}
      <div className={cn(customizeMode && "[&>*:first-child]:rounded-t-none [&_.rounded-2xl:first-child]:rounded-t-none [&_.rounded-xl:first-child]:rounded-t-none")}>
        {children}
      </div>
    </div>
  );
}
