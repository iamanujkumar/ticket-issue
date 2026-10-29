export function toDraft({ draft, isStale }) {
  return {
    id: draft.id,
    status: draft.status,
    content: draft.content,
    internalHints: draft.internalHints,
    isStale,
    model: draft.model,
    instructions: draft.instructions,
    errorCode: draft.errorCode,
    sent: draft.sentMessageId !== null,
    createdAt: draft.createdAt.toISOString(),
  };
}
