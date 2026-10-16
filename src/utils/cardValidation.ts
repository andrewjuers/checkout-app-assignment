export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

const CARD_PATTERNS: Record<CardBrand, { length: number[]; cvclength: number[] }> = {
  visa: { length: [13, 16, 19], cvclength: [3] },
  mastercard: { length: [16], cvclength: [3] },
  amex: { length: [15], cvclength: [4] },
  discover: { length: [16, 19], cvclength: [3] },
  unknown: { length: [], cvclength: [3] },
};

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function detectCardType(value: string): CardBrand {
  const digits = normalizeDigits(value);

  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  return 'unknown';
}

export function formatCardNumber(value: string): string {
  const digits = normalizeDigits(value).slice(0, 19);
  const type = detectCardType(digits);

  if (type === 'amex') {
    return digits
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4}\s\d{6})(\d)/, '$1 $2')
      .slice(0, 17);
  }

  return digits
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .slice(0, 19)
    .trim();
}

export function formatExpiry(value: string): string {
  const digits = normalizeDigits(value).slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function validateCardNumber(value: string): { isValid: boolean; type: CardBrand; normalized: string } {
  const digits = normalizeDigits(value);
  const type = detectCardType(digits);
  const pattern = CARD_PATTERNS[type];

  const hasValidLength = pattern.length.length === 0 ? digits.length >= 12 : pattern.length.includes(digits.length);
  const passesLuhn = digits.length > 0 && luhnCheck(digits);

  return {
    isValid: hasValidLength && passesLuhn,
    type,
    normalized: digits,
  };
}

export function validateExpiry(value: string): { isValid: boolean; month: number; year: number } {
  const raw = normalizeDigits(value);

  if (raw.length < 3) {
    return { isValid: false, month: 0, year: 0 };
  }

  const month = Number(raw.slice(0, 2));
  const year = Number(raw.slice(2, 4));

  if (Number.isNaN(month) || Number.isNaN(year) || month < 1 || month > 12) {
    return { isValid: false, month, year };
  }

  const now = new Date();
  const expiryDate = new Date(2000 + year, month, 0, 23, 59, 59);
  const isInFuture = expiryDate > now;

  return { isValid: isInFuture, month, year };
}

export function validateCvc(value: string, type: CardBrand): boolean {
  const digits = normalizeDigits(value);
  const expectedLength = type === 'amex' ? 4 : 3;
  return digits.length === expectedLength && /^[0-9]+$/.test(digits);
}

export function isValidCard(value: string): boolean {
  return validateCardNumber(value).isValid;
}

function luhnCheck(value: string): boolean {
  const digits = value.split('').reverse();
  let total = 0;

  for (let index = 0; index < digits.length; index += 1) {
    let current = Number(digits[index]);

    if (index % 2 === 1) {
      current *= 2;
      if (current > 9) {
        current -= 9;
      }
    }

    total += current;
  }

  return total % 10 === 0;
}
