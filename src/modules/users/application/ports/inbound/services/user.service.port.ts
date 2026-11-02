export const USER_SERVICE = Symbol('USER_SERVICE');

export interface UserServicePort {
    registerCpf(userId: string, rawCpf: string): Promise<void>;
    hasCpf(userId: string): Promise<boolean>;
}
