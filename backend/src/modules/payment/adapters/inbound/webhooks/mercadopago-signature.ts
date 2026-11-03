import {createHmac, timingSafeEqual} from "node:crypto";
import type {WebhookRejectionReason} from "../../../application/ports/outbound/metrics/payment-metrics.port.js";

// Validação da assinatura das notificações do Mercado Pago (Webhooks):
// https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/resources/notifications/webhooks
//
//   x-signature: ts=<timestamp>,v1=<hmac>
//   manifesto:   id:<data.id da query>;request-id:<x-request-id>;ts:<ts>;
//   v1 = hex(HMAC-SHA256(segredo, manifesto))
//
// O segredo é gerado no painel ("Suas integrações" > Webhooks) ao cadastrar a URL. Sem ele,
// nada é aceito (fail closed).

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface SignatureInput {
    signature: string | undefined;
    requestId: string | undefined;
    dataId: string | undefined;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: WebhookRejectionReason };

/** Lê `ts` e `v1` de "ts=...,v1=..." (ordem e espaços livres; outras chaves ignoradas). */
export function parseSignatureHeader(header: string): { ts?: string; v1?: string } {
    const parts: { ts?: string; v1?: string } = {};
    for (const piece of header.split(',')) {
        const separator = piece.indexOf('=');
        if (separator === -1) {
            continue;
        }
        const key = piece.slice(0, separator).trim().toLowerCase();
        const value = piece.slice(separator + 1).trim();
        if (key === 'ts' || key === 'v1') {
            parts[key] = value;
        }
    }
    return parts;
}

/** Partes ausentes saem do manifesto, como manda a documentação. */
export function buildManifest(dataId: string | undefined, requestId: string | undefined, ts: string): string {
    return [
        dataId ? `id:${dataId};` : '',
        requestId ? `request-id:${requestId};` : '',
        `ts:${ts};`,
    ].join('');
}

/**
 * Valida a assinatura. Comparação em tempo constante; timestamp fora de `toleranceSeconds`
 * em relação a `nowMs` é recusado (replay).
 */
export function verifyMercadoPagoSignature(
    input: SignatureInput,
    secret: string | undefined,
    nowMs: number,
    toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
): SignatureCheck {
    if (!secret) {
        return {ok: false, reason: 'missing_secret'};
    }
    const signature = input.signature?.trim();
    if (!signature) {
        return {ok: false, reason: 'missing_signature'};
    }
    const {ts, v1} = parseSignatureHeader(signature);
    // ts numérico e v1 = 64 hex (SHA-256); data.id é obrigatório para sabermos o que consultar
    if (!ts || !/^\d{1,16}$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1) || !input.dataId) {
        return {ok: false, reason: 'malformed_signature'};
    }

    const received = Buffer.from(v1.toLowerCase(), 'hex');
    const requestId = input.requestId?.trim() || undefined;
    // A documentação manda usar o data.id em minúsculas quando ele tem letras; o validador do SDK
    // oficial usa o valor como veio. Aceitamos os dois (cada um exige o segredo do mesmo jeito).
    const candidates = [...new Set([input.dataId.toLowerCase(), input.dataId])];
    const matches = candidates.some((dataId) => {
        const expected = createHmac('sha256', secret).update(buildManifest(dataId, requestId, ts)).digest();
        return timingSafeEqual(expected, received);
    });
    if (!matches) {
        return {ok: false, reason: 'invalid_signature'};
    }

    // a documentação fala em ms e os exemplos/SDK usam segundos: 13+ dígitos = ms
    const tsMs = ts.length >= 13 ? Number(ts) : Number(ts) * 1000;
    if (Math.abs(nowMs - tsMs) > toleranceSeconds * 1000) {
        return {ok: false, reason: 'stale_signature'};
    }
    return {ok: true};
}
