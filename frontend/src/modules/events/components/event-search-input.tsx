"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { formatShortDateTime } from "@/shared/lib/format";
import { useEventSuggestions } from "../hooks/useEventSuggestions";
import {
  MAX_QUERY_LENGTH,
  type EventSuggestion,
} from "../types/event-search.dto";

interface EventSearchInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Campo de texto com autocomplete (padrão ARIA combobox). Escolher uma sugestão abre o evento;
 * Enter sem sugestão destacada envia o formulário (busca completa).
 */
export function EventSearchInput({
  id,
  value,
  onChange,
}: EventSearchInputProps) {
  const router = useRouter();
  const listId = useId();
  const { suggestions, loading } = useEventSuggestions(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const expanded = open && suggestions.length > 0;
  const active = highlighted < suggestions.length ? highlighted : -1;

  function choose(suggestion: EventSuggestion) {
    setOpen(false);
    router.push(`/events/${suggestion.id}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!expanded) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((active + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(active <= 0 ? suggestions.length - 1 : active - 1);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]);
    }
  }

  return (
    <div className="relative flex-1">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Buscar por evento, artista ou local"
        className="pl-8"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {loading ? (
        <Loader2Icon
          className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-label="Buscando sugestões"
        />
      ) : null}
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestões de eventos"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm",
                index === active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              // mousedown dispararia o blur do input antes do click e fecharia a lista
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
            >
              <span className="font-medium">{suggestion.name}</span>
              <span className="text-xs text-muted-foreground">
                {suggestion.location} ·{" "}
                {formatShortDateTime(suggestion.starts_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
