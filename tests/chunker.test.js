const { chunkTextToPassages } = require('../lib/chunker');

test('chunker splits paragraphs and limits to 300 words', () => {
  const shortPara = 'a b c';
  const longPara = new Array(305).fill('word').join(' ');
  const text = `${shortPara}\n\n${longPara}`;
  const passages = chunkTextToPassages(text, 300);
  expect(passages.length).toBeGreaterThanOrEqual(2);
  expect(passages[0]).toBe(shortPara);
  expect(passages[1].split(/\s+/).length).toBeLessThanOrEqual(300);
});
