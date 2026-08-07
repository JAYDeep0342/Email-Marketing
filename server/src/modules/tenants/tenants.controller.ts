import { Body, Controller, Get, Patch } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/tenants.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('current')
  getCurrent(@TenantId() tenantId: string) {
    return this.tenants.getCurrent(tenantId);
  }

  @Patch('current')
  updateCurrent(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.updateCurrent(tenantId, dto);
  }
}
