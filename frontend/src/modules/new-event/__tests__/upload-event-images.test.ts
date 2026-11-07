import { eventImagesService } from "@/modules/event-detail/services/event-images.service";
import { uploadToPresignedPost } from "@/shared/lib/image-upload";
import { uploadEventImages } from "../services/upload-event-images";

jest.mock("@/modules/event-detail/services/event-images.service", () => ({
  eventImagesService: {
    createCoverUpload: jest.fn(),
    confirmCover: jest.fn(),
    createPhotoUpload: jest.fn(),
    confirmPhoto: jest.fn(),
  },
}));
jest.mock("@/shared/lib/image-upload", () => ({
  ...jest.requireActual("@/shared/lib/image-upload"),
  uploadToPresignedPost: jest.fn(),
}));

const svc = jest.mocked(eventImagesService);
const upload = jest.mocked(uploadToPresignedPost);
const presigned = (key: string) => ({
  url: "http://s3",
  fields: {},
  key,
  max_bytes: 1,
  expires_at: "",
});
const image = (name: string, type = "image/png") =>
  new File(["x"], name, { type });

describe("uploadEventImages", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    svc.createCoverUpload.mockResolvedValue(presigned("cover-key"));
    svc.createPhotoUpload
      .mockResolvedValueOnce(presigned("p1"))
      .mockResolvedValueOnce(presigned("p2"));
    upload.mockResolvedValue(undefined);
  });

  it("sobe a capa e as fotos na ordem escolhida", async () => {
    await expect(
      uploadEventImages(9, {
        cover: image("capa.png"),
        photos: [image("a.png"), image("b.png")],
      }),
    ).resolves.toEqual([]);

    expect(svc.createCoverUpload).toHaveBeenCalledWith(9, "image/png");
    expect(svc.confirmCover).toHaveBeenCalledWith(9, "cover-key");
    expect(svc.confirmPhoto.mock.calls).toEqual([
      [9, "p1"],
      [9, "p2"],
    ]);
  });

  it("uma falha não interrompe as outras e é devolvida", async () => {
    upload
      .mockRejectedValueOnce(new Error("O armazenamento recusou a imagem."))
      .mockResolvedValue(undefined);

    const failures = await uploadEventImages(9, {
      cover: image("capa.png"),
      photos: [image("a.png"), image("doc.pdf", "application/pdf")],
    });

    expect(failures).toEqual([
      { name: "capa.png", message: "O armazenamento recusou a imagem." },
      { name: "doc.pdf", message: "Envie uma imagem JPEG, PNG ou WebP." },
    ]);
    expect(svc.confirmPhoto).toHaveBeenCalledWith(9, "p1");
  });
});
