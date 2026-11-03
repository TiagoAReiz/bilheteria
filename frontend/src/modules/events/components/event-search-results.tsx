"use client";

import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatNumber } from "@/shared/lib/format";
import type { SearchEventsResponse } from "../types/event-search.dto";
import { EventCard } from "./event-card";

interface EventSearchResultsProps {
  result: SearchEventsResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onClear: () => void;
}

export function EventSearchResults({ result, loading, error, page, onPageChange, onRetry, onClear }: EventSearchResultsProps) {
  return (
    <section className="space-y-6" aria-live="polite">
      <h1 className="text-3xl font-bold tracking-tight">Resultados da busca</h1>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" data-testid="search-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível buscar os eventos</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={onRetry}>
                Tentar novamente
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Ver todos os eventos
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : !result || result.items.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum evento encontrado com esses filtros.</p>
          <Button variant="link" onClick={onClear}>
            Ver todos os eventos
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.total === 1 ? "1 evento encontrado" : `${formatNumber(result.total)} eventos encontrados`}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
          <Pagination page={page} total={result.total} size={result.size} onPageChange={onPageChange} />
        </>
      )}
    </section>
  );
}

function Pagination({ page, total, size, onPageChange }: { page: number; total: number; size: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (totalPages === 1) return null;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}
