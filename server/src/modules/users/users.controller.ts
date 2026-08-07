import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  InviteUserDto,
  UpdateUserDto,
} from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.users.getMe(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(userId, dto);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(userId, dto);
  }

  @Get()
  list(@Query() q: PaginationDto) {
    return this.users.list(q.page, q.limit);
  }

  @Post('invite')
  invite(@TenantId() tenantId: string, @Body() dto: InviteUserDto) {
    return this.users.invite(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') currentUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(currentUserId, id, dto);
  }

  @Delete(':id')
  deactivate(
    @CurrentUser('id') currentUserId: string,
    @Param('id') id: string,
  ) {
    return this.users.deactivate(currentUserId, id);
  }
}
