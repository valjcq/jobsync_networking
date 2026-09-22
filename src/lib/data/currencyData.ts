// id === value === label so a picked currency stores its own code through
// SelectFormCtrl's normal select path, matching the pattern in salaryRangeData.
const CURRENCY_CODES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "CHF",
  "JPY",
  "INR",
  "MXN",
] as const;

export const CURRENCIES = CURRENCY_CODES.map((code) => ({
  id: code,
  value: code,
  label: code,
}));

export const DEFAULT_CURRENCY = "USD";
