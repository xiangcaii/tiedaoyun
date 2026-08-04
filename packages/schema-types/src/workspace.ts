export type WorkspaceStatus = 'active' | 'archived';
export type WorkspaceSort = 'createdAtDesc' | 'createdAtAsc' | 'nameAsc' | 'nameDesc';

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  ownerId: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListWorkspacesQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: WorkspaceStatus;
  sort?: WorkspaceSort;
}
