import { TicketCategory } from '../../ticket_module/ticket.enums.js';

export const KB_COMPANY_OVERVIEW = `Company Overview
- BookLeaf Publishing is a self-publishing company operating in India and the US.
- We offer publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).
- We handle cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for our authors.
- Our in-house printing facility and warehouse are located in Delhi. We also work with print partners including Repro India and Epitome Books.`;

export const KB_ROYALTY_POLICY = `Royalty Policy
- BookLeaf follows an 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter.
- Payouts are made via bank transfer to the account linked in the author's dashboard.
- Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.`;

export const KB_ISBN_POLICY = `ISBN Policy
- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.
- ISBNs are registered under BookLeaf's publisher imprint. If an author wants an ISBN under their own imprint, they need to obtain it independently.
- If an author reports an ISBN error (duplicate, wrong book linked), it is treated as a high-priority issue and escalated to the production team.`;

export const KB_PRINTING_POLICY = `Printing & Quality
- In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.
- Standard print turnaround: 5–7 business days from order confirmation.
- If an author reports a quality issue (misprints, binding defects, color inconsistency), BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.`;

export const KB_DISTRIBUTION_POLICY = `Distribution & Availability
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.
- New listings typically go live within 7–10 business days after publication is complete.
- If a book is showing as unavailable on a platform, it usually indicates a stock sync issue—BookLeaf's team can trigger a re-sync within 24–48 hours.`;

export const KB_PRODUCTION_STAGES = `Production Stages
- A book goes through the following stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
- Authors are updated at each stage via email. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`;

export const KB_TONE_GUIDELINES = `Communication Tone Guidelines
- Always empathetic and professional. Authors are our partners, not customers to be managed.
- Acknowledge the author's concern before jumping to solutions.
- Be specific: include actual numbers, dates, and statuses wherever possible rather than vague reassurances.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If the issue requires escalation or investigation, give a clear timeline ("Our team will look into this and get back to you within 48 hours") rather than open-ended promises.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

const POLICY_BY_CATEGORY = {
  [TicketCategory.ROYALTY_PAYMENTS]: [KB_ROYALTY_POLICY],
  [TicketCategory.ISBN_METADATA]: [KB_ISBN_POLICY],
  [TicketCategory.PRINTING_QUALITY]: [KB_PRINTING_POLICY],
  [TicketCategory.DISTRIBUTION_AVAILABILITY]: [KB_DISTRIBUTION_POLICY],
  [TicketCategory.BOOK_STATUS_PRODUCTION]: [KB_PRODUCTION_STAGES],
  [TicketCategory.GENERAL_INQUIRY]: [KB_COMPANY_OVERVIEW],
};

export function policyFor(category, { bookInProduction = false } = {}) {
  const sections = [...(POLICY_BY_CATEGORY[category] ?? [KB_COMPANY_OVERVIEW])];
  if (bookInProduction && !sections.includes(KB_PRODUCTION_STAGES)) {
    sections.push(KB_PRODUCTION_STAGES);
  }
  return sections.join('\n\n');
}
