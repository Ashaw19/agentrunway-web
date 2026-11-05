"use client";

/**
 * A client box that takes a name. Suggestions appear from the first letter, and
 * typing a client's whole name links them without a click. Holds what was typed
 * and the linked client's id, which is null until a client is linked.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  exactClientMatch,
  fetchClientSuggestions,
  type ClientSuggestion,
} from "@/lib/crm/client-suggest";
import { cn } from "@/lib/utils";

export interface ClientNameValue {
  id: string | null;
  name: string;
}

export const NO_CLIENT: ClientNameValue = { id: null, name: "" };

const SEARCH_DELAY_MS = 150;

async function searchMyClients(typed: string): Promise<ClientSuggestion[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return fetchClientSuggestions(supabase, user.id, typed);
}

export function ClientNameField({
  label,
  value,
  onChange,
  placeholder = "Start typing a name",
  freeTextHint,
  search = searchMyClients,
}: {
  label: string;
  value: ClientNameValue;
  onChange: (value: ClientNameValue) => void;
  placeholder?: string;
  /** Shown when nothing matches and a name that isn't a client is allowed. */
  freeTextHint?: string;
  search?: (typed: string) => Promise<ClientSuggestion[]>;
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "done" | "failed">("idle");
  const latest = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The newest props for the search's callback, which outlives the render that started it.
  const current = useRef({ value, onChange });
  current.current = { value, onChange };

  const typed = value.id ? "" : value.name;
  useEffect(() => {
    const request = ++latest.current;
    if (!typed.trim()) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const found = await search(typed);
        if (request !== latest.current) return;
        setSuggestions(found);
        setActive(0);
        setStatus("done");
        const exact = exactClientMatch(typed, found);
        if (exact && current.current.value.name === typed && !current.current.value.id) {
          current.current.onChange({ id: exact.id, name: exact.name });
        }
      } catch {
        if (request !== latest.current) return;
        setSuggestions([]);
        setStatus("failed");
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed, search]);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  function pick(client: ClientSuggestion) {
    onChange({ id: client.id, name: client.name });
    setOpen(false);
  }

  const showList = open && suggestions.length > 0;
  const showNoMatch = open && !value.id && status === "done" && suggestions.length === 0 && !!value.name.trim();
  const showFailed = open && !value.id && status === "failed";

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${baseId}-input`}>{label}</Label>
      <div className="relative">
        <Input
          id={`${baseId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${baseId}-option-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={value.name}
          className={cn(value.id && "pr-9")}
          onChange={(e) => {
            onChange({ id: null, name: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Tab") {
              // Takes the highlighted client and still moves on to the next box.
              pick(suggestions[active]);
            }
          }}
        />
        {value.id && (
          <Check
            aria-label="Client linked"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600"
          />
        )}
      </div>
      {/* In the page flow, not floating: a dialog's scroll area would cut a floating list off. */}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="max-h-56 overflow-auto rounded-md border bg-popover p-1 shadow-sm"
        >
          {suggestions.map((client, i) => (
            <li
              key={client.id}
              id={`${baseId}-option-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-2 text-sm",
                i === active && "bg-accent text-accent-foreground",
                client.id === value.id && "font-medium",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(client)}
            >
              {client.name}
            </li>
          ))}
        </ul>
      )}
      {showNoMatch && (
        <p className="text-xs text-muted-foreground">
          {freeTextHint ?? "No client has that name. Add them in the CRM first."}
        </p>
      )}
      {showFailed && (
        <p className="text-xs text-amber-700">Your clients didn&apos;t load. Keep typing to try again.</p>
      )}
    </div>
  );
}
