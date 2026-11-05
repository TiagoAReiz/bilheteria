"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarIcon,
  CalendarPlusIcon,
  LogOutIcon,
  TicketIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { useSession } from "@/shared/hooks/useSession";
import { getErrorMessage } from "@/shared/lib/api-error";
import { cn } from "@/shared/lib/utils";

const links = [
  { href: "/", label: "Eventos", icon: CalendarIcon },
  { href: "/my-tickets", label: "Minhas reservas", icon: TicketIcon },
  { href: "/profile", label: "Meu perfil", icon: UserIcon },
  { href: "/events/new", label: "Criar evento", icon: CalendarPlusIcon },
];

export function PrivateSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useSession();

  async function handleSignOut() {
    try {
      await signOut();
      toast.success("Você saiu da sua conta.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível sair."));
    } finally {
      router.replace("/");
    }
  }

  return (
    <aside className="border-b bg-sidebar text-sidebar-foreground md:fixed md:top-16 md:bottom-0 md:left-0 md:w-60 md:border-r md:border-b-0">
      <nav className="flex gap-1 overflow-x-auto p-3 md:h-full md:flex-col">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:bg-sidebar-accent",
              pathname === href && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
        <Button
          variant="ghost"
          className="justify-start gap-2 px-3 md:mt-auto"
          onClick={handleSignOut}
        >
          <LogOutIcon className="size-4" aria-hidden />
          Sair
        </Button>
      </nav>
    </aside>
  );
}
