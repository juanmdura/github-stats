# Test Organization

This directory contains the test suite for the GitHub Organization Code Statistics tool, organized into logical folders for better maintainability.

## Folder Structure

```
tests/
├── fixtures/           # Test data and mock files
│   ├── repos.json      # Mock repository configuration
│   └── teams.json      # Mock teams configuration
├── integration-tests/  # End-to-end workflow tests
│   └── integration.test.js
├── unit-tests/         # Individual module/function tests
│   ├── edge-cases.test.js
│   ├── get-org-code-stats.test.js
│   ├── github-stats-core.test.js
│   └── index.test.js
├── setup.js           # Test setup and utilities
└── README.md          # This file
```

## Test Categories

### Unit Tests (`unit-tests/`)
Tests that focus on individual modules, functions, and components in isolation:

- **`get-org-code-stats.test.js`** - Tests utility functions like `parseArgs`, `validateDate`, `checkToken`, etc.
- **`github-stats-core.test.js`** - Tests the core statistics collection logic
- **`index.test.js`** - Tests the main entry point and CLI argument handling
- **`edge-cases.test.js`** - Tests edge cases and error scenarios

### Integration Tests (`integration-tests/`)
Tests that verify complete workflows and component interactions:

- **`integration.test.js`** - End-to-end stats collection workflows, configuration loading, error handling

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Status

- **Total Test Suites**: 5
- **Total Tests**: 53
- **Passing Tests**: 45
- **Skipped Tests**: 8 (commented out due to pending fixes)
- **Test Coverage**: ~62%

## Skipped Tests (TODOs)

Several tests are currently skipped with TODO comments for future fixes:

1. **Integration test**: Complete workflow test needs team configuration alignment
2. **Index tests**: Process.exit mocking and module caching issues
3. **Async timeout issues**: Some async tests need better timeout handling

## Test Utilities

The `setup.js` file provides common utilities:
- Console output suppression for cleaner test output
- Mock data loading helpers
- Test environment configuration

## Adding New Tests

When adding new tests:

1. **Unit tests**: Place in `unit-tests/` folder for testing individual functions/modules
2. **Integration tests**: Place in `integration-tests/` for end-to-end workflows
3. **Test data**: Add mock data to `fixtures/` folder
4. **Follow naming**: Use `.test.js` suffix for test files
5. **Import paths**: Use relative paths from the test subfolder (e.g., `require('../../src/module')`)
