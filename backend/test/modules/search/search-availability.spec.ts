import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { errors } from '@elastic/elasticsearch';
import {
  isSearchBackendUnavailable,
  withSearchAvailability,
} from '../../../src/modules/search/search-availability.js';
import { responseError } from '../../utils/elasticsearch.js';

describe('search-availability', () => {
  describe('isSearchBackendUnavailable', () => {
    it.each([
      ['ConnectionError', new errors.ConnectionError('ECONNREFUSED')],
      ['TimeoutError', new errors.TimeoutError('timeout')],
      [
        'NoLivingConnectionsError',
        new errors.NoLivingConnectionsError('none', {} as never),
      ],
      ['500', responseError(500)],
      ['503', responseError(503)],
      ['429 (sobrecarga)', responseError(429)],
      [
        '404 de índice inexistente',
        responseError(404, 'index_not_found_exception'),
      ],
    ])('%s => indisponível', (_case, error) => {
      expect(isSearchBackendUnavailable(error)).toBe(true);
    });

    it.each([
      ['400 de query inválida', responseError(400, 'parsing_exception')],
      ['404 de outro tipo', responseError(404, 'resource_not_found_exception')],
      ['erro comum', new Error('bug')],
      ['valor qualquer', 'x'],
    ])('%s => não é indisponibilidade', (_case, error) => {
      expect(isSearchBackendUnavailable(error)).toBe(false);
    });
  });

  describe('withSearchAvailability', () => {
    const logger = new Logger('test');

    beforeEach(() => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    it('devolve o resultado da operação', async () => {
      await expect(
        withSearchAvailability(logger, async () => 42),
      ).resolves.toBe(42);
    });

    it('converte indisponibilidade em 503 guardando a causa', async () => {
      const cause = new errors.ConnectionError('down');
      const promise = withSearchAvailability(logger, () =>
        Promise.reject(cause),
      );

      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise).rejects.toMatchObject({ cause });
    });

    it('relança outros erros sem mexer', async () => {
      const bug = new TypeError('bug');
      await expect(
        withSearchAvailability(logger, () => Promise.reject(bug)),
      ).rejects.toBe(bug);
    });
  });
});
