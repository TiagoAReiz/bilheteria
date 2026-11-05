import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { UserAvatar } from "@/shared/components/user-avatar";
import type { Role, User } from "@/shared/types/user";
import { AvatarEditor } from "./avatar-editor";

export const roleLabels: Record<Role, string> = {
  USER: "Usuário",
  ORGANIZER: "Organizador",
  ADMIN: "Administrador",
};

export function ProfileCard({
  user,
  onAvatarChanged,
}: {
  user: User;
  onAvatarChanged?: () => Promise<void> | void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <UserAvatar user={user} size="lg" />
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{user.name}</CardTitle>
          <CardDescription className="truncate">{user.email}</CardDescription>
          <AvatarEditor user={user} onChanged={onAvatarChanged} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Perfil</dt>
            <dd>
              <Badge variant="secondary">
                {roleLabels[user.role] ?? user.role}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-mail verificado</dt>
            <dd>{user.emailVerified ? "Sim" : "Não"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Membro desde</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
