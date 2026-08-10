import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SendingDomainService } from './sending-domain.service';
import { SendingServerService } from './sending-server.service';
import {
  CreateSendingDomainDto,
  CreateSendingServerDto,
} from './dto/sending.dto';

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
  //  Sending Servers (PLATFORM-level; dev management only)
  //  NOTE: not tenant-scoped. Move to Platform Admin later and lock down.
  // ============================================================
  @Post('sending-servers')
  createServer(@Body() dto: CreateSendingServerDto) {
    return this.servers.create(dto);
  }

  @Get('sending-servers')
  listServers() {
    return this.servers.list();
  }

  @Delete('sending-servers/:id')
  removeServer(@Param('id') id: string) {
    return this.servers.remove(id);
  }
}