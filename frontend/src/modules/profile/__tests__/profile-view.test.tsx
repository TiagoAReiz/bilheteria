import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeUser, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { ProfileView } from "../components/profile-view";
import { profileService } from "../services/profile.service";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/profile.service", () => ({
  profileService: { getMe: jest.fn(), registerCpf: jest.fn(), becomeOrganizer: jest.fn() },
}));

const svc = jest.mocked(profileService);

describe("<ProfileView />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(useSession).mockReturnValue(sessionValue(makeUser()));
  });

  it("mostra os dados do usuário e o botão de organizador para USER", async () => {
    svc.getMe.mockResolvedValue(makeUser({ name: "João", email: "joao@x.com" }));
    render(<ProfileView />);

    expect(await screen.findByText("João")).toBeInTheDocument();
    expect(screen.getByText("joao@x.com")).toBeInTheDocument();
    expect(screen.getByText("Usuário")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quero ser organizador" })).toBeInTheDocument();
  });

  it("não mostra o botão para ORGANIZER", async () => {
    svc.getMe.mockResolvedValue(makeUser({ role: "ORGANIZER" }));
    render(<ProfileView />);
    expect(await screen.findByText("Organizador")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quero ser organizador" })).not.toBeInTheDocument();
  });

  it("vira organizador e recarrega perfil e sessão", async () => {
    const session = sessionValue(makeUser());
    jest.mocked(useSession).mockReturnValue(session);
    svc.getMe.mockResolvedValueOnce(makeUser()).mockResolvedValueOnce(makeUser({ role: "ORGANIZER" }));
    svc.becomeOrganizer.mockResolvedValue();
    render(<ProfileView />);

    await userEvent.click(await screen.findByRole("button", { name: "Quero ser organizador" }));

    expect(svc.becomeOrganizer).toHaveBeenCalled();
    expect(await screen.findByText("Organizador")).toBeInTheDocument();
    expect(session.refresh).toHaveBeenCalled();
  });
});
