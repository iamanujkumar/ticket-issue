export { AiOutcome, AiTask, DraftStatus, DraftUsage } from '@prisma/client';

export const AiProviderName = Object.freeze({
  GROQ: 'groq',
  FAKE: 'fake',
  DISABLED: 'disabled',
});
