// Test setup file
const path = require('path');

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_ORG = 'test-org';
process.env.REPOS_CONFIG_PATH = 'config/repos.json';

// Global test utilities
global.suppressConsole = () => {
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();

    return originalConsole;
};

global.restoreConsole = (originalConsole) => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
};
