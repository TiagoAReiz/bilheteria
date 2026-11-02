import {Role} from "./role.js";

export class User{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
}
