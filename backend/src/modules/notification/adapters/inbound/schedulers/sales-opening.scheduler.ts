import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  SALES_OPENING_SERVICE,
  type SalesOpeningServicePort,
} from '../../../application/ports/inbound/services/sales-opening.service.port.js';

export const SALES_OPENING_JOB = 'sales-opening-notice';
export const DEFAULT_SALES_OPENING_INTERVAL_MS = 60_000;

// a cada minuto enfileira os avisos de "vendas abrem em 1 hora"; quem envia é o worker da outbox
@Injectable()
export class SalesOpeningScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SalesOpeningScheduler.name);
  private running = false;

  constructor(
    @Inject(SALES_OPENING_SERVICE)
    private readonly service: SalesOpeningServicePort,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const intervalMs = this.intervalMs();
    if (intervalMs <= 0) {
      this.logger.log(
        'Aviso de abertura das vendas desligado (SALES_OPENING_INTERVAL_MS=0)',
      );
      return;
    }
    this.schedulerRegistry.addInterval(
      SALES_OPENING_JOB,
      setInterval(() => void this.tick(), intervalMs),
    );
  }

  onApplicationShutdown() {
    if (this.schedulerRegistry.doesExist('interval', SALES_OPENING_JOB)) {
      this.schedulerRegistry.deleteInterval(SALES_OPENING_JOB);
    }
  }

  // nunca lança: banco fora só registra log e o próximo tick tenta de novo
  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const queued = await this.service.enqueueDue();
      if (queued > 0) {
        this.logger.log(
          `Avisos de abertura das vendas enfileirados: ${queued}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Falha ao enfileirar avisos de abertura das vendas: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  private intervalMs(): number {
    const raw = this.config.get<string>('SALES_OPENING_INTERVAL_MS');
    if (raw === undefined || raw === '') {
      return DEFAULT_SALES_OPENING_INTERVAL_MS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(
        `SALES_OPENING_INTERVAL_MS inválido: "${raw}" (use milissegundos; 0 desliga)`,
      );
    }
    return parsed;
  }
}
