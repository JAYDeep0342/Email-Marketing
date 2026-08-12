import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto } from './dto/billing.dto';

/**
 * Tenant-facing subscription API. Mounted under /billing/ so the pricing
 * routes at /plans stay separately grouped.
 */
@Controller('billing/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  current() {
    return this.subscriptions.getCurrent();
  }

  @Post('checkout')
  @HttpCode(200)
  checkout(
    @TenantId() tenantId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptions.createCheckout(tenantId, dto.planId);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel() {
    return this.subscriptions.cancel();
  }
}
