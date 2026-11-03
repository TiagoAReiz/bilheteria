import {Transform, Type} from 'class-transformer';
import {IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min} from 'class-validator';
import {EVENT_SEARCH_LIMITS} from "../../core/entities/event-search.entity.js";
import {toBoolean, trimToUndefined} from "../../../search/query-transformers.js";

export class SearchEventsDto {
    @IsOptional()
    @Transform(trimToUndefined)
    @IsString()
    @MaxLength(EVENT_SEARCH_LIMITS.maxQueryLength)
    q?: string;

    @IsOptional()
    @Transform(trimToUndefined)
    @IsString()
    @MaxLength(EVENT_SEARCH_LIMITS.maxQueryLength)
    location?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    from?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    to?: Date;

    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    available?: boolean;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(EVENT_SEARCH_LIMITS.maxPage)
    page: number = 1;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(EVENT_SEARCH_LIMITS.maxPageSize)
    size: number = EVENT_SEARCH_LIMITS.defaultPageSize;
}

export class SuggestEventsDto {
    @Transform(trimToUndefined)
    @IsString()
    @IsNotEmpty()
    @MaxLength(EVENT_SEARCH_LIMITS.maxQueryLength)
    q: string;
}
