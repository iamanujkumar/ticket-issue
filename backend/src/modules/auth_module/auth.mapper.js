export function toAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    authorId: user.author?.id ?? null,
  };
}
