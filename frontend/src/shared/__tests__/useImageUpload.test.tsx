import { act, renderHook } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { useImageUpload } from "@/shared/hooks/useImageUpload";
import { uploadToPresignedPost } from "@/shared/lib/image-upload";
import type { PresignedUpload } from "@/shared/types/image";

jest.mock("@/shared/lib/image-upload", () => ({
  ...jest.requireActual("@/shared/lib/image-upload"),
  uploadToPresignedPost: jest.fn(),
}));
const uploadToBucket = jest.mocked(uploadToPresignedPost);

const presigned: PresignedUpload = {
  url: "http://s3/bucket",
  fields: {},
  key: "events/1/cover/abc.webp",
  max_bytes: 5 * 1024 * 1024,
  expires_at: "2099-01-01T00:00:00.000Z",
};

const image = (type = "image/webp", size = 1024) => {
  const f = new File(["x"], "foto", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

function setup() {
  const requestUpload = jest.fn().mockResolvedValue(presigned);
  const confirm = jest.fn().mockResolvedValue({ cover_url: "http://cdn/abc.webp" });
  const hook = renderHook(() => useImageUpload({ requestUpload, confirm }));
  return { ...hook, requestUpload, confirm };
}

describe("useImageUpload", () => {
  beforeEach(() => jest.resetAllMocks());

  it("pede a URL com o tipo do arquivo, envia ao bucket e confirma com a chave", async () => {
    uploadToBucket.mockResolvedValue();
    const { result, requestUpload, confirm } = setup();
    const file = image();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.upload(file);
    });

    expect(requestUpload).toHaveBeenCalledWith("image/webp");
    expect(uploadToBucket).toHaveBeenCalledWith(presigned, file);
    expect(confirm).toHaveBeenCalledWith("events/1/cover/abc.webp");
    expect(outcome).toEqual({ ok: true, value: { cover_url: "http://cdn/abc.webp" } });
    expect(result.current.error).toBeNull();
    expect(result.current.uploading).toBe(false);
  });

  it("arquivo inválido: erro na hora, sem falar com a API nem com o bucket", async () => {
    const { result, requestUpload } = setup();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.upload(image("image/gif"));
    });

    expect(outcome).toEqual({ ok: false, error: "Envie uma imagem JPEG, PNG ou WebP." });
    expect(result.current.error).toBe("Envie uma imagem JPEG, PNG ou WebP.");
    expect(requestUpload).not.toHaveBeenCalled();
    expect(uploadToBucket).not.toHaveBeenCalled();
  });

  it("arquivo grande demais: não pede URL", async () => {
    const { result, requestUpload } = setup();
    await act(async () => {
      await result.current.upload(image("image/png", 6 * 1024 * 1024));
    });
    expect(result.current.error).toBe("A imagem deve ter no máximo 5 MB.");
    expect(requestUpload).not.toHaveBeenCalled();
  });

  it("bucket recusou: não confirma", async () => {
    uploadToBucket.mockRejectedValue(new Error("A imagem deve ter no máximo 5 MB."));
    const { result, confirm } = setup();

    await act(async () => {
      await result.current.upload(image());
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(result.current.error).toBe("A imagem deve ter no máximo 5 MB.");
  });

  it("erro da API (ex.: 403 de quem não é dono) vira a mensagem do Nest", async () => {
    const { result, requestUpload } = setup();
    requestUpload.mockRejectedValue(nestError(403, "Só o organizador do evento pode alterar as imagens dele"));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.upload(image());
    });

    expect(outcome).toEqual({ ok: false, error: "Só o organizador do evento pode alterar as imagens dele" });
    expect(uploadToBucket).not.toHaveBeenCalled();
  });

  it("confirmação recusada (ex.: 409 galeria cheia)", async () => {
    uploadToBucket.mockResolvedValue();
    const { result, confirm } = setup();
    confirm.mockRejectedValue(nestError(409, "A galeria aceita no máximo 10 fotos"));

    await act(async () => {
      await result.current.upload(image());
    });

    expect(result.current.error).toBe("A galeria aceita no máximo 10 fotos");
  });
});
