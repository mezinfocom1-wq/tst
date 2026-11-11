import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ApplicationDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_INFO']) decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class SalonDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_INFO', 'SUSPEND', 'REACTIVATE']) decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND' | 'REACTIVATE';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class NoteDto {
  @IsString() @MinLength(3) @MaxLength(1000) note: string;
}
export class PlanDto {
  @Matches(/^[A-Z0-9_]{2,30}$/) code: string;
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) @Max(1000000) priceMad: number;
  @IsInt() @Min(1) @Max(3660) durationDays: number;
  @IsObject() features: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}
export class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) priceMad?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3660) durationDays?: number;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}
export class UserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
}
export class SettingDto {
  @IsObject() value: Record<string, unknown>;
}
export class ComplaintUpdateDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED']) status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  @IsOptional() @IsString() @MaxLength(2000) adminReply?: string;
}
export class HideDto {
  @IsBoolean() hidden: boolean;
}
export class TemplateDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
}
export class ComplaintDto {
  @IsString() @MinLength(3) @MaxLength(150) subject: string;
  @IsString() @MinLength(10) @MaxLength(4000) message: string;
  @IsOptional() @IsString() @MaxLength(36) salonId?: string;
}
