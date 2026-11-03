import { uploadToPresignedPost, validateImageFile } from "@/shared/lib/image-upload";
import type { PresignedUpload } from "@/shared/types/image";

const file = (type: string, size: number, name = "foto.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const presigned: PresignedUpload = {
  url: "http://localhost:4566/bilheteria-images",
  fields: { key: "events/1/cover/abc.png", "Content-Type": "image/png", Policy: "p", "X-Amz-Signature": "s" },
  key: "events/1/cover/abc.png",
  max_bytes: 5 * 1024 * 1024,
  expires_at: "2099-01-01T00:00:00.000Z",
};

describe("validateImageFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("aceita %s até 5 MB", (type) => {
    expect(validateImageFile(file(type, 5 * 1024 * 1024))).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", ""])("recusa o tipo %j", (type) => {
    expect(validateImageFile(file(type, 100))).toBe("Envie uma imagem JPEG, PNG ou WebP.");
  });

  it("recusa arquivo maior que 5 MB e arquivo vazio", () => {
    expect(validateImageFile(file("image/png", 5 * 1024 * 1024 + 1))).toBe("A imagem deve ter no máximo 5 MB.");
    expect(validateImageFile(file("image/png", 0))).toBe("O arquivo está vazio.");
  });
});

describe("uploadToPresignedPost", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("faz POST multipart no bucket: campos assinados primeiro, arquivo por último, sem cookies", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const image = file("image/png", 10);

    await uploadToPresignedPost(presigned, image);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4566/bilheteria-images");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    const entries = [...(init.body as FormData).entries()];
    expect(entries.map(([name]) => name)).toEqual(["key", "Content-Type", "Policy", "X-Amz-Signature", "file"]);
    expect(entries[0][1]).toBe("events/1/cover/abc.png");
    expect(entries[4][1]).toBeInstanceOf(File);
  });

  it.each([
    ["EntityTooLarge", "A imagem deve ter no máximo 5 MB."],
    ["AccessDenied", "O envio expirou ou foi recusado. Tente de novo."],
    ["InternalError", "O armazenamento recusou a imagem."],
  ])("traduz o erro %s do S3", async (code, message) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(`<?xml version="1.0"?><Error><Code>${code}</Code></Error>`),
    });
    await expect(uploadToPresignedPost(presigned, file("image/png", 10))).rejects.toThrow(message);
  });

  it("falha de rede (ex.: CORS, bucket fora)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadToPresignedPost(presigned, file("image/png", 10))).rejects.toThrow(
      "Não foi possível enviar a imagem ao armazenamento.",
    );
  });
});
