export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
    getCpfHashById(id: string): Promise<string | null>;
    setCpfHashIfEmpty(id: string, cpfHash: string): Promise<boolean>;
}
