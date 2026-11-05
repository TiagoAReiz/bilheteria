"use client";

import { ArrowLeftIcon, ArrowRightIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { EventPhoto } from "../types/event-detail.dto";

/** Galeria em grade. Com `onMove`/`onRemove` (dono do evento) mostra os controles de cada foto. */
export function EventGallery({
  photos,
  eventName,
  disabled = false,
  onMove,
  onRemove,
}: {
  photos: EventPhoto[];
  eventName: string;
  disabled?: boolean;
  onMove?: (photoId: number, direction: -1 | 1) => void;
  onRemove?: (photoId: number) => void;
}) {
  if (photos.length === 0) return null;
  const editable = Boolean(onMove && onRemove);

  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      aria-label="Galeria de fotos"
    >
      {photos.map((photo, index) => (
        <li key={photo.id} className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do bucket (S3/LocalStack), sem otimização do Next */}
          <img
            src={photo.url}
            alt={`Foto ${index + 1} de ${eventName}`}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-lg border object-cover"
          />
          {editable ? (
            <div className="flex justify-between gap-1">
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Mover foto ${index + 1} para a esquerda`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove?.(photo.id, -1)}
                >
                  <ArrowLeftIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Mover foto ${index + 1} para a direita`}
                  disabled={disabled || index === photos.length - 1}
                  onClick={() => onMove?.(photo.id, 1)}
                >
                  <ArrowRightIcon aria-hidden />
                </Button>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={`Remover foto ${index + 1}`}
                disabled={disabled}
                onClick={() => onRemove?.(photo.id)}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
