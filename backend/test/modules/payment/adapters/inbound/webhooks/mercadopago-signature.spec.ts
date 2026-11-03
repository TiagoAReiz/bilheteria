import { createHmac } from 'node:crypto';
import {
  buildManifest,
  parseSignatureHeader,
  verifyMercadoPagoSignature,
} from '../../../../../../src/modules/payment/adapters/inbound/webhooks/mercadopago-signature.js';

const SECRET = 'segredo-do-painel';
const NOW_MS = Date.parse('2026-06-15T12:00:00.000Z');
const TS = String(NOW_MS / 1000); // segundos, como nos exemplos da documentação
const ORDER_ID = 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9';
const REQUEST_ID = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';

const sign = (manifest: string, secret = SECRET) => createHmac('sha256', secret).update(manifest).digest('hex');

// assinatura como a documentação manda: data.id em minúsculas
const validHeader = (ts = TS, dataId = ORDER_ID.toLowerCase()) =>
  `ts=${ts},v1=${sign(`id:${dataId};request-id:${REQUEST_ID};ts:${ts};`)}`;

const input = (signature: string | undefined, overrides: Partial<{ requestId: string; dataId: string }> = {}) => ({
  signature,
  requestId: REQUEST_ID,
  dataId: ORDER_ID,
  ...overrides,
});

describe('verifyMercadoPagoSignature', () => {
  it('aceita a assinatura válida (manifesto com data.id em minúsculas)', () => {
    expect(verifyMercadoPagoSignature(input(validHeader()), SECRET, NOW_MS)).toEqual({ ok: true });
  });

  it('também aceita o data.id como veio (comportamento do validador do SDK oficial)', () => {
    const header = validHeader(TS, ORDER_ID);
    expect(verifyMercadoPagoSignature(input(header), SECRET, NOW_MS)).toEqual({ ok: true });
  });

  it('aceita header com espaços, outra ordem e chaves extras', () => {
    const v1 = sign(`id:${ORDER_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`);
    const header = ` v1=${v1.toUpperCase()} , ts=${TS}, v2=abc`;
    expect(verifyMercadoPagoSignature(input(header), SECRET, NOW_MS)).toEqual({ ok: true });
  });

  it('sem x-request-id: a parte sai do manifesto', () => {
    const header = `ts=${TS},v1=${sign(`id:${ORDER_ID.toLowerCase()};ts:${TS};`)}`;
    expect(
      verifyMercadoPagoSignature({ signature: header, requestId: undefined, dataId: ORDER_ID }, SECRET, NOW_MS),
    ).toEqual({ ok: true });
  });

  it('sem segredo configurado recusa tudo (fail closed), mesmo assinatura "válida"', () => {
    expect(verifyMercadoPagoSignature(input(validHeader()), undefined, NOW_MS)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
    expect(verifyMercadoPagoSignature(input(validHeader()), '', NOW_MS)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
  });

  it.each([undefined, '', '   '])('assinatura ausente (%j)', (signature) => {
    expect(verifyMercadoPagoSignature(input(signature), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it.each([
    ['sem ts', `v1=${'a'.repeat(64)}`],
    ['sem v1', `ts=${TS}`],
    ['ts não numérico', `ts=abc,v1=${'a'.repeat(64)}`],
    ['v1 curto', `ts=${TS},v1=abc`],
    ['v1 não hex', `ts=${TS},v1=${'z'.repeat(64)}`],
    ['lixo', 'qualquer coisa'],
  ])('malformada: %s', (_caso, header) => {
    expect(verifyMercadoPagoSignature(input(header), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'malformed_signature',
    });
  });

  it('sem data.id na query: malformada', () => {
    expect(verifyMercadoPagoSignature(input(validHeader(), { dataId: '' }), SECRET, NOW_MS)).toMatchObject({
      reason: 'malformed_signature',
    });
  });

  it.each([
    ['segredo errado', () => input(`ts=${TS},v1=${sign(`id:${ORDER_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`, 'outro')}`)],
    ['data.id trocado (outra order)', () => input(validHeader(), { dataId: 'ORDTST0OUTRA' })],
    ['request-id trocado', () => input(validHeader(), { requestId: 'outro-request' })],
    ['ts adulterado', () => input(validHeader().replace(`ts=${TS}`, `ts=${Number(TS) + 1}`))],
  ])('inválida: %s', (_caso, build) => {
    expect(verifyMercadoPagoSignature(build(), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('timestamp velho (replay) é recusado; dentro da tolerância passa', () => {
    const old = String(NOW_MS / 1000 - 301);
    expect(verifyMercadoPagoSignature(input(validHeader(old)), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'stale_signature',
    });
    const recent = String(NOW_MS / 1000 - 299);
    expect(verifyMercadoPagoSignature(input(validHeader(recent)), SECRET, NOW_MS)).toEqual({ ok: true });
    expect(verifyMercadoPagoSignature(input(validHeader(old)), SECRET, NOW_MS, 600)).toEqual({ ok: true });
  });

  it('timestamp do futuro além da tolerância também é recusado', () => {
    const future = String(NOW_MS / 1000 + 301);
    expect(verifyMercadoPagoSignature(input(validHeader(future)), SECRET, NOW_MS)).toMatchObject({
      reason: 'stale_signature',
    });
  });

  it('aceita ts em milissegundos (a documentação descreve assim)', () => {
    expect(verifyMercadoPagoSignature(input(validHeader(String(NOW_MS))), SECRET, NOW_MS)).toEqual({ ok: true });
  });
});

describe('helpers da assinatura', () => {
  it('parseSignatureHeader lê ts e v1', () => {
    expect(parseSignatureHeader('ts=1,v1=abc')).toEqual({ ts: '1', v1: 'abc' });
    expect(parseSignatureHeader('foo')).toEqual({});
  });

  it('buildManifest segue o template da documentação', () => {
    expect(buildManifest('ord1', 'req', '10')).toBe('id:ord1;request-id:req;ts:10;');
    expect(buildManifest(undefined, undefined, '10')).toBe('ts:10;');
  });
});
