import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  TICKET_SEARCH_LIMITS,
  TICKET_SEARCH_STATUSES,
  type TicketSearchStatus,
} from '../../core/entities/ticket-search.entity.js';

export class SearchTicketsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  event_id?: number;

  @IsOptional()
  @IsIn(TICKET_SEARCH_STATUSES)
  status?: TicketSearchStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TICKET_SEARCH_LIMITS.maxPage)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TICKET_SEARCH_LIMITS.maxPageSize)
  size: number = TICKET_SEARCH_LIMITS.defaultPageSize;
}
