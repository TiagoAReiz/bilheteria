/**
 * Avatar servido: o que o usuário enviou (`avatarKey`, no bucket) ou, se ele nunca enviou ou
 * removeu, a foto do provedor social (`image`, mantida pelo Better Auth). Null = iniciais no front.
 */
export function resolveAvatarUrl(
    user: {avatarKey?: string | null; image?: string | null},
    publicUrl: (key: string) => string,
): string | null {
    return user.avatarKey ? publicUrl(user.avatarKey) : (user.image ?? null);
}
