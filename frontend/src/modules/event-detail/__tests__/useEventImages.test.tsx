import { act, renderHook } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { uploadToPresignedPost } from "@/shared/lib/image-upload";
import { movedOrder, useEventImages } from "../hooks/useEventImages";
import { eventImagesService } from "../services/event-images.service";
import type { EventPhoto } from "../types/event-detail.dto";

jest.mock("@/shared/lib/image-upload", () => ({
  ...jest.requireActual("@/shared/lib/image-upload"),
  uploadToPresignedPost: jest.fn(),
}));
jest.mock("../services/event-images.service", () => ({
  eventImagesService: {
    createCoverUpload: jest.fn(),
    confirmCover: jest.fn(),
    removeCover: jest.fn(),
    createPhotoUpload: jest.fn(),
    confirmPhoto: jest.fn(),
    removePhoto: jest.fn(),
    reorderPhotos: jest.fn(),
  },
}));
const svc = jest.mocked(eventImagesService);

const photo = (id: number, position: number): EventPhoto => ({
  id,
  url: `http://cdn/p${id}.png`,
  position,
});
const png = () =>
  new File([new Uint8Array([0x89, 0x50])], "foto.png", { type: "image/png" });
const presigned = (key: string) => ({
  url: "http://s3/b",
  fields: {},
  key,
  max_bytes: 1,
  expires_at: "",
});

function setup(photos: EventPhoto[] = [], cover_url: string | null = null) {
  return renderHook(() => useEventImages(7, { cover_url, photos }));
}

describe("movedOrder", () => {
  const photos = [photo(1, 0), photo(2, 1), photo(3, 2)];
  it("troca com o vizinho", () => {
    expect(movedOrder(photos, 2, -1)).toEqual([2, 1, 3]);
    expect(movedOrder(photos, 2, 1)).toEqual([1, 3, 2]);
  });
  it("não sai das pontas nem aceita foto desconhecida", () => {
    expect(movedOrder(photos, 1, -1)).toBeNull();
    expect(movedOrder(photos, 3, 1)).toBeNull();
    expect(movedOrder(photos, 99, 1)).toBeNull();
  });
});

describe("useEventImages", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(uploadToPresignedPost).mockResolvedValue();
  });

  it("começa com a capa e a galeria do GET /events/:id", () => {
    const { result } = setup([photo(1, 0)], "http://cdn/capa.png");
    expect(result.current.coverUrl).toBe("http://cdn/capa.png");
    expect(result.current.photos).toEqual([photo(1, 0)]);
  });

  it("uploadCover: presign da capa do evento, envio, confirmação e capa nova na tela", async () => {
    svc.createCoverUpload.mockResolvedValue(presigned("events/7/cover/a.png"));
    svc.confirmCover.mockResolvedValue({
      cover_url: "http://cdn/events/7/cover/a.png",
    });
    const { result } = setup();

    let failure: unknown;
    await act(async () => {
      failure = await result.current.uploadCover(png());
    });

    expect(failure).toBeNull();
    expect(svc.createCoverUpload).toHaveBeenCalledWith(7, "image/png");
    expect(svc.confirmCover).toHaveBeenCalledWith(7, "events/7/cover/a.png");
    expect(result.current.coverUrl).toBe("http://cdn/events/7/cover/a.png");
  });

  it("uploadCover com erro mantém a capa e devolve a mensagem", async () => {
    svc.createCoverUpload.mockRejectedValue(
      nestError(403, "Só o organizador do evento pode alterar as imagens dele"),
    );
    const { result } = setup([], "http://cdn/antiga.png");

    let failure: unknown;
    await act(async () => {
      failure = await result.current.uploadCover(png());
    });

    expect(failure).toBe(
      "Só o organizador do evento pode alterar as imagens dele",
    );
    expect(result.current.coverUrl).toBe("http://cdn/antiga.png");
    expect(result.current.error).toBe(
      "Só o organizador do evento pode alterar as imagens dele",
    );
  });

  it("addPhoto troca a galeria pela resposta da API", async () => {
    svc.createPhotoUpload.mockResolvedValue(presigned("events/7/photos/b.png"));
    svc.confirmPhoto.mockResolvedValue({ photos: [photo(1, 0), photo(2, 1)] });
    const { result } = setup([photo(1, 0)]);

    await act(async () => {
      await result.current.addPhoto(png());
    });

    expect(svc.confirmPhoto).toHaveBeenCalledWith(7, "events/7/photos/b.png");
    expect(result.current.photos.map((p) => p.id)).toEqual([1, 2]);
  });

  it("addPhoto com a galeria cheia (409) não muda nada", async () => {
    svc.createPhotoUpload.mockRejectedValue(
      nestError(409, "A galeria aceita no máximo 10 fotos"),
    );
    const { result } = setup([photo(1, 0)]);

    let failure: unknown;
    await act(async () => {
      failure = await result.current.addPhoto(png());
    });

    expect(failure).toBe("A galeria aceita no máximo 10 fotos");
    expect(result.current.photos).toEqual([photo(1, 0)]);
  });

  it("removeCover e removePhoto", async () => {
    svc.removeCover.mockResolvedValue();
    svc.removePhoto.mockResolvedValue();
    const { result } = setup([photo(1, 0), photo(2, 1)], "http://cdn/capa.png");

    await act(async () => {
      await result.current.removeCover();
      await result.current.removePhoto(1);
    });

    expect(svc.removeCover).toHaveBeenCalledWith(7);
    expect(svc.removePhoto).toHaveBeenCalledWith(7, 1);
    expect(result.current.coverUrl).toBeNull();
    expect(result.current.photos.map((p) => p.id)).toEqual([2]);
  });

  it("movePhoto manda a ordem inteira e aplica a resposta", async () => {
    svc.reorderPhotos.mockResolvedValue({ photos: [photo(2, 0), photo(1, 1)] });
    const { result } = setup([photo(1, 0), photo(2, 1)]);

    await act(async () => {
      await result.current.movePhoto(2, -1);
    });

    expect(svc.reorderPhotos).toHaveBeenCalledWith(7, [2, 1]);
    expect(result.current.photos.map((p) => p.id)).toEqual([2, 1]);
  });

  it("movePhoto na ponta não chama a API", async () => {
    const { result } = setup([photo(1, 0), photo(2, 1)]);
    await act(async () => {
      await result.current.movePhoto(1, -1);
    });
    expect(svc.reorderPhotos).not.toHaveBeenCalled();
  });

  it("erro ao remover vira mensagem e mantém a foto", async () => {
    svc.removePhoto.mockRejectedValue(
      nestError(404, "A foto 1 não foi encontrada neste evento"),
    );
    const { result } = setup([photo(1, 0)]);

    let failure: unknown;
    await act(async () => {
      failure = await result.current.removePhoto(1);
    });

    expect(failure).toBe("A foto 1 não foi encontrada neste evento");
    expect(result.current.photos).toHaveLength(1);
    expect(result.current.busy).toBe(false);
  });
});
