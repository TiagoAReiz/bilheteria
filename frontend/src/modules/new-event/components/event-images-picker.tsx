"use client";

import { ImageIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { ImageFileButton } from "@/shared/components/image-file-button";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { validateImageFile } from "@/shared/lib/image-upload";
import { MAX_EVENT_PHOTOS } from "@/modules/event-detail/types/event-detail.dto";
import type { PendingEventImages } from "../services/upload-event-images";

/** Capa e galeria escolhidas no formulário de criação; sobem logo depois que o evento é criado. */
export function EventImagesPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PendingEventImages;
  onChange: (value: PendingEventImages) => void;
  disabled?: boolean;
}) {
  function accept(file: File): boolean {
    const invalid = validateImageFile(file);
    if (invalid) toast.error(invalid);
    return !invalid;
  }

  const full = value.photos.length >= MAX_EVENT_PHOTOS;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        <Label>Capa (opcional)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <ImageFileButton
            label="Escolher capa"
            disabled={disabled}
            onFile={(file) => {
              if (accept(file)) onChange({ ...value, cover: file });
            }}
          >
            <ImageIcon aria-hidden />{" "}
            {value.cover ? "Trocar capa" : "Escolher capa"}
          </ImageFileButton>
          {value.cover ? (
            <FileChip
              name={value.cover.name}
              onRemove={() => onChange({ ...value, cover: null })}
              disabled={disabled}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          Galeria (opcional, {value.photos.length}/{MAX_EVENT_PHOTOS})
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <ImageFileButton
            label="Adicionar foto"
            disabled={disabled || full}
            onFile={(file) => {
              if (accept(file))
                onChange({ ...value, photos: [...value.photos, file] });
            }}
          >
            <ImageIcon aria-hidden /> Adicionar foto
          </ImageFileButton>
          {value.photos.map((photo, index) => (
            <FileChip
              key={`${photo.name}-${index}`}
              name={photo.name}
              disabled={disabled}
              onRemove={() =>
                onChange({
                  ...value,
                  photos: value.photos.filter((_, i) => i !== index),
                })
              }
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          JPEG, PNG ou WebP de até 5 MB. As imagens sobem logo depois que o
          evento for criado.
        </p>
      </div>
    </div>
  );
}

function FileChip({
  name,
  onRemove,
  disabled,
}: {
  name: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm">
      {name}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5"
        aria-label={`Remover ${name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
    </span>
  );
}
