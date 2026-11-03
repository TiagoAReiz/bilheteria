export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
    getCpfHashById(id: string): Promise<string | null>;
    setCpfHashIfEmpty(id: string, cpfHash: string): Promise<boolean>;
    promoteToOrganizer(id: string): Promise<void>;
    /** Troca (ou remove, com null) o avatar enviado; devolve a chave anterior e a foto do provedor. */
    replaceAvatarKey(id: string, key: string | null): Promise<{previousKey: string | null; image: string | null}>;
}
