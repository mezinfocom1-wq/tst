import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const PHONE = /^(\+212|0)[5-7]\d{8}$/;

export class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone marocain invalide' }) phone?: string;
  @IsOptional() @IsIn(['fr', 'ar']) locale?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}

export class GoogleDto {
  @IsString() @MaxLength(4096) idToken: string;
  @IsOptional() @IsIn(['fr', 'ar']) locale?: string;
}

export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(200) refreshToken?: string;
}

export class TokenDto {
  @IsString() @MaxLength(200) token: string;
}

export class ForgotDto {
  @IsEmail() email: string;
}

export class ResetDto {
  @IsString() @MaxLength(200) token: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

class NotifPrefsDto {
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

export class UpdateMeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) lastName?: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone marocain invalide' }) phone?: string;
  @IsOptional() @IsIn(['fr', 'ar']) locale?: string;
  @IsOptional() @ValidateNested() @Type(() => NotifPrefsDto) notifPrefs?: NotifPrefsDto;
}

export class ChangePasswordDto {
  @IsOptional() @IsString() @MaxLength(128) currentPassword?: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}

export class ProApplicationDto {
  @IsString() @MinLength(2) @MaxLength(100) businessName: string;
  @IsString() @MinLength(2) @MaxLength(60) city: string;
  @Matches(PHONE, { message: 'Numéro de téléphone marocain invalide' }) phone: string;
  @IsIn(['BARBER', 'HAIRDRESSER', 'STYLIST']) profession: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

export class DeleteAccountDto {
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}
