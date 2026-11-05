import { IsOptional, IsString, Matches } from 'class-validator';

// Query string da notificação do Mercado Pago: POST /webhooks/mercadopago?data.id=ORD...&type=order
// O corpo é ignorado de propósito: o estado real vem de GET /v1/orders/{id}.
export class MercadoPagoNotificationQueryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'data.id inválido' })
  'data.id': string;

  @IsOptional()
  @IsString()
  type?: string;
}
