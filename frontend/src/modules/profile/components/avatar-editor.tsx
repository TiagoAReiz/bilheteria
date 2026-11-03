"use client";

import { CameraIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ImageFileButton } from "@/shared/components/image-file-button";
import { Button } from "@/shared/components/ui/button";
import type { User } from "@/shared/types/user";
import { useAvatar } from "../hooks/useAvatar";

/** Trocar a foto de perfil; "Remover" só aparece quando há uma foto enviada (volta para a do Google). */
export function AvatarEditor({ user, onChanged }: { user: Pick<User, "avatarKey">; onChanged?: () => Promise<void> | void }) {
  const { change, remove, uploading, removing } = useAvatar(onChanged);

  async function handle(operation: Promise<string | null>, success: string) {
    const failure = await operation;
    if (failure) toast.error(failure);
    else toast.success(success);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ImageFileButton
        label="Escolher foto de perfil"
        loading={uploading}
        disabled={removing}
        onFile={(file) => void handle(change(file), "Foto de perfil atualizada.")}
      >
        <CameraIcon aria-hidden /> Trocar foto
      </ImageFileButton>
      {user.avatarKey ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={uploading || removing}
          onClick={() => void handle(remove(), "Foto removida.")}
        >
          <Trash2Icon aria-hidden /> Remover foto
        </Button>
      ) : null}
    </div>
  );
}
