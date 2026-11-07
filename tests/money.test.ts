import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, centsToDecimal, MoneyError } from '../src/core/money';

test('toCents parses decimals without float error', () => {
  assert.equal(toCents('1,234.56'), 123456);
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents('5'), 500);
});
test('toCents rejects junk and sub-cent precision', () => {
  for (const bad of ['abc', '1.234', '1e3', '', '$5', '1..2']) assert.throws(() => toCents(bad), MoneyError);
  assert.throws(() => toCents(0.1 + 0.2), MoneyError);
});
test('centsToDecimal formats for PayPal', () => {
  assert.equal(centsToDecimal(5), '0.05');
  assert.equal(centsToDecimal(123456), '1234.56');
});
