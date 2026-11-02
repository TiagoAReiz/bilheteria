"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  status: number | undefined;
  reload: () => Promise<void>;
}

/**
 * Executa `fn` ao montar e sempre que `key` mudar, expondo dados/erro/loading.
 * `fn` pode ser uma arrow inline: a versão mais recente é guardada num ref.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string | number = ""): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | undefined>(undefined);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
      setStatus(undefined);
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus(getErrorStatus(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fnRef.current().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setStatus(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setStatus(getErrorStatus(err));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { data, loading, error, status, reload };
}
