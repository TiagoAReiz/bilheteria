import {Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post} from '@nestjs/common';
import {Session, type UserSession} from "@thallesp/nestjs-better-auth";
import {PAYMENT_SERVICE, type PaymentServicePort} from "../../../application/ports/inbound/services/payment.service.port.js";
import {CreateCheckoutDto} from "../../dto/create-checkout-dto.js";

// Todas as rotas exigem sessão (guard global do Better Auth).
@Controller("payments")
export class PaymentController {
  constructor(@Inject(PAYMENT_SERVICE) private readonly paymentService: PaymentServicePort) {}

  @Post("checkout")
  createCheckout(@Session() session: UserSession, @Body() dto: CreateCheckoutDto) {
    return this.paymentService.createCheckout({id: session.user.id, email: session.user.email}, dto.ticket_id);
  }

  @Get(":id")
  getPayment(@Session() session: UserSession, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.paymentService.getPayment(session.user.id, id);
  }
}
