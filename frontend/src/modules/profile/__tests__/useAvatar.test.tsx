import { act, renderHook } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { uploadToPresignedPost } from "@/shared/lib/image-upload";
import { useAvatar } from "../hooks/useAvatar";
import { profileService } from "../services/profile.service";

jest.mock("@/shared/lib/image-upload", () => ({
  ...jest.requireActual("@/shared/lib/image-upload"),
  uploadToPresignedPost: jest.fn(),
}));
jest.mock("../services/profile.service", () => ({
  profileService: {
    createAvatarUpload: jest.fn(),
    confirmAvatar: jest.fn(),
    removeAvatar: jest.fn(),
  },
}));
const svc = jest.mocked(profileService);

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "eu.jpg", {
    type: "image/jpeg",
  });
const presigned = {
  url: "http://s3/b",
  fields: { key: "users/u/avatar/a.jpg" },
  key: "users/u/avatar/a.jpg",
  max_bytes: 1,
  expires_at: "",
};

describe("useAvatar", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(uploadToPresignedPost).mockResolvedValue();
  });

  it("troca a foto: presign, envio ao bucket, confirmação e recarrega perfil/sessão", async () => {
    svc.createAvatarUpload.mockResolvedValue(presigned);
    svc.confirmAvatar.mockResolvedValue({
      avatar_url: "http://cdn/users/u/avatar/a.jpg",
    });
    const onChanged = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAvatar(onChanged));
    const file = jpeg();

    let failure: unknown;
    await act(async () => {
      failure = await result.current.change(file);
    });

    expect(failure).toBeNull();
    expect(svc.createAvatarUpload).toHaveBeenCalledWith("image/jpeg");
    expect(uploadToPresignedPost).toHaveBeenCalledWith(presigned, file);
    expect(svc.confirmAvatar).toHaveBeenCalledWith("users/u/avatar/a.jpg");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("arquivo inválido não chama a API nem recarrega", async () => {
    const onChanged = jest.fn();
    const { result } = renderHook(() => useAvatar(onChanged));

    let failure: unknown;
    await act(async () => {
      failure = await result.current.change(
        new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }),
      );
    });

    expect(failure).toBe("Envie uma imagem JPEG, PNG ou WebP.");
    expect(svc.createAvatarUpload).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("confirmação recusada pela API não recarrega", async () => {
    svc.createAvatarUpload.mockResolvedValue(presigned);
    svc.confirmAvatar.mockRejectedValue(
      nestError(400, "O arquivo enviado não é uma imagem válida"),
    );
    const onChanged = jest.fn();
    const { result } = renderHook(() => useAvatar(onChanged));

    let failure: unknown;
    await act(async () => {
      failure = await result.current.change(jpeg());
    });

    expect(failure).toBe("O arquivo enviado não é uma imagem válida");
    expect(result.current.error).toBe(
      "O arquivo enviado não é uma imagem válida",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("remove volta para a foto do provedor e recarrega", async () => {
    svc.removeAvatar.mockResolvedValue({
      avatar_url: "https://google/foto.jpg",
    });
    const onChanged = jest.fn();
    const { result } = renderHook(() => useAvatar(onChanged));

    let failure: unknown;
    await act(async () => {
      failure = await result.current.remove();
    });

    expect(failure).toBeNull();
    expect(svc.removeAvatar).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.removing).toBe(false);
  });

  it("erro ao remover vira mensagem", async () => {
    svc.removeAvatar.mockRejectedValue(
      nestError(503, "O armazenamento de imagens está indisponível."),
    );
    const { result } = renderHook(() => useAvatar());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.remove();
    });

    expect(failure).toBe("O armazenamento de imagens está indisponível.");
    expect(result.current.error).toBe(
      "O armazenamento de imagens está indisponível.",
    );
  });
});
