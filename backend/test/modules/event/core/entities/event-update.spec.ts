import {
  checkEventUpdate,
  type EventEditor,
} from '../../../../../src/modules/event/core/entities/event-update.js';
import type { Event } from '../../../../../src/modules/event/core/entities/event.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const owner: EventEditor = { id: 'org-1', role: 'ORGANIZER' };

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2026-07-01T20:00:00Z'),
  capacity: 10,
  price_cents: 5000,
  max_tickets_per_cpf: 2,
  available_tickets: 10,
  cover_key: null,
  organizer_id: 'org-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  ...overrides,
});

describe('checkEventUpdate', () => {
  it('aceita mudanças do dono num evento futuro', () => {
    expect(
      checkEventUpdate(
        makeEvent(),
        {
          name: 'Outro',
          price_cents: 9000,
          capacity: 20,
          max_tickets_per_cpf: 4,
        },
        owner,
        NOW,
      ),
    ).toBeNull();
  });

  it('aceita manter capacidade e limite iguais', () => {
    expect(
      checkEventUpdate(
        makeEvent(),
        { capacity: 10, max_tickets_per_cpf: 2 },
        owner,
        NOW,
      ),
    ).toBeNull();
  });

  it('outro organizador não edita; ADMIN edita', () => {
    expect(
      checkEventUpdate(
        makeEvent(),
        { name: 'x' },
        { id: 'org-2', role: 'ORGANIZER' },
        NOW,
      ),
    ).toBe('forbidden');
    expect(
      checkEventUpdate(
        makeEvent(),
        { name: 'x' },
        { id: 'adm', role: 'ADMIN' },
        NOW,
      ),
    ).toBeNull();
  });

  it('evento que já começou não muda', () => {
    expect(
      checkEventUpdate(
        makeEvent({ starts_at: NOW }),
        { name: 'x' },
        owner,
        NOW,
      ),
    ).toBe('event_started');
  });

  it('capacidade não diminui', () => {
    expect(checkEventUpdate(makeEvent(), { capacity: 9 }, owner, NOW)).toBe(
      'capacity_decrease',
    );
  });

  it('limite por CPF não diminui (escolha irreversível)', () => {
    expect(
      checkEventUpdate(
        makeEvent({ max_tickets_per_cpf: 3 }),
        { max_tickets_per_cpf: 2 },
        owner,
        NOW,
      ),
    ).toBe('limit_decrease');
  });

  it('limite não passa da capacidade (nova ou atual)', () => {
    expect(
      checkEventUpdate(
        makeEvent({ capacity: 3 }),
        { max_tickets_per_cpf: 4 },
        owner,
        NOW,
      ),
    ).toBe('limit_above_capacity');
    expect(
      checkEventUpdate(
        makeEvent({ capacity: 3 }),
        { capacity: 4, max_tickets_per_cpf: 4 },
        owner,
        NOW,
      ),
    ).toBeNull();
  });
});
