/**
 * Workspace API + React Query hooks（feature.md §5.3 占位页）。
 */
import { useQuery } from '@tanstack/react-query';
import { get } from './http';

/** 后端 Workspace 裸对象（apps/server WorkspaceService.listByUser 返回） */
export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  ownerId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /workspaces */
export function fetchWorkspaces(): Promise<WorkspaceItem[]> {
  return get<WorkspaceItem[]>('/workspaces');
}

/** React Query key 约定（feature.md §5.4） */
export const WORKSPACE_KEYS = {
  list: ['workspaces'] as const,
};

/** 工作空间列表 hook */
export function useWorkspacesQuery() {
  return useQuery({
    queryKey: WORKSPACE_KEYS.list,
    queryFn: fetchWorkspaces,
  });
}
