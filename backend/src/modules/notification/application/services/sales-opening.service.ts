import { Inject, Injectable } from '@nestjs/common';
import { SALES_OPENING_NOTICE_MS } from '../../core/entities/sales-opening.js';
import { SalesOpeningServicePort } from '../ports/inbound/services/sales-opening.service.port.js';
import {
  SALES_OPENING_REPOSITORY,
  type SalesOpeningRepositoryPort,
} from '../ports/outbound/repositories/sales-opening.repository.port.js';

@Injectable()
export class SalesOpeningService implements SalesOpeningServicePort {
  constructor(
    @Inject(SALES_OPENING_REPOSITORY)
    private readonly repository: SalesOpeningRepositoryPort,
  ) {}

  enqueueDue(): Promise<number> {
    return this.repository.enqueueDue(SALES_OPENING_NOTICE_MS);
  }
}
