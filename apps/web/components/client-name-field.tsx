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

/**
 * For a dialog's onEscapeKeyDown. Radix hears Escape before the box does and would
 * close the whole dialog, so while a client list shows, Escape closes only the list.
 */
export function keepEscapeForClientList(event: { target: EventTarget | null; preventDefault: () => void }) {
  const box = event.target instanceof Element ? event.target.closest('[role="combobox"]') : null;
  if (box?.getAttribute("aria-expanded") === "true") event.preventDefault();
}

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
  // With free text allowed nothing starts highlighted: Enter must not swap the name typed for a client's.
  const noHighlight = freeTextHint ? -1 : 0;
  const [active, setActive] = useState(noHighlight);
  // The text the list was found for. Enter never picks from a list older than what's in the box.
  const [listFor, setListFor] = useState("");
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
        setListFor(typed);
        setActive(noHighlight);
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
  }, [typed, search, noHighlight]);

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
          aria-activedescendant={showList && active >= 0 ? `${baseId}-option-${active}` : undefined}
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
            // The dialog leaves Escape to this box while the list shows (keepEscapeForClientList).
            if (e.key === "Escape" && showList) {
              setOpen(false);
              return;
            }
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (listFor === typed && suggestions[active]) pick(suggestions[active]);
            }
          }}
        />
        {value.id && (
          <Check
            aria-label="Client linked"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600"
          />
        )}
        {/* Floats over the boxes below, so opening and closing it never moves the Save button. */}
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
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
      </div>
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
