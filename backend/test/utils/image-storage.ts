import type { MockPort } from './mocks.js';
import type { ImageStorageServicePort } from '../../src/modules/storage/application/ports/inbound/services/image-storage.service.port.js';

export const PUBLIC_BASE = 'https://cdn.test/bilheteria-images';

// Porta inbound do módulo storage para os services de event/users: URLs determinísticas e
// upload/confirmação resolvendo por padrão.
export const mockImageStorage = (): MockPort<ImageStorageServicePort> => ({
  createUpload: vi.fn(),
  confirmUpload: vi.fn().mockResolvedValue(undefined),
  publicUrl: vi.fn((key: string) => `${PUBLIC_BASE}/${key}`),
  publicUrlOrNull: vi.fn((key: string | null | undefined) =>
    key ? `${PUBLIC_BASE}/${key}` : null,
  ),
  deleteQuietly: vi.fn().mockResolvedValue(undefined),
});
