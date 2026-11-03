import { api } from "@/shared/services/api";
import { eventImagesService } from "../services/event-images.service";

jest.mock("@/shared/services/api", () => ({
  api: { post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

describe("eventImagesService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("capa: upload-url, confirmação e remoção", async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { key: "k" } });
    jest.mocked(api.put).mockResolvedValue({ data: { cover_url: "u" } });
    jest.mocked(api.delete).mockResolvedValue({ status: 204 });

    await expect(eventImagesService.createCoverUpload(4, "image/png")).resolves.toEqual({ key: "k" });
    expect(api.post).toHaveBeenCalledWith("/events/4/cover/upload-url", { content_type: "image/png" });
    await expect(eventImagesService.confirmCover(4, "k")).resolves.toEqual({ cover_url: "u" });
    expect(api.put).toHaveBeenCalledWith("/events/4/cover", { key: "k" });
    await eventImagesService.removeCover(4);
    expect(api.delete).toHaveBeenCalledWith("/events/4/cover");
  });

  it("galeria: upload-url, confirmação, remoção e ordem", async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { photos: [] } });
    jest.mocked(api.patch).mockResolvedValue({ data: { photos: [] } });
    jest.mocked(api.delete).mockResolvedValue({ status: 204 });

    await eventImagesService.createPhotoUpload(4, "image/webp");
    expect(api.post).toHaveBeenCalledWith("/events/4/photos/upload-url", { content_type: "image/webp" });
    await eventImagesService.confirmPhoto(4, "k");
    expect(api.post).toHaveBeenCalledWith("/events/4/photos", { key: "k" });
    await eventImagesService.removePhoto(4, 9);
    expect(api.delete).toHaveBeenCalledWith("/events/4/photos/9");
    await eventImagesService.reorderPhotos(4, [3, 1, 2]);
    expect(api.patch).toHaveBeenCalledWith("/events/4/photos/order", { photo_ids: [3, 1, 2] });
  });
});
