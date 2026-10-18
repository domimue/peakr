import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.strict, {
  rules: {
    // The engine must stay pure TypeScript: no React / React Native imports.
    'no-restricted-imports': [
      'error',
      { patterns: ['react', 'react-native', 'react-native/*', 'expo', 'expo-*'] },
    ],
  },
});
