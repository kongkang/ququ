import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const baseRules = {
  ...js.configs.recommended.rules,
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'python/**',
      'src/dist/**',
      'assets/**',
    ],
  },
  {
    files: [
      'main.js',
      'preload.js',
      'cleanup.js',
      'tailwind.config.js',
      'postcss.config.js',
      'scripts/**/*.js',
      'src/helpers/**/*.js',
      'test_*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...baseRules,
    },
  },
  {
    files: [
      'src/**/*.js',
      'src/**/*.jsx',
    ],
    ignores: [
      'src/helpers/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...baseRules,
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-vars': 'error',
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
