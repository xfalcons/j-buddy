# Testing Guide

This document describes the testing setup and approach for Firebase Functions.

## Test Overview

The project includes unit tests for:
- Configuration (`config.test.ts`)
- Services (`geminiService.test.ts`, `firestoreService.test.ts`)

## Running Tests

### Install Test Dependencies

```bash
cd functions
npm install --save-dev jest ts-jest @types/jest @jest/globals
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test -- test/config.test.ts
npm test -- test/services/geminiService.test.ts
npm test -- test/services/firestoreService.test.ts
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Generate Coverage Report

```bash
npm test -- --coverage
```

## Test Structure

```
test/
├── config.test.ts                 # Configuration tests
└── services/
    ├── geminiService.test.ts      # Gemini API service tests
    └── firestoreService.test.ts     # Firestore service tests
```

## Testing Approach

### Unit Tests

Unit tests focus on isolated components with mocked dependencies:

- **Config Tests**: Verify secret configuration loading
- **GeminiService Tests**: Test API calls with mocked fetch
- **FirestoreService Tests**: Test database operations with mocked Firestore

### Integration Tests

Integration tests test functions end-to-end with Firebase Emulators:

```bash
# Start Firebase Emulators
cd japanese-alchemy-hosting
firebase emulators:start

# Run tests with emulator
cd functions
npm run test:integration
```

## Writing Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach } from "@jest/globals";

describe("ComponentName", () => {
  beforeEach(() => {
    // Setup before each test
  });

  it("should do something", () => {
    // Test implementation
    expect(result).toBe(expected);
  });

  it("should handle edge case", async () => {
    // Test edge cases
    expect(result).toBeDefined();
  });
});
```

### Mocking Firebase

```typescript
// Mock firebase-admin
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      add: jest.fn(),
      doc: jest.fn(),
    })),
  })),
}));
```

### Mocking Fetch

```typescript
// Mock fetch for API calls
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Configure mock response
mockFetch.mockResolvedValue({
  ok: true,
  json: async () => ({ /* response data */ }),
});
```

### Mocking Configuration

```typescript
// Mock configuration
jest.mock("../../src/config", () => ({
  getConfig: jest.fn(() => ({
    google: { api_url: "test-url" },
    gemini: { api_key: "test-key", model: "test-model" },
  })),
}));
```

## Test Coverage

### Goals

- **Line Coverage**: > 80%
- **Branch Coverage**: > 75%
- **Function Coverage**: > 90%

### View Coverage

```bash
npm test -- --coverage

# Coverage reports are generated in:
# - coverage/ directory
# - coverage/lcov-report/index.html (HTML report)
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'
      - name: Install dependencies
        run: |
          cd functions
          npm ci
      - name: Run tests
        run: |
          cd functions
          npm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Troubleshooting

### Jest TypeScript Errors

If you encounter TypeScript errors in tests:

1. Ensure `ts-jest` is installed:
   ```bash
   npm install --save-dev ts-jest @types/jest
   ```

2. Check `jest.config.js` configuration

3. Verify `tsconfig.json` includes test directory

### Mock Issues

If mocks don't work:

1. Clear mocks before each test:
   ```typescript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

2. Mock before importing module:
   ```typescript
   jest.mock("module-name", () => ({
     // mock implementation
   }));
   import { Something } from "module-name";
   ```

### Firebase Emulator Issues

If Firebase Emulators don't work:

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Initialize emulators:
   ```bash
   cd japanese-alchemy-hosting
   firebase emulators:start
   ```

3. Check port availability:
   - Functions: 5001
   - Firestore: 8080
   - Auth: 9099

## Best Practices

1. **Arrange, Act, Assert**: Organize tests clearly
2. **Descriptive Names**: Use "should" pattern in test names
3. **Test Edge Cases**: Empty inputs, null values, special characters
4. **Mock External Dependencies**: Don't call real APIs in tests
5. **Keep Tests Isolated**: Tests should not depend on each other
6. **Use BeforeEach**: Reset state between tests
7. **Test Errors**: Verify error handling behavior

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Firebase Functions Testing](https://firebase.google.com/docs/functions/test)
- [TypeScript Jest](https://kulshekhar.github.io/ts-jest/)
