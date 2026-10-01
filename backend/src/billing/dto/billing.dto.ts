import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SubmitPaymentDto {
  @IsIn(['jazzcash', 'easypaisa', 'bank'])
  method: 'jazzcash' | 'easypaisa' | 'bank';

  @IsString()
  @Matches(/^[A-Za-z0-9-]{6,40}$/, { message: 'Enter the transaction ID exactly as shown on your receipt (letters and numbers).' })
  transactionId: string;

  @IsString()
  @Matches(/^[A-Za-z0-9 +-]{7,34}$/, { message: 'Enter the mobile number or account number / IBAN you paid from.' })
  senderNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;
}

export class ReviewPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'all'])
  status?: 'pending' | 'approved' | 'rejected' | 'all';
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class SetPlanDto {
  @IsIn(['free', 'lifetime'])
  plan: 'free' | 'lifetime';
}
