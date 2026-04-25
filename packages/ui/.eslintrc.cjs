module.exports = {
  ...require('@repo/config/eslint'),
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: '19' } },
  rules: {
    ...require('@repo/config/eslint').rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
};
