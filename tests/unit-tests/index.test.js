const path = require('path');

// Mock dependencies
jest.mock('dotenv');
jest.mock('../../src/github-stats-core');
jest.mock('../../src/get-org-code-stats');

const dotenv = require('dotenv');
const core = require('../../src/github-stats-core');
const utils = require('../../src/get-org-code-stats');

describe('index.js', () => {
    let originalConsole;
    let originalProcessExit;
    let originalProcessArgv;
    let originalProcessEnv;

    beforeAll(() => {
        originalConsole = suppressConsole();

        // Mock process.exit
        originalProcessExit = process.exit;
        process.exit = jest.fn();

        // Store original values
        originalProcessArgv = process.argv;
        originalProcessEnv = { ...process.env };
    });

    afterAll(() => {
        restoreConsole(originalConsole);
        process.exit = originalProcessExit;
        process.argv = originalProcessArgv;
        process.env = originalProcessEnv;
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset process.argv and process.env
        process.argv = ['node', 'index.js'];
        process.env = { ...originalProcessEnv };

        // Setup default mocks
        dotenv.config = jest.fn();
        utils.parseArgs = jest.fn().mockReturnValue({});
        utils.DEFAULT_TARGET_TEAMS = ['Engineering'];
        core.collectStats = jest.fn().mockResolvedValue({});
    });

    afterAll(() => {
        restoreConsole(originalConsole);
        process.exit = originalProcessExit;
        process.argv = originalProcessArgv;
        process.env = originalProcessEnv;
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset process.argv and process.env
        process.argv = ['node', 'index.js'];
        process.env = { ...originalProcessEnv };

        // Setup default mocks
        dotenv.config = jest.fn();
        utils.parseArgs = jest.fn().mockReturnValue({});
        utils.DEFAULT_TARGET_TEAMS = ['Engineering'];
        core.collectStats = jest.fn().mockResolvedValue({});
    });

    afterAll(() => {
        process.exit = originalProcessExit;
        process.argv = originalProcessArgv;
        process.env = originalProcessEnv;
    });

    test('should load dotenv config with correct path', () => {
        // Clear the module cache and require index.js
        delete require.cache[require.resolve('../../src/index.js')];
        require('../../src/index.js');

        expect(dotenv.config).toHaveBeenCalledWith({
            path: expect.stringContaining(path.join('env', '.env'))
        });
    });

    // TODO: Fix process.exit mocking and module caching issues
    test.skip('should exit if GITHUB_TOKEN is not provided', () => {
        delete process.env.GITHUB_TOKEN;

        // Clear all related modules from cache
        delete require.cache[require.resolve('../../src/index.js')];
        delete require.cache[require.resolve('../../src/get-org-code-stats.js')];
        delete require.cache[require.resolve('../../src/github-stats-core.js')];

        // Mock process.exit before requiring the module
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { });

        try {
            require('../../src/index.js');
        } catch (error) {
            // Ignore any errors from the module execution
        }

        expect(mockExit).toHaveBeenCalledWith(1);
        mockExit.mockRestore();
    });

    // TODO: Fix async test timeout issues
    test.skip('should use environment variables for configuration', async () => {
        process.env.GITHUB_TOKEN = 'test-token';
        process.env.GITHUB_ORG = 'TestOrg';
        process.env.START_DATE = '2023-01-01';
        process.env.END_DATE = '2023-12-31';

        // Mock parseArgs to return empty object (no command line args)
        utils.parseArgs.mockReturnValue({});

        // Clear the module cache and require index.js
        delete require.cache[require.resolve('../../src/index.js')];

        // Wait for the async function to complete
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Test timeout'));
            }, 5000);

            // Mock collectStats to resolve and call our resolve
            core.collectStats.mockImplementation((...args) => {
                clearTimeout(timeoutId);
                // Verify the arguments passed to collectStats
                expect(args[0]).toBe('TestOrg'); // ORG
                expect(args[1]).toBe('2023-01-01'); // START_DATE
                expect(args[2]).toBe('2023-12-31'); // END_DATE
                expect(args[3]).toEqual(['Engineering']); // TARGET_TEAMS
                expect(args[4]).toBe('test-token'); // GITHUB_TOKEN
                resolve();
                return Promise.resolve({});
            });

            require('../../src/index.js');
        });
    });

    // TODO: Fix async test timeout issues  
    test.skip('should use command line arguments over environment variables', async () => {
        process.env.GITHUB_TOKEN = 'test-token';
        process.env.GITHUB_ORG = 'EnvOrg';

        // Mock parseArgs to return command line arguments
        utils.parseArgs.mockReturnValue({
            org: 'CLIOrg',
            startDate: '2023-06-01',
            endDate: '2023-06-30',
            teams: ['Team1', 'Team2']
        });

        // Clear the module cache and require index.js
        delete require.cache[require.resolve('../../src/index.js')];

        // Wait for the async function to complete
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Test timeout'));
            }, 5000);

            core.collectStats.mockImplementation((...args) => {
                clearTimeout(timeoutId);
                expect(args[0]).toBe('CLIOrg'); // Should use CLI org, not env org
                expect(args[1]).toBe('2023-06-01'); // Should use CLI start date
                expect(args[2]).toBe('2023-06-30'); // Should use CLI end date
                expect(args[3]).toEqual(['Team1', 'Team2']); // Should use CLI teams
                resolve();
                return Promise.resolve({});
            });

            require('../../src/index.js');
        });
    });

    // TODO: Fix process.exit mocking issues
    test.skip('should validate date format and exit on invalid start date', () => {
        process.env.GITHUB_TOKEN = 'test-token';

        utils.parseArgs.mockReturnValue({
            startDate: 'invalid-date'
        });

        // Clear all related modules from cache
        delete require.cache[require.resolve('../../src/index.js')];
        delete require.cache[require.resolve('../../src/get-org-code-stats.js')];
        delete require.cache[require.resolve('../../src/github-stats-core.js')];

        // Mock process.exit before requiring the module
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { });

        try {
            require('../../src/index.js');
        } catch (error) {
            // Ignore any errors from the module execution
        }

        expect(mockExit).toHaveBeenCalledWith(1);
        mockExit.mockRestore();
    });

    // TODO: Fix process.exit mocking issues
    test.skip('should validate date format and exit on invalid end date', () => {
        process.env.GITHUB_TOKEN = 'test-token';

        utils.parseArgs.mockReturnValue({
            endDate: 'invalid-date'
        });

        // Clear all related modules from cache
        delete require.cache[require.resolve('../../src/index.js')];
        delete require.cache[require.resolve('../../src/get-org-code-stats.js')];
        delete require.cache[require.resolve('../../src/github-stats-core.js')];

        // Mock process.exit before requiring the module
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { });

        try {
            require('../../src/index.js');
        } catch (error) {
            // Ignore any errors from the module execution
        }

        expect(mockExit).toHaveBeenCalledWith(1);
        mockExit.mockRestore();
    });

    // TODO: Fix async test timeout issues
    test.skip('should accept valid date formats', async () => {
        process.env.GITHUB_TOKEN = 'test-token';

        utils.parseArgs.mockReturnValue({
            startDate: '2023-01-01',
            endDate: '2023-12-31'
        });

        // Clear the module cache and require index.js
        delete require.cache[require.resolve('../../src/index.js')];

        // Wait for the async function to complete
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Test timeout'));
            }, 5000);

            core.collectStats.mockImplementation(() => {
                clearTimeout(timeoutId);
                resolve();
                return Promise.resolve({});
            });

            require('../../src/index.js');
        });

        // Should not exit if dates are valid
        expect(process.exit).not.toHaveBeenCalled();
    });

    test('should handle dotenv config errors gracefully', () => {
        dotenv.config.mockImplementation(() => {
            throw new Error('Config error');
        });

        process.env.GITHUB_TOKEN = 'test-token';

        // Should not throw an error
        expect(() => {
            delete require.cache[require.resolve('../../src/index.js')];
            require('../../src/index.js');
        }).not.toThrow();
    });

    // TODO: Fix async test timeout issues
    test.skip('should use default teams when no teams specified', async () => {
        process.env.GITHUB_TOKEN = 'test-token';

        utils.parseArgs.mockReturnValue({});
        utils.DEFAULT_TARGET_TEAMS = ['DefaultTeam1', 'DefaultTeam2'];

        // Clear the module cache and require index.js
        delete require.cache[require.resolve('../../src/index.js')];

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Test timeout'));
            }, 5000);

            core.collectStats.mockImplementation((...args) => {
                clearTimeout(timeoutId);
                expect(args[3]).toEqual(['DefaultTeam1', 'DefaultTeam2']);
                resolve();
                return Promise.resolve({});
            });

            require('../../src/index.js');
        });
    });
});
