function chunkTextToPassages(text, maxWords = 300) {
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const passages = [];
  for (const para of paras) {
    const words = para.split(/\s+/);
    if (words.length <= maxWords) {
      passages.push(para);
    } else {
      for (let i = 0; i < words.length; i += maxWords) {
        passages.push(words.slice(i, i + maxWords).join(' '));
      }
    }
  }
  return passages;
}

module.exports = { chunkTextToPassages };
