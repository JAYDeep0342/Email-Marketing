import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  list() {
    return this.roles.list();
  }

  @Post('roles')
  create(@TenantId() tenantId: string, @Body() dto: CreateRoleDto) {
    return this.roles.create(tenantId, dto);
  }

  @Patch('roles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  @Post('users/:userId/roles')
  @HttpCode(200)
  assign(@Param('userId') userId: string, @Body('roleId') roleId: string) {
    return this.roles.assignToUser(userId, roleId);
  }

  @Delete('users/:userId/roles/:roleId')
  unassign(@Param('userId') userId: string, @Param('roleId') roleId: string) {
    return this.roles.removeFromUser(userId, roleId);
  }

  @Get('permissions')
  permissions() {
    return this.roles.listPermissions();
  }
}
