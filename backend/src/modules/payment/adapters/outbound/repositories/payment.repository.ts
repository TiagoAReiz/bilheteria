import {Injectable} from "@nestjs/common";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {NotApprovedStatus, Payment, PaymentStatus} from "../../../core/entities/payment.entity.js";
import {
    ChargedAmount,
    CheckoutTicket,
    TicketSnapshot,
    checkoutBlocker,
    decideApproval,
    decidePendingCheckout,
    reservationDeadline,
} from "../../../core/entities/payment-rules.js";
import {
    OpenCheckoutInput,
    OpenCheckoutResult,
    PaymentRepositoryPort,
    ProviderIds,
    SettlementResult,
} from "../../../application/ports/outbound/repositories/payment.repository.port.js";

// Linhas cruas do $queryRaw (colunas como estão no Postgres).
type CheckoutTicketRow = {
    id: number;
    user_id: string | null;
    reserved_at: Date | null;
    is_paid: boolean;
    event_id: number;
    event_name: string;
    price_cents: number | null;
    event_starts_at: Date;
    event_deleted: boolean;
    now: Date;
};
type TicketRow = TicketSnapshot & { now: Date };
type PaymentRow = Omit<Payment, 'status'> & { status: string };

// De onde cada transição pode sair. "approved" e "refunded" são finais.
const NOT_APPROVED_FROM: PaymentStatus[] = ['pending', 'rejected'];
const REFUNDABLE_FROM: PaymentStatus[] = ['pending', 'rejected', 'cancelled', 'expired'];

/**
 * Persistência do pagamento. As operações que mexem no ticket (checkout e confirmação) travam
 * a linha do ticket com `SELECT ... FOR UPDATE` e, depois, as linhas de payment: sempre nessa
 * ordem, para duas transações nunca esperarem uma pela outra em ordem inversa (deadlock).
 * As decisões (reserva válida? confirma ou estorna?) são as funções puras de payment-rules,
 * avaliadas com o relógio do Postgres, o mesmo da query de reserva do módulo ticket.
 */
@Injectable()
export class PaymentRepository implements PaymentRepositoryPort {
    constructor(private readonly prisma: PrismaService) {
    }

    async openCheckout(input: OpenCheckoutInput): Promise<OpenCheckoutResult> {
        return await this.prisma.$transaction(async (tx) => {
            // trava o ticket: duas abas do mesmo usuário não criam dois checkouts, e a confirmação
            // de um pagamento antigo espera este checkout terminar
            const [row] = await tx.$queryRaw<CheckoutTicketRow[]>`
                SELECT t.id, t.user_id, t.reserved_at, t.is_paid, t.event_id,
                       e.name AS event_name, e.price_cents, e.starts_at AS event_starts_at,
                       (e.deleted_at IS NOT NULL) AS event_deleted, NOW() AS now
                FROM ticket AS t
                JOIN event AS e ON e.id = t.event_id
                WHERE t.id = ${input.ticketId} AND t.deleted_at IS NULL
                FOR UPDATE OF t`;
            if (!row) {
                return {outcome: 'blocked', reason: 'ticket_not_found'};
            }
            const {now, ...ticket} = row;
            const blocker = checkoutBlocker(ticket, input.userId, now);
            if (blocker) {
                return {outcome: 'blocked', reason: blocker};
            }
            // checkoutBlocker garante reserved_at e price_cents preenchidos
            const deadline = reservationDeadline(ticket.reserved_at as Date);
            const pending = await tx.payment.findMany({where: {ticket_id: ticket.id, status: 'pending'}});
            const decision = decidePendingCheckout(pending.map(toPayment), input.userId, deadline, now);
            if (decision.action === 'reuse') {
                return {outcome: 'reused', payment: decision.payment};
            }
            if (decision.action === 'wait') {
                return {outcome: 'in_progress'};
            }
            // checkouts de reservas anteriores (ou abandonados) deixam de valer; se um deles ainda
            // for pago no provedor, a confirmação percebe que a reserva mudou e estorna
            await tx.payment.updateMany({
                where: {ticket_id: ticket.id, status: 'pending'},
                data: {status: 'expired'},
            });
            const payment = await tx.payment.create({
                data: {
                    ticket_id: ticket.id,
                    user_id: input.userId,
                    amount_cents: ticket.price_cents as number,
                    currency: input.currency,
                    status: 'pending',
                    provider: input.provider,
                    expires_at: deadline,
                },
            });
            return {outcome: 'created', payment: toPayment(payment), ticket: ticket satisfies CheckoutTicket};
        });
    }

    async attachCheckout(paymentId: string, providerOrderId: string, checkoutUrl: string): Promise<Payment | null> {
        const {count} = await this.prisma.payment.updateMany({
            where: {id: paymentId, status: 'pending'},
            data: {provider_order_id: providerOrderId, checkout_url: checkoutUrl},
        });
        return count === 0 ? null : this.findById(paymentId);
    }

    async markCheckoutFailed(paymentId: string): Promise<void> {
        await this.prisma.payment.updateMany({
            where: {id: paymentId, status: 'pending', checkout_url: null},
            data: {status: 'cancelled'},
        });
    }

    async findById(paymentId: string): Promise<Payment | null> {
        const payment = await this.prisma.payment.findUnique({where: {id: paymentId}});
        return payment ? toPayment(payment) : null;
    }

    async settleApproved(paymentId: string, ids: ProviderIds, charged: ChargedAmount): Promise<SettlementResult> {
        return await this.prisma.$transaction(async (tx) => {
            // ticket_id não muda: lê sem trava só para saber qual ticket travar primeiro
            const ref = await tx.payment.findUnique({where: {id: paymentId}, select: {ticket_id: true}});
            if (!ref) {
                return {outcome: 'not_found'};
            }
            // 1) ticket, 2) pagamento: mesma ordem do openCheckout
            const [ticketRow] = await tx.$queryRaw<TicketRow[]>`
                SELECT id, user_id, reserved_at, is_paid, NOW() AS now
                FROM ticket WHERE id = ${ref.ticket_id}
                FOR UPDATE`;
            const [paymentRow] = await tx.$queryRaw<PaymentRow[]>`
                SELECT * FROM payment WHERE id = ${paymentId}
                FOR UPDATE`;
            if (!ticketRow || !paymentRow) {
                return {outcome: 'not_found'};
            }
            const payment = toPayment(paymentRow);
            // idempotência: notificação repetida não muda nada
            if (payment.status === 'approved') {
                return {outcome: 'already_approved'};
            }
            if (payment.status === 'refunded') {
                return {outcome: 'already_refunded'};
            }
            const {now, ...ticket} = ticketRow;
            const decision = decideApproval(ticket, payment, charged, now);
            if (decision.action === 'refund') {
                return {outcome: 'refund_required', reason: decision.reason};
            }
            // ticket pago e pagamento aprovado na MESMA transação. O `is_paid = false` e o índice
            // único parcial payment_one_approved_per_ticket são as barreiras finais contra vender
            // o ingresso duas vezes, caso alguma das checagens acima tenha um bug.
            const paid = await tx.$executeRaw`
                UPDATE ticket SET is_paid = true, updated_at = NOW()
                WHERE id = ${ticket.id} AND is_paid = false AND user_id = ${payment.user_id}`;
            if (paid !== 1) {
                throw new Error(`Ticket ${ticket.id} mudou durante a confirmação do pagamento ${paymentId}`);
            }
            const approved = await tx.payment.update({
                where: {id: paymentId},
                data: {
                    status: 'approved',
                    ...providerData(ids),
                },
            });
            return {outcome: 'confirmed', payment: toPayment(approved)};
        });
    }

    async markRefunded(paymentId: string, ids: ProviderIds): Promise<boolean> {
        const {count} = await this.prisma.payment.updateMany({
            where: {id: paymentId, status: {in: REFUNDABLE_FROM}},
            data: {
                status: 'refunded',
                ...providerData(ids),
            },
        });
        return count > 0;
    }

    async markNotApproved(paymentId: string, status: NotApprovedStatus, ids: ProviderIds): Promise<boolean> {
        const {count} = await this.prisma.payment.updateMany({
            where: {id: paymentId, status: {in: NOT_APPROVED_FROM.filter((from) => from !== status)}},
            data: {
                status,
                ...providerData(ids),
            },
        });
        return count > 0;
    }
}

// nunca apaga um id do provedor já gravado com null
function providerData(ids: ProviderIds): {provider_order_id: string; provider_payment_id?: string} {
    return ids.providerPaymentId === null
        ? {provider_order_id: ids.providerOrderId}
        : {provider_order_id: ids.providerOrderId, provider_payment_id: ids.providerPaymentId};
}

function toPayment(row: PaymentRow): Payment {
    return {
        id: row.id,
        ticket_id: row.ticket_id,
        user_id: row.user_id,
        amount_cents: row.amount_cents,
        currency: row.currency,
        status: row.status as PaymentStatus,
        provider: row.provider,
        provider_order_id: row.provider_order_id,
        provider_payment_id: row.provider_payment_id,
        checkout_url: row.checkout_url,
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
