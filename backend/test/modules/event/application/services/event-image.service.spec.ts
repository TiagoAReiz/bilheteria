import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import {
  mockImageStorage,
  PUBLIC_BASE,
} from '../../../../utils/image-storage.js';
import { EventImageService } from '../../../../../src/modules/event/application/services/event-image.service.js';
import {
  EVENT_IMAGE_REPOSITORY,
  type EventImageRepositoryPort,
} from '../../../../../src/modules/event/application/ports/outbound/repositories/event-image.repository.port.js';
import { IMAGE_STORAGE_SERVICE } from '../../../../../src/modules/storage/application/ports/inbound/services/image-storage.service.port.js';
import type {
  EventPhoto,
  ImageEditor,
} from '../../../../../src/modules/event/core/entities/event-image.entity.js';

const OWNER: ImageEditor = { id: 'org-1', role: 'ORGANIZER' };
const OTHER_ORGANIZER: ImageEditor = { id: 'org-2', role: 'ORGANIZER' };
const ADMIN: ImageEditor = { id: 'adm-1', role: 'ADMIN' };
const BUYER: ImageEditor = { id: 'user-9', role: 'USER' };
const COVER_KEY = 'events/5/cover/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png';
const OLD_COVER_KEY = 'events/5/cover/11111111-1d2a-4c3b-9e8f-7a6b5c4d3e2f.jpg';
const PHOTO_KEY = 'events/5/photos/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.webp';

const photo = (
  id: number,
  position: number,
  key = `events/5/photos/p${id}.png`,
): EventPhoto => ({
  id,
  event_id: 5,
  key,
  position,
  created_at: new Date('2026-01-01T00:00:00Z'),
});

describe('EventImageService', () => {
  let service: EventImageService;
  let repository: MockPort<EventImageRepositoryPort>;
  let images: ReturnType<typeof mockImageStorage>;

  beforeEach(async () => {
    repository = {
      getOrganizerId: vi.fn().mockResolvedValue('org-1'),
      countPhotos: vi.fn().mockResolvedValue(0),
      replaceCover: vi.fn().mockResolvedValue({ previousKey: null }),
      addPhoto: vi.fn(),
      removePhoto: vi.fn(),
      reorderPhotos: vi.fn(),
    };
    images = mockImageStorage();
    images.createUpload.mockResolvedValue({
      url: 'http://s3/b',
      fields: {},
      key: COVER_KEY,
      max_bytes: 1,
      expires_at: new Date(),
    });
    const module = await Test.createTestingModule({
      providers: [
        EventImageService,
        { provide: EVENT_IMAGE_REPOSITORY, useValue: repository },
        { provide: IMAGE_STORAGE_SERVICE, useValue: images },
      ],
    }).compile();
    service = module.get(EventImageService);
  });

  describe('autorização', () => {
    const operations: [string, (editor: ImageEditor) => Promise<unknown>][] = [
      [
        'createCoverUpload',
        (e) => service.createCoverUpload(5, e, 'image/png'),
      ],
      ['confirmCover', (e) => service.confirmCover(5, e, COVER_KEY)],
      ['removeCover', (e) => service.removeCover(5, e)],
      [
        'createPhotoUpload',
        (e) => service.createPhotoUpload(5, e, 'image/png'),
      ],
      ['confirmPhoto', (e) => service.confirmPhoto(5, e, PHOTO_KEY)],
      ['removePhoto', (e) => service.removePhoto(5, e, 1)],
      ['reorderPhotos', (e) => service.reorderPhotos(5, e, [1])],
    ];

    it.each(operations)(
      '%s: 403 para outro organizador e para comprador, sem tocar no bucket nem no banco',
      async (_name, run) => {
        for (const editor of [OTHER_ORGANIZER, BUYER]) {
          await expect(run(editor)).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(images.createUpload).not.toHaveBeenCalled();
        expect(images.confirmUpload).not.toHaveBeenCalled();
        expect(images.deleteQuietly).not.toHaveBeenCalled();
        expect(repository.replaceCover).not.toHaveBeenCalled();
        expect(repository.addPhoto).not.toHaveBeenCalled();
        expect(repository.removePhoto).not.toHaveBeenCalled();
        expect(repository.reorderPhotos).not.toHaveBeenCalled();
      },
    );

    it.each(operations)(
      '%s: 404 para evento inexistente ou excluído',
      async (_name, run) => {
        repository.getOrganizerId.mockResolvedValue(null);
        await expect(run(OWNER)).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it('ADMIN pode mexer em evento de outro organizador', async () => {
      await expect(
        service.createCoverUpload(5, ADMIN, 'image/png'),
      ).resolves.toMatchObject({ key: COVER_KEY });
    });
  });

  describe('capa', () => {
    it('createCoverUpload usa o prefixo da capa do evento', async () => {
      await service.createCoverUpload(5, OWNER, 'image/webp');
      expect(images.createUpload).toHaveBeenCalledWith(
        'event_cover',
        'events/5/cover',
        'image/webp',
      );
    });

    it('confirmCover valida no bucket, grava e apaga a capa anterior', async () => {
      repository.replaceCover.mockResolvedValue({ previousKey: OLD_COVER_KEY });

      await expect(service.confirmCover(5, OWNER, COVER_KEY)).resolves.toEqual({
        cover_url: `${PUBLIC_BASE}/${COVER_KEY}`,
      });
      expect(images.confirmUpload).toHaveBeenCalledWith(
        'event_cover',
        'events/5/cover',
        COVER_KEY,
      );
      expect(repository.replaceCover).toHaveBeenCalledWith(5, COVER_KEY);
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_cover',
        OLD_COVER_KEY,
      );
    });

    it('confirmação repetida da mesma chave não apaga a própria capa', async () => {
      repository.replaceCover.mockResolvedValue({ previousKey: COVER_KEY });
      await service.confirmCover(5, OWNER, COVER_KEY);
      expect(images.deleteQuietly).not.toHaveBeenCalledWith(
        'event_cover',
        COVER_KEY,
      );
    });

    it('upload inválido: não grava nada', async () => {
      images.confirmUpload.mockRejectedValue(
        new BadRequestException('A imagem deve ter no máximo 5 MB'),
      );
      await expect(
        service.confirmCover(5, OWNER, COVER_KEY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.replaceCover).not.toHaveBeenCalled();
    });

    it('evento excluído entre a checagem e a gravação: 404 e a imagem nova é apagada', async () => {
      repository.replaceCover.mockResolvedValue(null);
      await expect(
        service.confirmCover(5, OWNER, COVER_KEY),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_cover',
        COVER_KEY,
      );
    });

    it('removeCover limpa a referência e apaga o objeto', async () => {
      repository.replaceCover.mockResolvedValue({ previousKey: OLD_COVER_KEY });
      await service.removeCover(5, OWNER);
      expect(repository.replaceCover).toHaveBeenCalledWith(5, null);
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_cover',
        OLD_COVER_KEY,
      );
    });
  });

  describe('galeria', () => {
    it('createPhotoUpload usa o prefixo da galeria', async () => {
      repository.countPhotos.mockResolvedValue(9);
      await service.createPhotoUpload(5, OWNER, 'image/jpeg');
      expect(images.createUpload).toHaveBeenCalledWith(
        'event_photo',
        'events/5/photos',
        'image/jpeg',
      );
    });

    it('createPhotoUpload com a galeria cheia: 409 sem assinar upload', async () => {
      repository.countPhotos.mockResolvedValue(10);
      await expect(
        service.createPhotoUpload(5, OWNER, 'image/png'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(images.createUpload).not.toHaveBeenCalled();
    });

    it('confirmPhoto adiciona com limite 10 e devolve a galeria em ordem com URLs', async () => {
      repository.addPhoto.mockResolvedValue({
        outcome: 'added',
        photos: [photo(2, 1), photo(1, 0)],
      });

      await expect(service.confirmPhoto(5, OWNER, PHOTO_KEY)).resolves.toEqual({
        photos: [
          { id: 1, url: `${PUBLIC_BASE}/events/5/photos/p1.png`, position: 0 },
          { id: 2, url: `${PUBLIC_BASE}/events/5/photos/p2.png`, position: 1 },
        ],
      });
      expect(images.confirmUpload).toHaveBeenCalledWith(
        'event_photo',
        'events/5/photos',
        PHOTO_KEY,
      );
      expect(repository.addPhoto).toHaveBeenCalledWith(5, PHOTO_KEY, 10);
    });

    it('confirmPhoto quando outra confirmação lotou a galeria: 409 e o objeto enviado é apagado', async () => {
      repository.addPhoto.mockResolvedValue({ outcome: 'limit_reached' });
      await expect(service.confirmPhoto(5, OWNER, PHOTO_KEY)).rejects.toThrow(
        'no máximo 10 fotos',
      );
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_photo',
        PHOTO_KEY,
      );
    });

    it('confirmPhoto com evento excluído no meio: 404 e o objeto é apagado', async () => {
      repository.addPhoto.mockResolvedValue({ outcome: 'event_not_found' });
      await expect(
        service.confirmPhoto(5, OWNER, PHOTO_KEY),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_photo',
        PHOTO_KEY,
      );
    });

    it('confirmPhoto com upload inválido não chega ao banco', async () => {
      images.confirmUpload.mockRejectedValue(
        new BadRequestException('Chave de upload inválida'),
      );
      await expect(
        service.confirmPhoto(5, OWNER, 'events/6/photos/x.png'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.addPhoto).not.toHaveBeenCalled();
    });

    it('removePhoto apaga a linha e o objeto', async () => {
      repository.removePhoto.mockResolvedValue(photo(3, 2, PHOTO_KEY));
      await service.removePhoto(5, OWNER, 3);
      expect(repository.removePhoto).toHaveBeenCalledWith(5, 3);
      expect(images.deleteQuietly).toHaveBeenCalledWith(
        'event_photo',
        PHOTO_KEY,
      );
    });

    it('removePhoto de foto que não é do evento: 404 sem apagar nada', async () => {
      repository.removePhoto.mockResolvedValue(null);
      await expect(service.removePhoto(5, OWNER, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(images.deleteQuietly).not.toHaveBeenCalled();
    });

    it('reorderPhotos devolve a nova ordem', async () => {
      repository.reorderPhotos.mockResolvedValue({
        outcome: 'reordered',
        photos: [photo(2, 0), photo(1, 1)],
      });
      const { photos } = await service.reorderPhotos(5, OWNER, [2, 1]);
      expect(photos.map((p) => p.id)).toEqual([2, 1]);
      expect(repository.reorderPhotos).toHaveBeenCalledWith(5, [2, 1]);
    });

    it('reorderPhotos com lista que não é a galeria atual: 400', async () => {
      repository.reorderPhotos.mockResolvedValue({ outcome: 'mismatch' });
      await expect(service.reorderPhotos(5, OWNER, [1])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reorderPhotos com evento excluído no meio: 404', async () => {
      repository.reorderPhotos.mockResolvedValue({
        outcome: 'event_not_found',
      });
      await expect(service.reorderPhotos(5, OWNER, [1])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
