/** @type {import("jest").Config} */
const base = {
  testEnvironment: "node",
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          esModuleInterop: true,
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "react-jsx",
        },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/dist/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/qa-log.ts"],
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "mcp/**/*.{ts,tsx}",
    "app/api/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "!**/*.d.ts",
  ],
  coverageDirectory: "<rootDir>/data/qa/coverage",
};

module.exports = {
  rootDir: ".",
  reporters: ["default", "<rootDir>/tests/reporters/vantage-qa-reporter.cjs"],
  projects: [
    { ...base, displayName: "unit", testMatch: ["**/tests/unit/**/*.test.ts"] },
    { ...base, displayName: "integration", testMatch: ["**/tests/integration/**/*.test.ts"] },
    { ...base, displayName: "e2e", testMatch: ["**/tests/e2e/**/*.test.ts"] },
  ],
};

