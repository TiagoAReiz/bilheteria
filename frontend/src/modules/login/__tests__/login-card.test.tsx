import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeUser, nestError, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { hardRedirect } from "@/shared/lib/navigation";
import { LoginCard } from "../components/login-card";
import { loginService } from "../services/login.service";

const replace = jest.fn();
let search = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => search,
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/shared/lib/navigation", () => ({ hardRedirect: jest.fn() }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/login.service", () => ({ loginService: { signInSocial: jest.fn() } }));

const signInSocial = jest.mocked(loginService.signInSocial);

describe("<LoginCard />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = new URLSearchParams();
    jest.mocked(useSession).mockReturnValue(sessionValue(null));
  });

  it("Entrar com Google: pede a URL ao backend com callback absoluto e redireciona", async () => {
    search = new URLSearchParams("redirect=/events/4");
    signInSocial.mockResolvedValue({ url: "https://accounts.google.com/o/oauth", redirect: true });
    render(<LoginCard />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar com Google" }));

    expect(signInSocial).toHaveBeenCalledWith("google", "http://localhost/events/4");
    expect(hardRedirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth");
  });

  it("Entrar com Facebook usa o provider facebook e ignora redirect externo", async () => {
    search = new URLSearchParams("redirect=https://evil.com");
    signInSocial.mockResolvedValue({ url: "https://facebook.com/dialog", redirect: true });
    render(<LoginCard />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar com Facebook" }));
    expect(signInSocial).toHaveBeenCalledWith("facebook", "http://localhost/");
  });

  it("mostra toast se o backend falhar", async () => {
    signInSocial.mockRejectedValue(nestError(500, "Provider not found"));
    render(<LoginCard />);
    await userEvent.click(screen.getByRole("button", { name: "Entrar com Google" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Provider not found"));
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("já logado: redireciona para o destino", () => {
    search = new URLSearchParams("redirect=/profile");
    jest.mocked(useSession).mockReturnValue(sessionValue(makeUser()));
    render(<LoginCard />);
    expect(replace).toHaveBeenCalledWith("/profile");
  });
});
