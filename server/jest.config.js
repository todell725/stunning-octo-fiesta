/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+\\.js$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Allow Jest to transform ESM-only packages like uuid
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**', '!src/seed.ts'],
  testTimeout: 30000,
};
