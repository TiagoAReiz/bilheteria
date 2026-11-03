import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeUser, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { ProfileView } from "../components/profile-view";
import { profileService } from "../services/profile.service";
import type { UserMeResponse } from "../types/profile.dto";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/profile.service", () => ({
  profileService: {
    getMe: jest.fn(),
    registerCpf: jest.fn(),
    becomeOrganizer: jest.fn(),
    createAvatarUpload: jest.fn(),
    confirmAvatar: jest.fn(),
    removeAvatar: jest.fn(),
  },
}));
jest.mock("@/shared/lib/image-upload", () => ({
  ...jest.requireActual("@/shared/lib/image-upload"),
  uploadToPresignedPost: jest.fn().mockResolvedValue(undefined),
}));

const svc = jest.mocked(profileService);

function makeMe(overrides: Partial<UserMeResponse> = {}): UserMeResponse {
  return { ...makeUser(), hasCpf: false, ...overrides };
}

describe("<ProfileView />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(useSession).mockReturnValue(sessionValue(makeUser()));
  });

  it("mostra os dados do usuário e o botão de organizador para USER", async () => {
    svc.getMe.mockResolvedValue(makeMe({ name: "João", email: "joao@x.com" }));
    render(<ProfileView />);

    expect(await screen.findByText("João")).toBeInTheDocument();
    expect(screen.getByText("joao@x.com")).toBeInTheDocument();
    expect(screen.getByText("Usuário")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quero ser organizador" })).toBeInTheDocument();
  });

  it("não mostra o botão para ORGANIZER", async () => {
    svc.getMe.mockResolvedValue(makeMe({ role: "ORGANIZER" }));
    render(<ProfileView />);
    expect(await screen.findByText("Organizador")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quero ser organizador" })).not.toBeInTheDocument();
  });

  it("vira organizador e recarrega perfil e sessão", async () => {
    const session = sessionValue(makeUser());
    jest.mocked(useSession).mockReturnValue(session);
    svc.getMe.mockResolvedValueOnce(makeMe()).mockResolvedValueOnce(makeMe({ role: "ORGANIZER" }));
    svc.becomeOrganizer.mockResolvedValue();
    render(<ProfileView />);

    await userEvent.click(await screen.findByRole("button", { name: "Quero ser organizador" }));

    expect(svc.becomeOrganizer).toHaveBeenCalled();
    expect(await screen.findByText("Organizador")).toBeInTheDocument();
    expect(session.refresh).toHaveBeenCalled();
  });

  describe("foto de perfil", () => {
    it("mostra a foto enviada no lugar da do Google", async () => {
      svc.getMe.mockResolvedValue(
        makeMe({ image: "https://google/foto.jpg", avatarUrl: "http://cdn/users/u/avatar/a.png", avatarKey: "users/u/avatar/a.png" }),
      );
      render(<ProfileView />);
      expect(await screen.findByRole("button", { name: /remover foto/i })).toBeInTheDocument();
    });

    it("sem foto enviada não oferece remover", async () => {
      svc.getMe.mockResolvedValue(makeMe({ image: "https://google/foto.jpg", avatarKey: null }));
      render(<ProfileView />);
      expect(await screen.findByRole("button", { name: /trocar foto/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remover foto/i })).not.toBeInTheDocument();
    });

    it("trocar a foto envia direto ao bucket, confirma e recarrega perfil e sessão (header)", async () => {
      const session = sessionValue(makeUser());
      jest.mocked(useSession).mockReturnValue(session);
      svc.getMe.mockResolvedValue(makeMe());
      svc.createAvatarUpload.mockResolvedValue({
        url: "http://s3/b",
        fields: {},
        key: "users/user-1/avatar/a.png",
        max_bytes: 5242880,
        expires_at: "2099-01-01T00:00:00.000Z",
      });
      svc.confirmAvatar.mockResolvedValue({ avatar_url: "http://cdn/users/user-1/avatar/a.png" });
      render(<ProfileView />);

      const input = await screen.findByLabelText("Escolher foto de perfil");
      await userEvent.upload(input, new File([new Uint8Array([0x89, 0x50])], "eu.png", { type: "image/png" }));

      expect(svc.createAvatarUpload).toHaveBeenCalledWith("image/png");
      expect(svc.confirmAvatar).toHaveBeenCalledWith("users/user-1/avatar/a.png");
      expect(session.refresh).toHaveBeenCalled();
      expect(svc.getMe).toHaveBeenCalledTimes(2);
    });
  });

  describe("CPF", () => {
    it("conta sem CPF vê o formulário habilitado", async () => {
      svc.getMe.mockResolvedValue(makeMe({ hasCpf: false }));
      render(<ProfileView />);
      expect(await screen.findByLabelText("CPF")).toBeEnabled();
      expect(screen.queryByText("CPF cadastrado")).not.toBeInTheDocument();
    });

    it("conta com CPF vê o aviso de cadastrado e o campo travado", async () => {
      svc.getMe.mockResolvedValue(makeMe({ hasCpf: true }));
      render(<ProfileView />);
      expect(await screen.findByText("CPF cadastrado")).toBeInTheDocument();
      expect(screen.getByLabelText("CPF")).toBeDisabled();
      expect(screen.getByRole("button", { name: /cadastrar cpf/i })).toBeDisabled();
    });
  });
});
