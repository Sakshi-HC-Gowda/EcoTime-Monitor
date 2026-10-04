export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: number | null;
  organization: {
    id: number;
    name: string;
    createdAt: string;
  } | null;
  role: {
    id: number;
    name: string;
    description?: string;
    createdAt?: string;
  } | null;
  createdAt?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}
