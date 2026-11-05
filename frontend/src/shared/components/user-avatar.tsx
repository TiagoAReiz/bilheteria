import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { initials } from "@/shared/lib/format";
import type { User } from "@/shared/types/user";

/** Avatar enviado pelo usuário ou, sem ele, a foto do Google/Facebook; sem nenhum, as iniciais. */
export function UserAvatar({
  user,
  size,
}: {
  user: Pick<User, "name" | "image" | "avatarUrl">;
  size?: "sm" | "default" | "lg";
}) {
  const src = user.avatarUrl ?? user.image;
  return (
    <Avatar size={size}>
      {src ? <AvatarImage src={src} alt={user.name} /> : null}
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
