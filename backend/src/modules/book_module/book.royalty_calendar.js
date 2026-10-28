import { BUSINESS_TIME_ZONE, PAYOUT_DAYS_AFTER_QUARTER_END } from './book.constants.js';

const BUSINESS_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE });

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function previousQuarter({ year, quarter }) {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}

export function toBusinessDate(instant) {
  return BUSINESS_DATE_FORMAT.format(instant);
}

export function quarterOf(isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  return { year, quarter: Math.ceil(month / 3) };
}

export function quarterEnd({ year, quarter }) {
  return toIsoDate(new Date(Date.UTC(year, quarter * 3, 0)));
}

export function payoutDeadline(quarter) {
  const deadline = new Date(`${quarterEnd(quarter)}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + PAYOUT_DAYS_AFTER_QUARTER_END);
  return toIsoDate(deadline);
}

export function nextPayout(now = new Date()) {
  const today = toBusinessDate(now);
  const lastEndedQuarter = previousQuarter(quarterOf(today));
  const quarter = payoutDeadline(lastEndedQuarter) >= today ? lastEndedQuarter : quarterOf(today);

  return {
    quarter: `Q${quarter.quarter} ${quarter.year}`,
    paidBy: payoutDeadline(quarter),
  };
}
