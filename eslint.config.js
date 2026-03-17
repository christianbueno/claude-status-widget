const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node / Electron main process
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        // Browser / renderer globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        Date: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'out/'],
  },
];
