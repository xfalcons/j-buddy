// Dedicated config for the Tier 2 real-LLM quality runner (U7).
// The default jest.config.js excludes promptQuality.test.ts via testPathIgnorePatterns;
// this config runs ONLY that file. Enable with PROMPT_QUALITY_TEST=1 (see package.json
// `test:prompt-quality`). Set PROMPT_PROVIDER / PROMPT_VERSION or pass --provider /
// --prompt-version after `--`.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/prompts/promptQuality.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
};
