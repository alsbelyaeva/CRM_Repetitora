/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts?$': ['ts-jest', {
      tsconfig: {
        types: ['node', 'jest'],
        esModuleInterop: true,
      },
    }],
  },
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^bcrypt$': '<rootDir>/tests/mocks/bcrypt.ts',
  },
  maxWorkers: 1,
  testTimeout: 30000,
  forceExit: true,
  verbose: true
};
