'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../harness/loadApp.js');

test('NUM: Western digits, decimals, Arabic-Indic digits and separators', () => {
  const app = loadApp();
  assert.equal(app.NUM('123'), 123);
  assert.equal(app.NUM('123.5'), 123.5);
  assert.equal(app.NUM('١٢٣'), 123, 'Arabic-Indic digits');
  assert.equal(app.NUM('١٢٣٫٥'), 123.5, 'Arabic-Indic digits + Arabic decimal separator');
  assert.equal(app.NUM('1,234'), 1234, 'thousands comma stripped');
  assert.equal(app.NUM('1،234'), 1234, 'Arabic thousands separator stripped');
  assert.equal(app.NUM(' 12 '), 12, 'whitespace stripped');
  assert.equal(app.NUM(''), 0);
  assert.equal(app.NUM(null), 0);
  assert.equal(app.NUM(undefined), 0);
  assert.equal(app.NUM('abc'), 0, 'non-numeric falls back to 0');
});

test('nrm: normalizes Arabic-Indic digits and collapses whitespace', () => {
  const app = loadApp();
  assert.equal(app.nrm('١٢٣'), '123');
  assert.equal(app.nrm('a   b'), 'a b', 'runs of whitespace collapse to one space');
  assert.equal(app.nrm(''), '');
  assert.equal(app.nrm(null), '');
});
