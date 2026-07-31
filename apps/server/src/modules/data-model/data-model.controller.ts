/**
 * DataModelController — 数据模型设计器 REST 端点（plan T10 / HLD §6.3）。
 *
 * 路由前缀：/api/v1（main.ts 全局设置）。
 *
 * 实体：
 * - GET    apps/:appId/entities                — 列出应用下实体
 * - POST   apps/:appId/entities                — 新建实体
 * - GET    apps/:appId/entities/:eid           — 实体详情（含字段 + 关系）
 * - PATCH  apps/:appId/entities/:eid           — 更新实体
 * - DELETE apps/:appId/entities/:eid           — 软删实体
 *
 * 字段（实体作用域）：
 * - GET    apps/:appId/entities/:eid/fields         — 列出字段
 * - POST   apps/:appId/entities/:eid/fields         — 新建字段
 * - POST   apps/:appId/entities/:eid/fields/batch   — 批量新建字段
 * - GET    apps/:appId/entities/:eid/fields/:fid    — 字段详情
 * - PATCH  apps/:appId/entities/:eid/fields/:fid    — 更新字段
 * - DELETE apps/:appId/entities/:eid/fields/:fid    — 软删字段
 *
 * 关系（应用作用域）：
 * - GET    apps/:appId/relations              — 列出关系
 * - POST   apps/:appId/relations              — 新建关系
 * - GET    apps/:appId/relations/:rid         — 关系详情
 * - PATCH  apps/:appId/relations/:rid         — 更新关系
 * - DELETE apps/:appId/relations/:rid         — 删除关系
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EntityService } from './entity.service';
import { FieldService } from './field.service';
import { RelationService } from './relation.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { CreateFieldDto, BatchCreateFieldsDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  headers: Request['headers'] & {
    'x-workspace-id'?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('apps/:appId')
export class DataModelController {
  constructor(
    private readonly entityService: EntityService,
    private readonly fieldService: FieldService,
    private readonly relationService: RelationService,
  ) {}

  // ===================================================================
  // 实体
  // ===================================================================

  /** 列出应用下所有实体。 */
  @Get('entities')
  async listEntities(
    @Param('appId') appId: string,
    @Req() req: AuthenticatedRequest,
    @Query('withFields') withFields?: string,
    @Query('withRelations') withRelations?: string,
  ) {
    await this.assertSameWorkspace(appId, req);
    return this.entityService.listByApp(appId, {
      includeFields: withFields === 'true',
      includeRelations: withRelations === 'true',
    });
  }

  /** 新建实体。 */
  @Post('entities')
  async createEntity(
    @Param('appId') appId: string,
    @Body() dto: CreateEntityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertSameWorkspace(appId, req);
    return this.entityService.create(appId, dto, req.user.sub);
  }

  /** 实体详情（默认含字段 + 关系）。 */
  @Get('entities/:eid')
  async getEntity(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertSameWorkspace(appId, req);
    const entity = await this.entityService.findByIdOrFail(eid);
    // 防御性：实体不属于该 app
    if (entity.appId !== appId) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`实体 ${eid} 不在应用 ${appId} 下`);
    }
    return this.entityService
      .listByApp(appId, { includeFields: true, includeRelations: true })
      .then((list) => list.find((e) => e.id === eid));
  }

  /** 更新实体。 */
  @Patch('entities/:eid')
  async updateEntity(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Body() dto: UpdateEntityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertSameWorkspace(appId, req);
    const entity = await this.entityService.findByIdOrFail(eid);
    if (entity.appId !== appId) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`实体 ${eid} 不在应用 ${appId} 下`);
    }
    return this.entityService.update(eid, dto, req.user.sub);
  }

  /** 软删除实体。 */
  @Delete('entities/:eid')
  async deleteEntity(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.assertSameWorkspace(appId, req);
    const entity = await this.entityService.findByIdOrFail(eid);
    if (entity.appId !== appId) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`实体 ${eid} 不在应用 ${appId} 下`);
    }
    await this.entityService.softDelete(eid, req.user.sub);
    return { message: '实体已软删除' };
  }

  // ===================================================================
  // 字段
  // ===================================================================

  /** 列出实体的字段。 */
  @Get('entities/:eid/fields')
  async listFields(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Query('includeDeprecated') includeDeprecated?: string,
  ) {
    await this.assertEntityInApp(appId, eid);
    return this.fieldService.listByEntity(eid, {
      includeDeprecated: includeDeprecated === 'true',
    });
  }

  /** 新建字段。 */
  @Post('entities/:eid/fields')
  async createField(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Body() dto: CreateFieldDto,
  ) {
    await this.assertEntityInApp(appId, eid);
    return this.fieldService.create(eid, dto);
  }

  /** 批量新建字段。 */
  @Post('entities/:eid/fields/batch')
  async batchCreateFields(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Body() dto: BatchCreateFieldsDto,
  ) {
    await this.assertEntityInApp(appId, eid);
    return this.fieldService.createBatch(eid, dto.fields);
  }

  /** 字段详情。 */
  @Get('entities/:eid/fields/:fid')
  async getField(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Param('fid') fid: string,
  ) {
    await this.assertEntityInApp(appId, eid);
    const field = await this.fieldService.findByIdOrFail(fid);
    if (field.entityId !== eid) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`字段 ${fid} 不在实体 ${eid} 下`);
    }
    return field;
  }

  /** 更新字段。 */
  @Patch('entities/:eid/fields/:fid')
  async updateField(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Param('fid') fid: string,
    @Body() dto: UpdateFieldDto,
  ) {
    await this.assertEntityInApp(appId, eid);
    const field = await this.fieldService.findByIdOrFail(fid);
    if (field.entityId !== eid) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`字段 ${fid} 不在实体 ${eid} 下`);
    }
    return this.fieldService.update(fid, dto);
  }

  /** 软删除字段。 */
  @Delete('entities/:eid/fields/:fid')
  async deleteField(
    @Param('appId') appId: string,
    @Param('eid') eid: string,
    @Param('fid') fid: string,
  ) {
    await this.assertEntityInApp(appId, eid);
    const field = await this.fieldService.findByIdOrFail(fid);
    if (field.entityId !== eid) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`字段 ${fid} 不在实体 ${eid} 下`);
    }
    await this.fieldService.softDelete(fid);
    return { message: '字段已软删除（deprecated = true）' };
  }

  // ===================================================================
  // 关系
  // ===================================================================

  /** 列出应用下关系。 */
  @Get('relations')
  async listRelations(@Param('appId') appId: string, @Query('withEntities') withEntities?: string) {
    return this.relationService.listByApp(appId, {
      withEntities: withEntities === 'true',
    });
  }

  /** 新建关系。 */
  @Post('relations')
  async createRelation(@Param('appId') appId: string, @Body() dto: CreateRelationDto) {
    return this.relationService.create(appId, dto);
  }

  /** 关系详情。 */
  @Get('relations/:rid')
  async getRelation(@Param('rid') rid: string) {
    return this.relationService.findByIdOrFail(rid);
  }

  /** 更新关系。 */
  @Patch('relations/:rid')
  async updateRelation(@Param('rid') rid: string, @Body() dto: UpdateRelationDto) {
    return this.relationService.update(rid, dto);
  }

  /** 删除关系。 */
  @Delete('relations/:rid')
  async deleteRelation(@Param('rid') rid: string) {
    await this.relationService.delete(rid);
    return { message: '关系已删除' };
  }

  // ===================================================================
  // 私有工具
  // ===================================================================

  /** 校验 app 与 X-Workspace-Id header 一致（HLD §6.1 多工作空间隔离）。 */
  private async assertSameWorkspace(appId: string, req: AuthenticatedRequest): Promise<void> {
    const workspaceId = req.headers['x-workspace-id'];
    await this.entityService.assertAppExists(
      appId,
      typeof workspaceId === 'string' ? workspaceId : undefined,
    );
  }

  /** 校验 entity 存在且属于该 app。 */
  private async assertEntityInApp(appId: string, entityId: string): Promise<void> {
    const entity = await this.entityService.findByIdOrFail(entityId);
    if (entity.appId !== appId) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException(`实体 ${entityId} 不在应用 ${appId} 下`);
    }
  }
}
