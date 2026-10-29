import { describe, expect, it } from 'vitest';
import { classifyByRules } from '../../../src/modules/ticket_module/ticket.rules_triage.js';

const classify = (description, subject = 'Support request') => classifyByRules({ subject, description });

describe('classifyByRules on the sample queries from the assignment', () => {
  it.each([
    [
      "I published my book 4 months ago and still haven't received any royalty. What's going on?",
      'ROYALTY_PAYMENTS',
      'HIGH',
    ],
    ['My royalty amount seems too low. I sold 200 copies but only received ₹3,000.', 'ROYALTY_PAYMENTS', 'MEDIUM'],
    ["My book is showing a different ISBN on Amazon than what's on the physical copy.", 'ISBN_METADATA', 'HIGH'],
    [
      'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
      'PRINTING_QUALITY',
      'HIGH',
    ],
    ['My book is published but it\'s showing as "Currently Unavailable" on Amazon.', 'DISTRIBUTION_AVAILABILITY', 'MEDIUM'],
    ["It's been 3 weeks and my book is still in typesetting. When will it be done?", 'BOOK_STATUS_PRODUCTION', 'MEDIUM'],
    ["Can I update the description of my book on Amazon after it's already live?", 'GENERAL_INQUIRY', 'LOW'],
  ])('%s', (description, category, priority) => {
    expect(classify(description)).toEqual({ category, priority });
  });

  it('ranks the PDF priority example correctly', () => {
    const royalty = classify("I haven't received any royalty for 6 months");
    const bio = classify('Can I update my author bio?');

    expect(royalty).toEqual({ category: 'ROYALTY_PAYMENTS', priority: 'HIGH' });
    expect(bio).toEqual({ category: 'GENERAL_INQUIRY', priority: 'LOW' });
  });
});

describe('classifyByRules details', () => {
  it('reads the subject as well as the description', () => {
    expect(classify('Please check this for me, thanks a lot.', 'ISBN is wrong on my book').category).toBe('ISBN_METADATA');
  });

  it('handles typographic apostrophes', () => {
    expect(classify('I haven’t received my royalty payment yet.').priority).toBe('HIGH');
  });

  it('falls back to a general, medium-priority ticket', () => {
    expect(classify('I would like to talk to someone about my account please.')).toEqual({
      category: 'GENERAL_INQUIRY',
      priority: 'MEDIUM',
    });
  });

  it('never assigns CRITICAL', () => {
    const urgent = classify('URGENT!!! wrong ISBN, duplicate listing, royalty never received, blurry misprint');

    expect(urgent.priority).not.toBe('CRITICAL');
  });
});
