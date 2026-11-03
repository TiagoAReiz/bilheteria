import {Injectable, Logger} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {randomUUID} from "node:crypto";
import {
    CreateCheckoutRequest,
    CreatedCheckout,
    PaymentGatewayPort,
    PaymentGatewayRejectedError,
    PaymentGatewayUnavailableError,
    ProviderOrder,
    ProviderOrderStatus,
} from "../../../application/ports/outbound/gateways/payment-gateway.port.js";
import {
    MercadoPagoCreateOrderRequest,
    MercadoPagoErrorBody,
    MercadoPagoOrder,
    MercadoPagoOrderStatus,
} from "./mercadopago.types.js";

export const MERCADOPAGO_PROVIDER = 'mercadopago';
export const DEFAULT_MP_API_BASE_URL = 'https://api.mercadopago.com';
export const DEFAULT_MP_HTTP_TIMEOUT_MS = 5_000;
// abaixo do CHECKOUT_CREATION_GRACE_MS (30s) e dos 22s que o Mercado Pago espera pelo webhook
export const MAX_MP_HTTP_TIMEOUT_MS = 15_000;

// Boleto ("ticket") e pagamento em lotérica ("atm") compensam em dias; a reserva dura 5 minutos.
// Ficam de fora para ninguém pagar um ingresso que já voltou para a venda (seria estornado).
export const NOT_ALLOWED_PAYMENT_TYPES = ['ticket', 'atm'];

// checkout_url só pode levar a um domínio do Mercado Pago (evita open redirect no front)
const CHECKOUT_HOSTS = ['mercadopago.com.br', 'mercadopago.com'];
// mesmo formato aceito em external_reference e nos ids de order
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

const ORDER_STATUS: Record<MercadoPagoOrderStatus, ProviderOrderStatus> = {
    created: 'pending',
    action_required: 'pending',
    processing: 'pending',
    processed: 'approved',
    failed: 'rejected',
    canceled: 'cancelled',
    expired: 'expired',
    refunded: 'refunded',
    charged_back: 'charged_back',
};

/** Tradução do status da order; desconhecido vira `pending` (não faz nada até ficar claro). */
export function toProviderStatus(status: string): ProviderOrderStatus {
    return Object.hasOwn(ORDER_STATUS, status) ? ORDER_STATUS[status as MercadoPagoOrderStatus] : 'pending';
}

/** 1234 -> "12.34" (sem float: dinheiro em centavos inteiros). */
export function centsToAmount(cents: number): string {
    if (!Number.isSafeInteger(cents) || cents <= 0) {
        throw new Error(`Valor inválido: ${cents}`);
    }
    return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** "12.34" | "12.3" | "12" -> 1234; null se não for um valor decimal válido. */
export function amountToCents(amount: string | undefined): number | null {
    const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount ?? '');
    if (!match) {
        return null;
    }
    return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** Duração ISO 8601 até `expiresAt` (ex.: PT4M30S), arredondada para baixo em segundos. */
export function isoDurationUntil(expiresAt: Date, now: Date): string {
    const totalSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
    if (totalSeconds <= 0) {
        throw new PaymentGatewayRejectedError('A reserva já expirou', 'expired');
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `PT${minutes > 0 ? `${minutes}M` : ''}${seconds > 0 || minutes === 0 ? `${seconds}S` : ''}`;
}

export function isAllowedCheckoutUrl(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && CHECKOUT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
}

type Settings = {
    accessToken: string | undefined;
    baseUrl: string;
    timeoutMs: number;
    frontendUrl: string;
};

/**
 * Checkout Pro pela API de Orders do Mercado Pago, com fetch nativo (sem o SDK: sem retries
 * escondidos, timeout sob controle e nada além de 3 endpoints). Todo detalhe do provedor fica
 * aqui: o PaymentService só conhece a PaymentGatewayPort.
 */
@Injectable()
export class MercadoPagoGateway implements PaymentGatewayPort {
    readonly provider = MERCADOPAGO_PROVIDER;
    private readonly logger = new Logger(MercadoPagoGateway.name);
    private readonly settings: Settings;

    constructor(config: ConfigService) {
        this.settings = readSettings(config);
    }

    async createCheckout(request: CreateCheckoutRequest): Promise<CreatedCheckout> {
        if (request.currency !== 'BRL') {
            // a moeda da order é a da conta do vendedor (BRL); outra moeda seria cobrada errado
            throw new PaymentGatewayRejectedError(`Moeda não suportada: ${request.currency}`, 'unsupported_currency');
        }
        const amount = centsToAmount(request.amountCents);
        const returnUrl = (path: string) =>
            `${this.settings.frontendUrl}/payment/${path}?payment_id=${encodeURIComponent(request.paymentId)}`;
        const body: MercadoPagoCreateOrderRequest = {
            type: 'online',
            processing_mode: 'manual',
            total_amount: amount,
            external_reference: request.paymentId,
            expiration_time: isoDurationUntil(request.expiresAt, new Date()),
            description: truncate(request.title, 256),
            ...(request.payerEmail ? {payer: {email: request.payerEmail}} : {}),
            items: [{
                title: truncate(request.title, 256),
                unit_price: amount,
                quantity: 1,
                external_code: `ticket-${request.ticketId}`,
            }],
            config: {
                online: {
                    success_url: returnUrl('success'),
                    failure_url: returnUrl('failure'),
                    pending_url: returnUrl('pending'),
                    auto_return: 'all',
                },
                payment_method: {not_allowed_types: NOT_ALLOWED_PAYMENT_TYPES},
            },
        };

        // a chave de idempotência é o nosso id: repetir a chamada nunca cria duas orders
        const order = await this.request<MercadoPagoOrder>('POST', '/v1/orders', 'criar order', {
            body,
            idempotencyKey: request.paymentId,
        });
        if (!order || typeof order.id !== 'string' || !PROVIDER_ID.test(order.id) || !isAllowedCheckoutUrl(order.checkout_url)) {
            throw new PaymentGatewayRejectedError('Resposta inesperada do Mercado Pago ao criar a order', 'invalid_response');
        }
        return {providerOrderId: order.id, checkoutUrl: order.checkout_url};
    }

    async getOrder(providerOrderId: string): Promise<ProviderOrder | null> {
        if (!PROVIDER_ID.test(providerOrderId)) {
            return null;
        }
        const order = await this.request<MercadoPagoOrder>(
            'GET', `/v1/orders/${encodeURIComponent(providerOrderId)}`, 'consultar order', {notFoundAsNull: true},
        );
        if (!order) {
            return null;
        }
        const amountCents = amountToCents(order.total_amount);
        if (typeof order.id !== 'string' || amountCents === null || typeof order.currency !== 'string') {
            throw new PaymentGatewayRejectedError('Resposta inesperada do Mercado Pago ao consultar a order', 'invalid_response');
        }
        const payments = order.transactions?.payments ?? [];
        const payment = payments.find((p) => p.status === 'processed') ?? payments[0];
        return {
            providerOrderId: order.id,
            externalReference: order.external_reference ?? null,
            status: toProviderStatus(order.status),
            providerPaymentId: typeof payment?.id === 'string' ? payment.id : null,
            amountCents,
            currency: order.currency,
        };
    }

    async refund(providerOrderId: string): Promise<void> {
        try {
            // estorno total (corpo vazio). Chave nova a cada tentativa: um estorno total em dobro é
            // impossível (o segundo recebe 409 order_already_refunded), e reaproveitar a chave de uma
            // tentativa que falhou travaria as próximas com idempotency_key_already_used.
            await this.request('POST', `/v1/orders/${encodeURIComponent(providerOrderId)}/refund`, 'estornar order', {
                body: {},
                idempotencyKey: randomUUID(),
            });
        } catch (error) {
            if (error instanceof PaymentGatewayRejectedError
                && (error.code === 'order_already_refunded' || error.code === 'order_refund_already_in_process')) {
                return;
            }
            throw error;
        }
    }

    private async request<T>(
        method: 'GET' | 'POST',
        path: string,
        action: string,
        options: {body?: unknown; idempotencyKey?: string; notFoundAsNull?: boolean} = {},
    ): Promise<T | null> {
        const {accessToken, baseUrl, timeoutMs} = this.settings;
        if (!accessToken) {
            throw new PaymentGatewayRejectedError('MP_ACCESS_TOKEN não configurado', 'not_configured');
        }
        let response: Response;
        try {
            const headers: Record<string, string> = {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            };
            if (options.idempotencyKey) {
                headers['X-Idempotency-Key'] = options.idempotencyKey;
            }
            const init: RequestInit = {method, headers, signal: AbortSignal.timeout(timeoutMs)};
            if (method === 'POST') {
                headers['Content-Type'] = 'application/json';
                init.body = JSON.stringify(options.body ?? {});
            }
            response = await fetch(`${baseUrl}${path}`, init);
        } catch (error) {
            // rede fora, DNS, timeout (AbortSignal): transitório
            this.logger.warn(`Mercado Pago indisponível ao ${action}: ${(error as Error).name}`);
            throw new PaymentGatewayUnavailableError(`Mercado Pago indisponível ao ${action}`, {cause: error});
        }

        if (response.ok) {
            return (await response.json().catch(() => null)) as T | null;
        }
        const code = await errorCode(response);
        // id que o Mercado Pago não conhece (404) ou nem aceita como id (400 invalid_path_param):
        // falha permanente. Devolver null deixa o webhook responder 200 em vez de pedir reenvio por 48h.
        if (options.notFoundAsNull
            && (response.status === 404 || (response.status === 400 && code === 'invalid_path_param'))) {
            this.logger.warn(`Mercado Pago não reconhece o recurso ao ${action} (${response.status} ${code ?? 'sem código'})`);
            return null;
        }
        // nunca loga headers nem corpo: o corpo pode ter e-mail do comprador
        this.logger.warn(`Mercado Pago respondeu ${response.status} (${code ?? 'sem código'}) ao ${action}`);
        if (response.status === 429 || response.status >= 500) {
            throw new PaymentGatewayUnavailableError(`Mercado Pago respondeu ${response.status} ao ${action}`);
        }
        throw new PaymentGatewayRejectedError(`Mercado Pago recusou ${action} (${response.status})`, code);
    }
}

function readSettings(config: ConfigService): Settings {
    const rawTimeout = config.get<string>('MP_HTTP_TIMEOUT_MS');
    const timeoutMs = rawTimeout === undefined || rawTimeout === '' ? DEFAULT_MP_HTTP_TIMEOUT_MS : Number(rawTimeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_MP_HTTP_TIMEOUT_MS) {
        throw new Error(`MP_HTTP_TIMEOUT_MS inválido: "${rawTimeout}" (1 a ${MAX_MP_HTTP_TIMEOUT_MS} ms)`);
    }
    return {
        // sem token a API sobe normalmente; só as operações de pagamento falham (502)
        accessToken: config.get<string>('MP_ACCESS_TOKEN') || undefined,
        baseUrl: (config.get<string>('MP_API_BASE_URL') || DEFAULT_MP_API_BASE_URL).replace(/\/+$/, ''),
        timeoutMs,
        frontendUrl: config.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, ''),
    };
}

async function errorCode(response: Response): Promise<string | undefined> {
    const body = (await response.json().catch(() => null)) as MercadoPagoErrorBody | null;
    const code = body?.errors?.[0]?.code ?? body?.error;
    return typeof code === 'string' ? code : undefined;
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : value.slice(0, max);
}
