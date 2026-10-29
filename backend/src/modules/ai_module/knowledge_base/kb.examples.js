import { TicketCategory } from '../../ticket_module/ticket.enums.js';

const EXAMPLES_BY_CATEGORY = {
  [TicketCategory.ROYALTY_PAYMENTS]: [
    {
      query: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
      guidance:
        'Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check if their bank details are linked. Provide the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.',
    },
    {
      query: 'My royalty amount seems too low. I sold 200 copies but only received ₹3,000.',
      guidance:
        "Explain the net profit calculation: MRP minus printing, platform commission, and shipping. Offer to share a detailed line-by-line royalty breakdown. Don't be defensive—offer transparency.",
    },
  ],
  [TicketCategory.ISBN_METADATA]: [
    {
      query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
      guidance:
        'Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.',
    },
  ],
  [TicketCategory.PRINTING_QUALITY]: [
    {
      query:
        'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
      guidance:
        'Apologise sincerely. Ask the author to share photos of the defective copies. Confirm that BookLeaf will arrange a free reprint once verified. Provide a timeline of 5–7 business days for the reprint.',
    },
  ],
  [TicketCategory.DISTRIBUTION_AVAILABILITY]: [
    {
      query: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
      guidance:
        "Explain that this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24–48 hours for it to go live again.",
    },
  ],
  [TicketCategory.BOOK_STATUS_PRODUCTION]: [
    {
      query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
      guidance:
        "Check the actual production status. If it's delayed, be honest about why (e.g., waiting on author approval for proofs). Provide a specific updated timeline. Don't blame the author even if the delay is on their side—frame it collaboratively.",
    },
  ],
  [TicketCategory.GENERAL_INQUIRY]: [
    {
      query: "Can I update the description of my book on Amazon after it's already live?",
      guidance:
        'Yes, metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.',
    },
  ],
};

export function guidanceFor(category) {
  return EXAMPLES_BY_CATEGORY[category] ?? EXAMPLES_BY_CATEGORY[TicketCategory.GENERAL_INQUIRY];
}
