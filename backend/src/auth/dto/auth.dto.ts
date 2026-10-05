import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
/** Drops invisible control/format characters and collapses whitespace. */
const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim() : value;
/** No links or angle brackets in names (spam sign-ups put URLs there). */
const PLAIN_NAME = /^(?![\s\S]*(?:https?:\/\/|www\.|[<>]))[\s\S]*$/i;

/** Fields the public auth forms send so the API can tell people from bots. */
class BotCheckDto {
  /** Solved proof-of-work challenge from GET auth/challenge (base64 JSON). */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  pow?: string;

  /** Honeypot: hidden from people, so only bots fill it in. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class RegisterDto extends BotCheckDto {
  @Transform(cleanText)
  @IsString()
  @Length(2, 120)
  @Matches(PLAIN_NAME, { message: 'Please enter your name without links or < > symbols.' })
  fullName: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}

export class LoginDto extends BotCheckDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 120)
  @Matches(PLAIN_NAME, { message: 'Please enter your name without links or < > symbols.' })
  fullName?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(160)
  headline?: string;
}

/** Finishes a Google / Apple sign-in (see OAuthService). */
export class OAuthExchangeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,100}$/)
  code: string;

  /** The PKCE verifier the app kept when it started the sign-in. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  verifier: string;
}

export class ChangePasswordDto {
  /** Left out by accounts that only sign in with Google / Apple and are setting their first password. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128)
  newPassword: string;
}
