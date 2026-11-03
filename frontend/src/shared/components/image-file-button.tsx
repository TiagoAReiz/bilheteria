"use client";

import { useRef, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ALLOWED_IMAGE_TYPES } from "@/shared/types/image";

/** Botão que abre o seletor de arquivo (só JPEG/PNG/WebP) e entrega o arquivo escolhido. */
export function ImageFileButton({
  onFile,
  loading = false,
  disabled = false,
  label,
  children,
  variant = "outline",
}: {
  onFile: (file: File) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Nome acessível do input de arquivo. */
  label: string;
  children: ReactNode;
  variant?: "outline" | "default" | "secondary";
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // limpa para o mesmo arquivo poder ser escolhido de novo
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={disabled || loading}
        onClick={() => input.current?.click()}
      >
        {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {children}
      </Button>
    </>
  );
}
