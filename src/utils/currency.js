import { formatPrice } from './grouping.js'

export const CURRENCIES = [
  'HKD',
  'JPY',
  'KRW',
  'CNY',
  'TWD',
  'THB',
  'SGD',
  'USD',
  'EUR',
  'CAD',
  'GBP',
  'AUD',
  'NZD',
  'CHF',
]

export const DEFAULT_CURRENCY = 'HKD'

export function formatMoney(price, currency = DEFAULT_CURRENCY) {
  const formatted = formatPrice(price)
  if (formatted === '—') return formatted
  return `${currency} ${formatted}`
}
