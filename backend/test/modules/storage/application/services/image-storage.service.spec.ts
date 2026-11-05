import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { ImageStorageService } from '../../../../../src/modules/storage/application/services/image-storage.service.js';
import {
  OBJECT_STORAGE,
  ObjectStorageUnavailableError,
  type ObjectStoragePort,
} from '../../../../../src/modules/storage/application/ports/outbound/storage/object-storage.port.js';
import {
  STORAGE_METRICS,
  type StorageMetricsPort,
} from '../../../../../src/modules/storage/application/ports/outbound/metrics/storage-metrics.port.js';
import {
  MAX_IMAGE_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from '../../../../../src/modules/storage/core/entities/image.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const PREFIX = 'events/3/cover';
const KEY = `${PREFIX}/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png`;
const PNG_HEAD = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

describe('ImageStorageService', () => {
  let service: ImageStorageService;
  let storage: MockPort<ObjectStoragePort>;
  let metrics: MockPort<StorageMetricsPort>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    storage = {
      createPresignedPost: vi.fn().mockResolvedValue({
        url: 'http://s3/bucket',
        fields: { key: 'k', Policy: 'p' },
      }),
      headObject: vi
        .fn()
        .mockResolvedValue({ size: 1024, contentType: 'image/png' }),
      readPrefix: vi.fn().mockResolvedValue(PNG_HEAD),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      publicUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
    };
    metrics = {
      uploadUrlIssued: vi.fn(),
      uploadConfirmed: vi.fn(),
      uploadRejected: vi.fn(),
      objectDeleteFailed: vi.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ImageStorageService,
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: STORAGE_METRICS, useValue: metrics },
      ],
    }).compile();
    service = module.get(ImageStorageService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createUpload', () => {
    it('gera a chave no servidor e pede um POST que o S3 limita a 5 MB e ao tipo', async () => {
      const upload = await service.createUpload(
        'event_cover',
        PREFIX,
        'image/png',
      );

      expect(upload.key).toMatch(/^events\/3\/cover\/[0-9a-f-]{36}\.png$/);
      expect(storage.createPresignedPost).toHaveBeenCalledWith({
        key: upload.key,
        contentType: 'image/png',
        maxBytes: MAX_IMAGE_BYTES,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });
      expect(upload).toEqual({
        url: 'http://s3/bucket',
        fields: { key: 'k', Policy: 'p' },
        key: upload.key,
        max_bytes: 5 * 1024 * 1024,
        expires_at: new Date(NOW.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
      });
      expect(metrics.uploadUrlIssued).toHaveBeenCalledWith('event_cover');
    });

    it('cada pedido ganha uma chave nova', async () => {
      const a = await service.createUpload('event_photo', PREFIX, 'image/jpeg');
      const b = await service.createUpload('event_photo', PREFIX, 'image/jpeg');
      expect(a.key).not.toBe(b.key);
    });

    it.each(['image/gif', 'image/svg+xml', 'text/html', ''])(
      'recusa %j sem assinar nada',
      async (type) => {
        await expect(
          service.createUpload('event_cover', PREFIX, type),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(storage.createPresignedPost).not.toHaveBeenCalled();
      },
    );

    it('bucket fora do ar vira 503', async () => {
      storage.createPresignedPost.mockRejectedValue(
        new ObjectStorageUnavailableError('down'),
      );
      await expect(
        service.createUpload('event_cover', PREFIX, 'image/png'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(metrics.uploadUrlIssued).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    it('confere tamanho, tipo e assinatura e conta a confirmação', async () => {
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).resolves.toBeUndefined();
      expect(storage.headObject).toHaveBeenCalledWith(KEY);
      expect(storage.readPrefix).toHaveBeenCalledWith(KEY, 12);
      expect(metrics.uploadConfirmed).toHaveBeenCalledWith('event_cover');
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it.each([
      [
        'de outro evento',
        'events/4/cover/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png',
      ],
      ['forjada', 'events/3/cover/minha-foto.png'],
      [
        'de outro usuário',
        'users/u2/avatar/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png',
      ],
    ])('recusa chave %s sem consultar nem apagar nada', async (_case, key) => {
      await expect(
        service.confirmUpload('event_cover', PREFIX, key),
      ).rejects.toThrow('Chave de upload inválida');
      expect(storage.headObject).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(metrics.uploadRejected).toHaveBeenCalledWith(
        'event_cover',
        'invalid_key',
      );
    });

    it('objeto que não existe: 400 sem apagar', async () => {
      storage.headObject.mockResolvedValue(null);
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).rejects.toThrow('não foi encontrado');
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(metrics.uploadRejected).toHaveBeenCalledWith(
        'event_cover',
        'missing',
      );
    });

    it.each([
      [
        'grande demais',
        { size: MAX_IMAGE_BYTES + 1, contentType: 'image/png' },
        'too_large',
      ],
      ['vazio', { size: 0, contentType: 'image/png' }, 'too_large'],
      [
        'tipo diferente da extensão',
        { size: 10, contentType: 'image/jpeg' },
        'invalid_type',
      ],
      ['sem tipo', { size: 10, contentType: null }, 'invalid_type'],
      ['html', { size: 10, contentType: 'text/html' }, 'invalid_type'],
    ])('objeto %s: 400 e o objeto é apagado', async (_case, head, reason) => {
      storage.headObject.mockResolvedValue(head);
      await expect(
        service.confirmUpload('event_photo', PREFIX, KEY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
      expect(metrics.uploadRejected).toHaveBeenCalledWith(
        'event_photo',
        reason,
      );
      expect(metrics.uploadConfirmed).not.toHaveBeenCalled();
    });

    it('bytes que não são PNG: 400 invalid_content e o objeto é apagado', async () => {
      storage.readPrefix.mockResolvedValue(
        new TextEncoder().encode('<html><body>'),
      );
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).rejects.toThrow('não é uma imagem válida');
      expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
      expect(metrics.uploadRejected).toHaveBeenCalledWith(
        'event_cover',
        'invalid_content',
      );
    });

    it('aceita exatamente 5 MB', async () => {
      storage.headObject.mockResolvedValue({
        size: MAX_IMAGE_BYTES,
        contentType: 'image/png',
      });
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).resolves.toBeUndefined();
    });

    it('bucket fora do ar vira 503', async () => {
      storage.headObject.mockRejectedValue(
        new ObjectStorageUnavailableError('down'),
      );
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('erro inesperado do bucket (ex.: 403 de credencial) propaga como está', async () => {
      const forbidden = new Error('AccessDenied');
      storage.headObject.mockRejectedValue(forbidden);
      await expect(
        service.confirmUpload('event_cover', PREFIX, KEY),
      ).rejects.toBe(forbidden);
    });
  });

  describe('deleteQuietly', () => {
    it('apaga a chave', async () => {
      await service.deleteQuietly('user_avatar', 'users/u/avatar/x.png');
      expect(storage.deleteObject).toHaveBeenCalledWith('users/u/avatar/x.png');
    });

    it.each([null, undefined, ''])('ignora chave %j', async (key) => {
      await service.deleteQuietly('user_avatar', key);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('falha vira log e métrica, nunca erro', async () => {
      storage.deleteObject.mockRejectedValue(
        new ObjectStorageUnavailableError('down'),
      );
      await expect(
        service.deleteQuietly('event_photo', KEY),
      ).resolves.toBeUndefined();
      expect(metrics.objectDeleteFailed).toHaveBeenCalledWith('event_photo');
      expect(warn).toHaveBeenCalled();
    });
  });

  it('publicUrl e publicUrlOrNull delegam ao storage', () => {
    expect(service.publicUrl(KEY)).toBe(`https://cdn.test/${KEY}`);
    expect(service.publicUrlOrNull(KEY)).toBe(`https://cdn.test/${KEY}`);
    expect(service.publicUrlOrNull(null)).toBeNull();
  });
});
