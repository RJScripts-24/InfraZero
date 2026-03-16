// backend/.eslintrc.js

/**
 * ESLint Configuration for the Node.js / Express backend.
 * Uses the @typescript-eslint parser to enforce type safety and clean code standards.
 */
module.exports = {
  // Specify the parser for TypeScript files
  parser: '@typescript-eslint/parser',
  
  parserOptions: {
    ecmaVersion: 2022, // Modern Node.js features
    sourceType: 'module',
    // Optional: If you want rules that require strict type checking, point this to your tsconfig
    // project: './tsconfig.json', 
  },
  
  // Define the environments where the code will run
  env: {
    node: true,
    es2022: true,
    jest: true, // Included in case you add tests later
  },
  
  // Extend standard recommended rule sets
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  
  // Register the TypeScript plugin
  plugins: ['@typescript-eslint'],
  
  // Custom rule overrides specific to your backend setup
  rules: {
    // We built a custom logger.ts, but standard console logs are acceptable in Node
    'no-console': 'off', 
    
    // We used 'any' in our global errorHandler.ts middleware, so we drop this to a warning
    '@typescript-eslint/no-explicit-any': 'warn', 
    
    // Allow Express route handlers to infer return types instead of forcing them
    '@typescript-eslint/explicit-function-return-type': 'off', 
    
    // Ignore unused variables if they start with an underscore (e.g., `_req`, `_res`, `next`)
    // Very common in Express middleware signatures
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], 
  },
  
  // Prevent ESLint from checking compiled output and config files
  ignorePatterns: [
    'dist/', 
    'node_modules/', 
    '*.config.js', 
    '.eslintrc.js'
  ],
};