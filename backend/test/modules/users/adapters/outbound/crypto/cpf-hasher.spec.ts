import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { CpfHasher } from '../../../../../../src/modules/users/adapters/outbound/crypto/cpf-hasher.js';
import { Cpf } from '../../../../../../src/modules/users/core/entities/cpf.js';

const configWith = (env: Record<string, string>) => {
  const getOrThrow = vi.fn((key: string) => {
    if (!(key in env)) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return env[key];
  });
  return { getOrThrow, config: { getOrThrow } as unknown as ConfigService };
};

const cpf = (raw: string) => Cpf.create(raw)!;

describe('CpfHasher', () => {
  it('lê CPF_HASH_SECRET via getOrThrow', () => {
    const { config, getOrThrow } = configWith({ CPF_HASH_SECRET: 'segredo' });
    new CpfHasher(config);
    expect(getOrThrow).toHaveBeenCalledWith('CPF_HASH_SECRET');
  });

  it('gera HMAC-SHA256 hex do CPF com o segredo', () => {
    const hasher = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo' }).config,
    );
    const expected = createHmac('sha256', 'segredo')
      .update('52998224725')
      .digest('hex');

    const hash = hasher.hash(cpf('52998224725'));
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é determinístico', () => {
    const hasher = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo' }).config,
    );
    expect(hasher.hash(cpf('52998224725'))).toBe(
      hasher.hash(cpf('52998224725')),
    );
    const other = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo' }).config,
    );
    expect(other.hash(cpf('52998224725'))).toBe(
      hasher.hash(cpf('52998224725')),
    );
  });

  it('usa o CPF normalizado: com e sem máscara geram o mesmo hash', () => {
    const hasher = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo' }).config,
    );
    expect(hasher.hash(cpf('529.982.247-25'))).toBe(
      hasher.hash(cpf('52998224725')),
    );
  });

  it('CPFs diferentes geram hashes diferentes', () => {
    const hasher = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo' }).config,
    );
    expect(hasher.hash(cpf('52998224725'))).not.toBe(
      hasher.hash(cpf('11144477735')),
    );
  });

  it('muda quando o segredo muda', () => {
    const a = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo-a' }).config,
    );
    const b = new CpfHasher(
      configWith({ CPF_HASH_SECRET: 'segredo-b' }).config,
    );
    expect(a.hash(cpf('52998224725'))).not.toBe(b.hash(cpf('52998224725')));
  });

  it('lança se CPF_HASH_SECRET não estiver configurado (ConfigService real)', () => {
    const previous = process.env.CPF_HASH_SECRET;
    delete process.env.CPF_HASH_SECRET;
    try {
      expect(() => new CpfHasher(new ConfigService({}))).toThrow(
        /CPF_HASH_SECRET/,
      );
    } finally {
      if (previous !== undefined) {
        process.env.CPF_HASH_SECRET = previous;
      }
    }
  });

  it('funciona com o ConfigService real quando o segredo existe', () => {
    const hasher = new CpfHasher(
      new ConfigService({ CPF_HASH_SECRET: 'segredo' }),
    );
    expect(hasher.hash(cpf('52998224725'))).toBe(
      createHmac('sha256', 'segredo').update('52998224725').digest('hex'),
    );
  });
});
