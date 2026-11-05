export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface StoredCpf {
  cpfHash: string | null;
  cpfMasked: string | null;
}

export interface UserRepositoryPort {
  getCpfById(id: string): Promise<StoredCpf>;
  setCpfIfEmpty(
    id: string,
    cpfHash: string,
    cpfMasked: string,
  ): Promise<boolean>;
  promoteToOrganizer(id: string): Promise<void>;
  /** Troca (ou remove, com null) o avatar enviado; devolve a chave anterior e a foto do provedor. */
  replaceAvatarKey(
    id: string,
    key: string | null,
  ): Promise<{ previousKey: string | null; image: string | null }>;
}
