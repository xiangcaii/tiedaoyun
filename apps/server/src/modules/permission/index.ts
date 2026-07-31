/**
 * Permission 模块统一出口（plan T9）。
 */
export * from './permission.types';
export * from './builtin-policies';
export { PermissionService } from './permission.service';
export { PermissionGuard } from './permission.guard';
export {
  RequirePermission,
  PERMISSION_METADATA_KEY,
  type RequirePermissionMetadata,
} from './require-permission.decorator';
export { PermissionModule } from './permission.module';
