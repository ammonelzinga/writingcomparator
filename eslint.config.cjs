module.exports = [
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // keep default rules light for smoke checking; expand later
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
];
