"use client";

import type { FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { hasActiveFilters, type EventSearchFilters, type LocationFacet } from "../types/event-search.dto";
import { EventSearchInput } from "./event-search-input";

interface EventSearchBarProps {
  filters: EventSearchFilters;
  onFiltersChange: (filters: EventSearchFilters) => void;
  locations: LocationFacet[];
  /** Há uma busca aplicada (mostra "Limpar" mesmo com o formulário vazio). */
  active: boolean;
  searching: boolean;
  onSearch: (filters: EventSearchFilters) => void;
  onClear: () => void;
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function EventSearchBar({ filters, onFiltersChange, locations, active, searching, onSearch, onClear }: EventSearchBarProps) {
  function update<K extends keyof EventSearchFilters>(key: K, value: EventSearchFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  const invalidPeriod = filters.from !== "" && filters.to !== "" && filters.from > filters.to;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invalidPeriod) onSearch(filters);
  }

  return (
    <form role="search" aria-label="Buscar eventos" onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex gap-2">
        <Label htmlFor="search-q" className="sr-only">
          Buscar eventos
        </Label>
        <EventSearchInput id="search-q" value={filters.q} onChange={(q) => update("q", q)} />
        <Button type="submit" disabled={searching || invalidPeriod}>
          Buscar
        </Button>
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="search-location">Local</Label>
          <select
            id="search-location"
            className={SELECT_CLASS}
            value={filters.location}
            onChange={(event) => update("location", event.target.value)}
            disabled={locations.length === 0}
          >
            <option value="">Todos os locais</option>
            {locations.map((location) => (
              <option key={location.value} value={location.value}>
                {location.value} ({location.count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-from">De</Label>
          <Input
            id="search-from"
            type="date"
            value={filters.from}
            onChange={(event) => update("from", event.target.value)}
            aria-invalid={invalidPeriod || undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-to">Até</Label>
          <Input
            id="search-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => update("to", event.target.value)}
            aria-invalid={invalidPeriod || undefined}
          />
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="search-available"
            checked={filters.onlyAvailable}
            onCheckedChange={(checked) => update("onlyAvailable", checked === true)}
          />
          <Label htmlFor="search-available">Só com ingressos disponíveis</Label>
        </div>
      </div>

      {invalidPeriod ? (
        <p role="alert" className="text-sm text-destructive">
          A data inicial precisa ser anterior ou igual à final.
        </p>
      ) : null}

      {active || hasActiveFilters(filters) ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Limpar busca
        </Button>
      ) : null}
    </form>
  );
}
