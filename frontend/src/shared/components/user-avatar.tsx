import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { initials } from "@/shared/lib/format";
import type { User } from "@/shared/types/user";

export function UserAvatar({ user, size }: { user: Pick<User, "name" | "image">; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar size={size}>
      {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
