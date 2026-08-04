/**
 * Workspace API + React Query hooks（feature.md §5.3 占位页）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import type {
  ListWorkspacesQuery,
  PaginatedResponse,
  WorkspaceItem,
  WorkspaceSort,
  WorkspaceStatus,
} from '@tiedaoyun/schema-types';
import { get, post, http } from './http';

export type { ListWorkspacesQuery, WorkspaceItem, WorkspaceSort, WorkspaceStatus };

/** GET /workspaces */
export function fetchWorkspaces(
  query: ListWorkspacesQuery = {},
): Promise<PaginatedResponse<WorkspaceItem>> {
  const keyword = query.keyword?.trim();
  return get<PaginatedResponse<WorkspaceItem>>('/workspaces', {
    params: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      ...(keyword ? { keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.sort ? { sort: query.sort } : {}),
    },
  });
}

/** GET /workspaces/:id */
export function fetchWorkspace(id: string): Promise<WorkspaceItem> {
  return get<WorkspaceItem>(`/workspaces/${id}`);
}

export interface CreateWorkspaceRequest {
  name: string;
  slug: string;
  logoUrl?: string;
}

export function createWorkspace(req: CreateWorkspaceRequest): Promise<WorkspaceItem> {
  return post<WorkspaceItem>('/workspaces', req);
}

export interface UpdateWorkspaceRequest {
  name?: string;
  logoUrl?: string | null;
  status?: string;
}

export function updateWorkspace(id: string, req: UpdateWorkspaceRequest): Promise<WorkspaceItem> {
  return http.patch(`/workspaces/${id}`, req) as unknown as Promise<WorkspaceItem>;
}

export interface DeleteWorkspaceResponse {
  message: string;
}

export function deleteWorkspace(id: string): Promise<DeleteWorkspaceResponse> {
  return http.delete(`/workspaces/${id}`) as unknown as Promise<DeleteWorkspaceResponse>;
}

/** React Query key 约定（feature.md §5.4） */
export const WORKSPACE_KEYS = {
  list: ['workspaces'] as const,
  listQuery: (query: ListWorkspacesQuery) => ['workspaces', query] as const,
  detail: (workspaceId: string) => ['workspace', workspaceId] as const,
};

/** 工作空间列表 hook */
export function useWorkspacesQuery(query: ListWorkspacesQuery) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.listQuery(query),
    queryFn: () => fetchWorkspaces(query),
  });
}

export function useWorkspaceQuery(workspaceId: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.detail(workspaceId),
    queryFn: () => fetchWorkspace(workspaceId),
    enabled: workspaceId.length > 0,
  });
}

export function useCreateWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEYS.list }),
  });
}

export function useUpdateWorkspaceMutation(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateWorkspaceRequest) => updateWorkspace(workspaceId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKSPACE_KEYS.list });
      qc.invalidateQueries({ queryKey: WORKSPACE_KEYS.detail(workspaceId) });
    },
  });
}

export function useDeleteWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACE_KEYS.list }),
  });
}

export function isWorkspaceSlugConflict(error: unknown): boolean {
  const status = (error as AxiosError | undefined)?.response?.status;
  return status === 409;
}
