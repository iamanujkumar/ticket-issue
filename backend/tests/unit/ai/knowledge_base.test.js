import { describe, expect, it } from 'vitest';
import { guidanceFor } from '../../../src/modules/ai_module/knowledge_base/kb.examples.js';
import {
  KB_COMPANY_OVERVIEW,
  KB_DISTRIBUTION_POLICY,
  KB_ISBN_POLICY,
  KB_PRINTING_POLICY,
  KB_PRODUCTION_STAGES,
  KB_ROYALTY_POLICY,
  KB_TONE_GUIDELINES,
  policyFor,
} from '../../../src/modules/ai_module/knowledge_base/kb.sections.js';

const ALL_POLICY_SECTIONS = [
  KB_COMPANY_OVERVIEW,
  KB_ROYALTY_POLICY,
  KB_ISBN_POLICY,
  KB_PRINTING_POLICY,
  KB_DISTRIBUTION_POLICY,
  KB_PRODUCTION_STAGES,
];

describe('policyFor', () => {
  it.each([
    ['ROYALTY_PAYMENTS', KB_ROYALTY_POLICY],
    ['ISBN_METADATA', KB_ISBN_POLICY],
    ['PRINTING_QUALITY', KB_PRINTING_POLICY],
    ['DISTRIBUTION_AVAILABILITY', KB_DISTRIBUTION_POLICY],
    ['BOOK_STATUS_PRODUCTION', KB_PRODUCTION_STAGES],
    ['GENERAL_INQUIRY', KB_COMPANY_OVERVIEW],
  ])('sends only the %s section', (category, section) => {
    expect(policyFor(category)).toBe(section);
  });

  it('adds the production stages when the book is in production', () => {
    expect(policyFor('ROYALTY_PAYMENTS', { bookInProduction: true })).toBe(
      `${KB_ROYALTY_POLICY}\n\n${KB_PRODUCTION_STAGES}`,
    );
  });

  it('does not repeat the production stages for production tickets', () => {
    expect(policyFor('BOOK_STATUS_PRODUCTION', { bookInProduction: true })).toBe(KB_PRODUCTION_STAGES);
  });

  it('is much smaller than the whole knowledge base', () => {
    const wholeKnowledgeBase = ALL_POLICY_SECTIONS.join('\n\n').length;

    expect(policyFor('ROYALTY_PAYMENTS').length).toBeLessThan(wholeKnowledgeBase / 3);
  });
});

describe('knowledge base content', () => {
  it('keeps the key policy facts from the assignment', () => {
    expect(KB_ROYALTY_POLICY).toContain('80% of the net profit');
    expect(KB_ROYALTY_POLICY).toContain('within 45 days of the quarter ending');
    expect(KB_ROYALTY_POLICY).toContain('₹1,000');
    expect(KB_PRINTING_POLICY).toContain('5–7 business days');
    expect(KB_DISTRIBUTION_POLICY).toContain('24–48 hours');
    expect(KB_TONE_GUIDELINES).toContain('within 48 hours');
  });
});

describe('guidanceFor', () => {
  it('returns both royalty examples', () => {
    expect(guidanceFor('ROYALTY_PAYMENTS')).toHaveLength(2);
  });

  it('returns an example for every category', () => {
    for (const category of [
      'ISBN_METADATA',
      'PRINTING_QUALITY',
      'DISTRIBUTION_AVAILABILITY',
      'BOOK_STATUS_PRODUCTION',
      'GENERAL_INQUIRY',
    ]) {
      expect(guidanceFor(category).length).toBeGreaterThan(0);
    }
  });
});
