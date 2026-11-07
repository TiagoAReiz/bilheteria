import type { Mock } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  IMMUTABLE_CACHE_CONTROL,
  S3ObjectStorage,
  readStorageSettings,
} from '../../../../../../src/modules/storage/adapters/outbound/storage/s3-object-storage.js';
import { ObjectStorageUnavailableError } from '../../../../../../src/modules/storage/application/ports/outbound/storage/object-storage.port.js';

vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: vi.fn() }));

const LOCALSTACK_ENV = {
  STORAGE_S3_BUCKET: 'bilheteria-images',
  STORAGE_S3_REGION: 'us-east-1',
  STORAGE_S3_ENDPOINT: 'http://localhost:4566',
  STORAGE_S3_FORCE_PATH_STYLE: 'true',
  STORAGE_S3_ACCESS_KEY_ID: 'test',
  STORAGE_S3_SECRET_ACCESS_KEY: 'test',
  STORAGE_PUBLIC_URL: 'http://localhost:4566/bilheteria-images/',
};

const configOf = (env: Record<string, string | undefined>) =>
  ({ get: (name: string) => env[name] }) as unknown as ConfigService;

const s3Error = (name: string, status: number) =>
  new S3ServiceException({
    name,
    $fault: status >= 500 ? 'server' : 'client',
    $metadata: { httpStatusCode: status },
    message: name,
  });

describe('readStorageSettings', () => {
  it('LocalStack: endpoint, path-style e URL pública do .env (sem barra no fim)', () => {
    expect(readStorageSettings(configOf(LOCALSTACK_ENV))).toEqual({
      bucket: 'bilheteria-images',
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      presignEndpoint: 'http://localhost:4566',
      forcePathStyle: true,
      accessKeyId: 'test',
      secretAccessKey: 'test',
      publicUrl: 'http://localhost:4566/bilheteria-images',
    });
  });

  it('sem nada configurado: AWS S3 com a cadeia padrão de credenciais e URL virtual-hosted', () => {
    expect(readStorageSettings(configOf({}))).toEqual({
      bucket: 'bilheteria-images',
      region: 'us-east-1',
      endpoint: undefined,
      presignEndpoint: undefined,
      forcePathStyle: false,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      publicUrl: 'https://bilheteria-images.s3.us-east-1.amazonaws.com',
    });
  });

  it('sem STORAGE_PUBLIC_URL deriva a URL do endpoint', () => {
    expect(
      readStorageSettings(
        configOf({ ...LOCALSTACK_ENV, STORAGE_PUBLIC_URL: '' }),
      ).publicUrl,
    ).toBe('http://localhost:4566/bilheteria-images');
    expect(
      readStorageSettings(
        configOf({
          STORAGE_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
          STORAGE_S3_BUCKET: 'b',
        }),
      ).publicUrl,
    ).toBe('https://b.acc.r2.cloudflarestorage.com');
  });
});

describe('S3ObjectStorage', () => {
  let storage: S3ObjectStorage;
  let send: Mock;

  beforeEach(() => {
    send = vi.spyOn(S3Client.prototype, 'send') as unknown as Mock;
    storage = new S3ObjectStorage(configOf(LOCALSTACK_ENV));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(createPresignedPost).mockReset();
  });

  it('o client usa endpoint, região, path-style e as chaves do .env', async () => {
    const client = (storage as unknown as { client: S3Client }).client;
    expect(client.config.forcePathStyle).toBe(true);
    await expect(client.config.region()).resolves.toBe('us-east-1');
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
    const endpoint = await client.config.endpoint!();
    expect(`${endpoint.protocol}//${endpoint.hostname}:${endpoint.port}`).toBe(
      'http://localhost:4566',
    );
  });

  it('API no docker: assina com o endereço que o navegador alcança e fala com o S3 pela rede interna', async () => {
    const docker = new S3ObjectStorage(
      configOf({
        ...LOCALSTACK_ENV,
        STORAGE_S3_ENDPOINT: 'http://localstack:4566',
        STORAGE_S3_PRESIGN_ENDPOINT: 'http://localhost:4566',
      }),
    );
    vi.mocked(createPresignedPost).mockResolvedValue({ url: 'u', fields: {} });
    await docker.createPresignedPost({
      key: 'events/1/cover/a.png',
      contentType: 'image/png',
      maxBytes: 1,
      expiresInSeconds: 60,
    });

    const hostOf = async (client: S3Client) =>
      (await client.config.endpoint!()).hostname;
    const signer = vi.mocked(createPresignedPost).mock.calls[0][0];
    const internal = (docker as unknown as { client: S3Client }).client;
    await expect(hostOf(signer)).resolves.toBe('localhost');
    await expect(hostOf(internal)).resolves.toBe('localstack');
  });

  it('createPresignedPost: chave exata, Content-Type e Cache-Control fixos e content-length-range', async () => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'http://localhost:4566/bilheteria-images',
      fields: {
        key: 'events/1/cover/a.png',
        Policy: 'p',
        'X-Amz-Signature': 's',
      },
    });

    await expect(
      storage.createPresignedPost({
        key: 'events/1/cover/a.png',
        contentType: 'image/png',
        maxBytes: 5_242_880,
        expiresInSeconds: 300,
      }),
    ).resolves.toEqual({
      url: 'http://localhost:4566/bilheteria-images',
      fields: {
        key: 'events/1/cover/a.png',
        Policy: 'p',
        'X-Amz-Signature': 's',
      },
    });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.any(S3Client), {
      Bucket: 'bilheteria-images',
      Key: 'events/1/cover/a.png',
      Fields: {
        'Content-Type': 'image/png',
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      },
      Conditions: [['content-length-range', 1, 5_242_880]],
      Expires: 300,
    });
    expect(send).not.toHaveBeenCalled();
  });

  describe('headObject', () => {
    it('devolve tamanho e tipo', async () => {
      send.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/png' });

      await expect(storage.headObject('k.png')).resolves.toEqual({
        size: 2048,
        contentType: 'image/png',
      });
      const command = send.mock.calls[0][0] as HeadObjectCommand;
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'bilheteria-images',
        Key: 'k.png',
      });
    });

    it('404 vira null', async () => {
      send.mockRejectedValue(s3Error('NotFound', 404));
      await expect(storage.headObject('k.png')).resolves.toBeNull();
    });

    it.each([
      ['5xx', s3Error('InternalError', 500)],
      ['throttling', s3Error('SlowDown', 429)],
      [
        'rede (sem status)',
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4566'), {
          code: 'ECONNREFUSED',
        }),
      ],
    ])('%s vira ObjectStorageUnavailableError', async (_case, error) => {
      send.mockRejectedValue(error);
      await expect(storage.headObject('k.png')).rejects.toBeInstanceOf(
        ObjectStorageUnavailableError,
      );
    });

    it('403 (credencial/política) propaga como erro comum', async () => {
      const denied = s3Error('AccessDenied', 403);
      send.mockRejectedValue(denied);
      await expect(storage.headObject('k.png')).rejects.toBe(denied);
    });
  });

  describe('readPrefix', () => {
    it('lê só os primeiros bytes (Range)', async () => {
      const bytes = Uint8Array.from([1, 2, 3]);
      send.mockResolvedValue({
        Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) },
      });

      await expect(storage.readPrefix('k.png', 12)).resolves.toBe(bytes);
      const command = send.mock.calls[0][0] as GetObjectCommand;
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'bilheteria-images',
        Key: 'k.png',
        Range: 'bytes=0-11',
      });
    });

    it('objeto sumiu: bytes vazios (a assinatura não bate)', async () => {
      send.mockRejectedValue(s3Error('NoSuchKey', 404));
      await expect(storage.readPrefix('k.png', 12)).resolves.toEqual(
        new Uint8Array(),
      );
    });
  });

  describe('deleteObject', () => {
    it('apaga pela chave', async () => {
      send.mockResolvedValue({});
      await storage.deleteObject('k.png');
      const command = send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'bilheteria-images',
        Key: 'k.png',
      });
    });

    it('bucket fora vira ObjectStorageUnavailableError', async () => {
      send.mockRejectedValue(s3Error('ServiceUnavailable', 503));
      await expect(storage.deleteObject('k.png')).rejects.toBeInstanceOf(
        ObjectStorageUnavailableError,
      );
    });
  });

  it('publicUrl junta a base com a chave, codificando cada segmento', () => {
    expect(storage.publicUrl('events/1/cover/a.png')).toBe(
      'http://localhost:4566/bilheteria-images/events/1/cover/a.png',
    );
    expect(storage.publicUrl('users/a b%/avatar/x.png')).toBe(
      'http://localhost:4566/bilheteria-images/users/a%20b%25/avatar/x.png',
    );
  });

  it('fecha o client no shutdown', () => {
    const destroy = vi.spyOn(S3Client.prototype, 'destroy');
    storage.onModuleDestroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
