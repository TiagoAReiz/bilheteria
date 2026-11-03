"use client";

import { ImageIcon, ImagePlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ImageFileButton } from "@/shared/components/image-file-button";
import { Button } from "@/shared/components/ui/button";
import type { useEventImages } from "../hooks/useEventImages";
import { MAX_EVENT_PHOTOS } from "../types/event-detail.dto";

type EventImages = ReturnType<typeof useEventImages>;

/** Mostra o resultado de uma operação: toast de erro ou de sucesso. */
async function notify(operation: Promise<string | null>, success: string) {
  const failure = await operation;
  if (failure) toast.error(failure);
  else toast.success(success);
}

/** Controles do organizador: capa (enviar/trocar/remover) e galeria (adicionar até 10). */
export function EventImagesToolbar({ images }: { images: EventImages }) {
  const galleryFull = images.photos.length >= MAX_EVENT_PHOTOS;

  return (
    <section className="space-y-2 rounded-lg border border-dashed p-3" aria-label="Imagens do evento">
      <div className="flex flex-wrap items-center gap-2">
        <ImageFileButton
          label="Escolher imagem da capa"
          loading={images.uploadingCover}
          disabled={images.busy}
          onFile={(file) => void notify(images.uploadCover(file), "Capa atualizada.")}
        >
          <ImageIcon aria-hidden />
          {images.coverUrl ? "Trocar capa" : "Adicionar capa"}
        </ImageFileButton>
        {images.coverUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={images.busy}
            onClick={() => void notify(images.removeCover(), "Capa removida.")}
          >
            <Trash2Icon aria-hidden /> Remover capa
          </Button>
        ) : null}
        <ImageFileButton
          label="Escolher foto para a galeria"
          loading={images.uploadingPhoto}
          disabled={images.busy || galleryFull}
          onFile={(file) => void notify(images.addPhoto(file), "Foto adicionada à galeria.")}
        >
          <ImagePlusIcon aria-hidden />
          Adicionar foto ({images.photos.length}/{MAX_EVENT_PHOTOS})
        </ImageFileButton>
      </div>
      <p className="text-xs text-muted-foreground">
        JPEG, PNG ou WebP de até 5 MB. {galleryFull ? "A galeria está cheia: remova uma foto para adicionar outra." : null}
      </p>
    </section>
  );
}
