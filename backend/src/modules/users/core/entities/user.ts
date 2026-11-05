import { Role } from './role.js';

export class User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: Role;
  cpfHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}
