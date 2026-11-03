import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Contrato entre as tres pecas que descrevem o mesmo documento e vivem em lugares diferentes:
// o mapping (infra/search/elasticsearch), a transform do Sequin (infra/search/sequin/transforms)
// e os campos que os adapters da API consultam. Se alguem mudar um lado so, este teste quebra
// (sem precisar subir Elasticsearch nem Sequin).
const SEARCH_INFRA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/search',
);

type Mapping = Record<
  string,
  { type: string; fields?: Record<string, unknown> }
>;

const mappingOf = (index: string): Mapping =>
  (
    JSON.parse(
      readFileSync(
        resolve(SEARCH_INFRA, 'elasticsearch/index-templates', `${index}.json`),
        'utf8',
      ),
    ) as { template: { mappings: { properties: Mapping } } }
  ).template.mappings.properties;

// chaves do mapa retornado pela transform: "campo" => ...
const transformKeysOf = (file: string): string[] =>
  [
    ...readFileSync(
      resolve(SEARCH_INFRA, 'sequin/transforms', file),
      'utf8',
    ).matchAll(/^\s*"(\w+)" =>/gm),
  ]
    .map((match) => match[1])
    .sort();

describe('contrato do índice de busca', () => {
  describe('events', () => {
    const mapping = mappingOf('events');

    it('a transform produz exatamente os campos do mapping (dynamic: strict)', () => {
      expect(transformKeysOf('event-document.exs')).toEqual(
        Object.keys(mapping).sort(),
      );
    });

    it('tem os campos que o adapter consulta, com os tipos certos', () => {
      expect(mapping.name.type).toBe('search_as_you_type');
      expect(mapping.location.type).toBe('text');
      expect(mapping.location.fields).toHaveProperty('keyword');
      expect(mapping.starts_at.type).toBe('date');
      expect(mapping.available_tickets.type).toBe('integer');
      expect(mapping.capacity.type).toBe('integer');
      expect(mapping.organizer_id.type).toBe('keyword');
      expect(mapping.deleted.type).toBe('boolean');
    });
  });

  describe('tickets', () => {
    const mapping = mappingOf('tickets');

    it('a transform produz exatamente os campos do mapping (dynamic: strict)', () => {
      expect(transformKeysOf('ticket-document.exs')).toEqual(
        Object.keys(mapping).sort(),
      );
    });

    it('só indexa campos operacionais (nada de CPF ou dados pessoais)', () => {
      expect(Object.keys(mapping).sort()).toEqual([
        'deleted',
        'event_id',
        'id',
        'is_paid',
        'reserved_at',
        'status',
        'user_id',
      ]);
    });

    it('tem os campos que o adapter consulta, com os tipos certos', () => {
      expect(mapping.status.type).toBe('keyword');
      expect(mapping.reserved_at.type).toBe('date');
      expect(mapping.event_id.type).toBe('integer');
      expect(mapping.user_id.type).toBe('keyword');
    });
  });
});
