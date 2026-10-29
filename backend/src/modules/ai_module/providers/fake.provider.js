import { classifyByRules } from '../../ticket_module/ticket.rules_triage.js';
import { AiProviderName, AiTask } from '../ai.enums.js';

const FIRST_NAME_PATTERN = /"firstName":\s*"([^"]+)"/;

function lastUserMessage(messages) {
  return messages.findLast((message) => message.role === 'user')?.content ?? '';
}

function fakeTriage(content) {
  const { category, priority } = classifyByRules({ subject: '', description: content });
  return { category, priority, confidence: 0.9, rationale: 'Classified by the test provider.' };
}

function fakeDraft(content) {
  const firstName = content.match(FIRST_NAME_PATTERN)?.[1] ?? 'there';
  return {
    reply: `Hi ${firstName},\n\nThank you for reaching out. We have looked into your question and our team will get back to you within 48 hours with a full update.\n\nWarm regards,\nBookLeaf Author Support`,
    internalHints: [],
  };
}

export function createFakeProvider({ fail } = {}) {
  return {
    name: AiProviderName.FAKE,

    complete(request) {
      const failure = typeof fail === 'function' ? fail(request) : fail;
      if (failure) {
        return Promise.reject(failure);
      }

      const content = lastUserMessage(request.messages);
      const json = request.task === AiTask.TRIAGE ? fakeTriage(content) : fakeDraft(content);
      return Promise.resolve({
        json,
        model: request.model,
        usage: { inputTokens: Math.ceil(content.length / 4), cachedInputTokens: 0, outputTokens: 50 },
      });
    },
  };
}
