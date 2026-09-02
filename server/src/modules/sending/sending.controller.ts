import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SendingDomainService } from './sending-domain.service';
import { SendingServerService } from './sending-server.service';
import {
  CreateSendingDomainDto,
  CreateSendingServerDto,
} from './dto/sending.dto';
import { PlatformAdminGuard } from '../billing/guards/platform-admin.guard';

@Controller()
export class SendingController {
  constructor(
    private readonly domains: SendingDomainService,
    private readonly servers: SendingServerService,
  ) {}

  // ============================================================
  //  Sending Domains (tenant-scoped)
  // ============================================================
  @Post('sending-domains')
  createDomain(
    @TenantId() tenantId: string,
    @Body() dto: CreateSendingDomainDto,
  ) {
    return this.domains.create(tenantId, dto);
  }

  @Get('sending-domains')
  listDomains() {
    return this.domains.list();
  }

  @Delete('sending-domains/:id')
  removeDomain(@Param('id') id: string) {
    return this.domains.remove(id);
  }

  @Post('sending-domains/:id/verify')
  @HttpCode(200)
  verifyDomain(@Param('id') id: string) {
    return this.domains.verify(id);
  }

  // ============================================================
  //  Sending Servers (PLATFORM-level, shared by all tenants — intentionally
  //  not tenant-scoped; see sending-server.service.ts). Locked down to
  //  platform admins only (BUG #4), same guard as AdminPlansController.
  // ============================================================
  @UseGuards(PlatformAdminGuard)
  @Post('sending-servers')
  createServer(@Body() dto: CreateSendingServerDto) {
    return this.servers.create(dto);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('sending-servers')
  listServers() {
    return this.servers.list();
  }

  @UseGuards(PlatformAdminGuard)
  @Delete('sending-servers/:id')
  removeServer(@Param('id') id: string) {
    return this.servers.remove(id);
  }
}