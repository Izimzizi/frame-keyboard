import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSentenceTracker } from '../src/sentence-tracker.js';

test('sentence starts: after . ! ? and a space, or a new line; unknown text is not a start', () => {
  const t = createSentenceTracker();
  assert.equal(t.sentenceStart, false);
  t.observe([{ text: 'Hi.' }]);
  assert.equal(t.sentenceStart, false);
  t.observe([{ text: ' ' }]);
  assert.equal(t.sentenceStart, true);
  t.observe([{ text: 'w' }]);
  assert.equal(t.sentenceStart, false);
  t.observe([{ key: 'Enter' }]);
  assert.equal(t.sentenceStart, true);
  t.observe([{ key: 'ArrowLeft' }]);
  assert.equal(t.sentenceStart, false);
  t.observe([{ text: 'Ok! ' }]);
  assert.equal(t.sentenceStart, true);
  t.reset();
  assert.equal(t.sentenceStart, false);
});

test('backspace removes the last known character', () => {
  const t = createSentenceTracker();
  t.observe([{ text: 'a. b' }, { key: 'Backspace' }]);
  assert.equal(t.sentenceStart, true);
});
