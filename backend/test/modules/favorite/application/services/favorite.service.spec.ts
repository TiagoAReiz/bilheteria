import { NotFoundException } from '@nestjs/common';
import type { MockPort } from '../../../../utils/mocks.js';
import { FavoriteService } from '../../../../../src/modules/favorite/application/services/favorite.service.js';
import type { FavoriteRepositoryPort } from '../../../../../src/modules/favorite/application/ports/outbound/repositories/favorite.repository.port.js';
import type { ImageStorageServicePort } from '../../../../../src/modules/storage/application/ports/inbound/services/image-storage.service.port.js';
import type { Event } from '../../../../../src/modules/event/core/entities/event.entity.js';

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 10,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2030-01-01T20:00:00Z'),
  capacity: 10,
  price_cents: 5000,
  max_tickets_per_cpf: 2,
  available_tickets: 10,
  cover_key: 'events/10/cover/a.jpg',
  sales_starts_at: null,
  organizer_id: 'org-1',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
  ...overrides,
});

describe('FavoriteService', () => {
  let repository: MockPort<FavoriteRepositoryPort>;
  let service: FavoriteService;

  beforeEach(() => {
    repository = {
      add: vi.fn().mockResolvedValue('added'),
      remove: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
    };
    const images = {
      publicUrl: (key: string) => `https://cdn/${key}`,
    } as unknown as ImageStorageServicePort;
    service = new FavoriteService(repository, images);
  });

  it('favorita com o relógio atual', async () => {
    await service.favorite('user-1', 10);
    expect(repository.add).toHaveBeenCalledWith('user-1', 10, expect.any(Date));
  });

  it('evento inexistente, cancelado ou passado vira 404', async () => {
    repository.add.mockResolvedValue('event_not_found');
    await expect(service.favorite('user-1', 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('desfavoritar delega ao repositório', async () => {
    await service.unfavorite('user-1', 10);
    expect(repository.remove).toHaveBeenCalledWith('user-1', 10);
  });

  it('lista os favoritos com a URL pública da capa', async () => {
    repository.listEvents.mockResolvedValue([event()]);

    const [view] = await service.listFavorites('user-1');

    expect(view).toMatchObject({
      id: 10,
      cover_url: 'https://cdn/events/10/cover/a.jpg',
      sales_starts_at: null,
    });
    expect(view).not.toHaveProperty('cover_key');
  });
});
