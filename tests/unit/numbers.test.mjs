import test from 'node:test';
import assert from 'node:assert/strict';
import { NUM, nrm } from '../../src/domain/numbers.js';

test('NUM: Western digits, decimals, Arabic-Indic digits and separators', () => {
  assert.equal(NUM('123'), 123);
  assert.equal(NUM('123.5'), 123.5);
  assert.equal(NUM('١٢٣'), 123, 'Arabic-Indic digits');
  assert.equal(NUM('١٢٣٫٥'), 123.5, 'Arabic-Indic digits + Arabic decimal separator');
  assert.equal(NUM('1,234'), 1234, 'thousands comma stripped');
  assert.equal(NUM('1،234'), 1234, 'Arabic thousands separator stripped');
  assert.equal(NUM(' 12 '), 12, 'whitespace stripped');
  assert.equal(NUM(''), 0);
  assert.equal(NUM(null), 0);
  assert.equal(NUM(undefined), 0);
  assert.equal(NUM('abc'), 0, 'non-numeric falls back to 0');
});

test('nrm: normalizes Arabic-Indic digits and collapses whitespace', () => {
  assert.equal(nrm('١٢٣'), '123');
  assert.equal(nrm('a   b'), 'a b', 'runs of whitespace collapse to one space');
  assert.equal(nrm(''), '');
  assert.equal(nrm(null), '');
});
