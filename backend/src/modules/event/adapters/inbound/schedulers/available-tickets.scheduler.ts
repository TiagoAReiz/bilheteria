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
  EVENT_AVAILABILITY_SERVICE,
  type EventAvailabilityServicePort,
} from '../../../application/ports/inbound/services/event-availability.service.port.js';

export const AVAILABLE_TICKETS_JOB = 'event-available-tickets-refresh';
export const DEFAULT_AVAILABILITY_REFRESH_INTERVAL_MS = 10_000;

// adapter inbound disparado pelo relogio (no lugar de uma requisicao HTTP): chama o caso de uso
// que recalcula os contadores. Intervalo por env porque o @Interval do Nest so aceita constante.
@Injectable()
export class AvailableTicketsScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AvailableTicketsScheduler.name);
  private running = false;

  constructor(
    @Inject(EVENT_AVAILABILITY_SERVICE)
    private readonly availabilityService: EventAvailabilityServicePort,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const intervalMs = this.intervalMs();
    if (intervalMs <= 0) {
      this.logger.log(
        'Job de disponibilidade desligado (AVAILABILITY_REFRESH_INTERVAL_MS=0)',
      );
      return;
    }
    this.schedulerRegistry.addInterval(
      AVAILABLE_TICKETS_JOB,
      setInterval(() => void this.refresh(), intervalMs),
    );
  }

  onApplicationShutdown() {
    if (this.schedulerRegistry.doesExist('interval', AVAILABLE_TICKETS_JOB)) {
      this.schedulerRegistry.deleteInterval(AVAILABLE_TICKETS_JOB);
    }
  }

  // nunca lanca: uma falha (ex.: banco fora) so registra log e o proximo tick tenta de novo
  async refresh(): Promise<void> {
    // se uma rodada demorar mais que o intervalo, a seguinte e pulada em vez de empilhar UPDATEs
    if (this.running) {
      this.logger.warn(
        'Rodada anterior do job de disponibilidade ainda em execução; pulando',
      );
      return;
    }
    this.running = true;
    try {
      const changed = await this.availabilityService.refreshAvailableTickets();
      if (changed > 0) {
        this.logger.debug(
          `available_tickets atualizado em ${changed} evento(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Falha ao recalcular available_tickets: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  private intervalMs(): number {
    const raw = this.config.get<string>('AVAILABILITY_REFRESH_INTERVAL_MS');
    if (raw === undefined || raw === '') {
      return DEFAULT_AVAILABILITY_REFRESH_INTERVAL_MS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(
        `AVAILABILITY_REFRESH_INTERVAL_MS inválido: "${raw}" (use milissegundos; 0 desliga)`,
      );
    }
    return parsed;
  }
}
