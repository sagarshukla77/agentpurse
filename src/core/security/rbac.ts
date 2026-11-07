import type { Role } from '../types';

export type Permission =
  | 'invoice:read' | 'invoice:submit' | 'invoice:cancel' | 'source:read'
  | 'approval:decide' | 'vendor:create' | 'vendor:verify'
  | 'mandate:create' | 'mandate:activate' | 'agent:manage'
  | 'killswitch:engage' | 'killswitch:release' | 'audit:read' | 'demo:reset';

const VIEWER: Permission[] = ['invoice:read', 'audit:read'];
const APPROVER: Permission[] = [...VIEWER, 'invoice:submit', 'invoice:cancel', 'source:read', 'approval:decide', 'vendor:verify', 'mandate:activate', 'killswitch:engage'];
const OWNER: Permission[] = [...APPROVER, 'vendor:create', 'mandate:create', 'agent:manage', 'killswitch:release', 'demo:reset'];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER),
  approver: new Set(APPROVER),
  owner: new Set(OWNER),
};

export const can = (role: Role, perm: Permission): boolean => MATRIX[role].has(perm);
