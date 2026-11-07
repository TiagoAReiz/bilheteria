"use client";

import { useEffect, useState } from "react";

/**
 * Relógio lido depois de montar (null no pré-render do servidor): o Next não permite
 * `Date.now()` durante a renderização de páginas pré-renderizadas, e o valor do servidor
 * divergiria do navegador.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);
  return now;
}
