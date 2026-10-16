import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectCardType,
  formatCardNumber,
  validateCardNumber,
  validateCvc,
  validateExpiry,
} from './cardValidation';

test('detects Visa cards from the card prefix', () => {
  assert.equal(detectCardType('4242 4242 4242 4242'), 'visa');
});

test('formats a card number with spaces and bounds the input length', () => {
  assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005');
});

test('validates card numbers using Luhn and card type rules', () => {
  const validVisa = validateCardNumber('4242 4242 4242 4242');
  const invalidCard = validateCardNumber('4111 1111 1111 1112');

  assert.equal(validVisa.isValid, true);
  assert.equal(validVisa.type, 'visa');
  assert.equal(invalidCard.isValid, false);
});

test('validates expiry dates in the future and CVC lengths by brand', () => {
  const validExpiry = validateExpiry('08/29');
  const cvcValid = validateCvc('123', 'visa');
  const amexCvc = validateCvc('1234', 'amex');

  assert.equal(validExpiry.isValid, true);
  assert.equal(cvcValid, true);
  assert.equal(amexCvc, true);
});
