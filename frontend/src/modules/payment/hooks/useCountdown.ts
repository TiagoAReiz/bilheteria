"use client";

import { useEffect, useState } from "react";

/** Milissegundos que faltam até `target`, atualizado a cada segundo (0 depois que passa). */
export function useCountdown(target: Date | string | null) {
  const targetMs = target === null ? null : new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= targetMs) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  const remainingMs = targetMs === null ? 0 : Math.max(0, targetMs - now);
  return { remainingMs, expired: targetMs !== null && remainingMs === 0 };
}

/** 272000 -> "04:32" */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
