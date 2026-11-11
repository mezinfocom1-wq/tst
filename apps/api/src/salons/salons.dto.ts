import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const PHONE = /^(\+212|0)[5-7]\d{8}$/;
export const SALON_TYPES = ['MEN', 'WOMEN', 'MIXED', 'KIDS'];

export class CreateSalonDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsIn(SALON_TYPES) type: string;
  @IsString() @MinLength(2) @MaxLength(60) city: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
}

export class UpdateSalonDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(SALON_TYPES) type?: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone marocain invalide' }) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsString() @MaxLength(60) district?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) brandColor?: string;
  @IsOptional() @IsBoolean() bookingEnabled?: boolean;
  @IsOptional() @IsBoolean() queueEnabled?: boolean;
  @IsOptional() @IsBoolean() queueOnsiteOnly?: boolean;
  @IsOptional() @IsBoolean() allowRequeue?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(120) lateToleranceMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(72) cancelMinHours?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) bookingLeadMin?: number;
  @IsOptional() @IsIn([5, 10, 15, 20, 30, 60]) slotStepMin?: number;
}

export class ServiceDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsInt() @Min(5) @Max(480) durationMin: number;
  @IsInt() @Min(0) @Max(100000) priceMad: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsInt() @Min(5) @Max(480) durationMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) priceMad?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class StaffDto {
  @IsString() @MinLength(2) @MaxLength(60) displayName: string;
  @IsOptional() @IsString() @MaxLength(60) title?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) serviceIds?: string[];
}

export class UpdateStaffDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) title?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) serviceIds?: string[];
}

class HourDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsInt() @Min(0) @Max(1439) startMin: number;
  @IsInt() @Min(1) @Max(1440) endMin: number;
}

export class HoursDto {
  @IsArray() @ArrayMaxSize(42) @ValidateNested({ each: true }) @Type(() => HourDto) hours: HourDto[];
}

export class TimeOffDto {
  @IsISO8601() startAt: string;
  @IsISO8601() endAt: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class AvailabilityItemDto {
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() staffId?: string;
}

export class AvailabilityDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => AvailabilityItemDto) items: AvailabilityItemDto[];
  @IsOptional() @IsIn(['CONSECUTIVE', 'PARALLEL']) mode?: 'CONSECUTIVE' | 'PARALLEL';
}
