const fs = require('fs');
const path = require('path');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

// Import the module to test
const utils = require('../src/get-org-code-stats');

// Mock axios
const mockAxios = new MockAdapter(axios);

describe('get-org-code-stats utilities', () => {
    // Mock console to avoid cluttering test output
    let originalConsole;

    beforeAll(() => {
        originalConsole = suppressConsole();
    });

    afterAll(() => {
        restoreConsole(originalConsole);
    });

    beforeEach(() => {
        mockAxios.reset();
        // Clear any cached modules
        jest.clearAllMocks();
    });

    afterEach(() => {
        mockAxios.reset();
    });

    describe('parseArgs', () => {
        let originalArgv;

        beforeEach(() => {
            originalArgv = process.argv;
        });

        afterEach(() => {
            process.argv = originalArgv;
        });

        test('should parse --from argument', () => {
            process.argv = ['node', 'script.js', '--from', '2023-01-01'];
            const result = utils.parseArgs();
            expect(result.startDate).toBe('2023-01-01');
        });

        test('should parse --to argument', () => {
            process.argv = ['node', 'script.js', '--to', '2023-12-31'];
            const result = utils.parseArgs();
            expect(result.endDate).toBe('2023-12-31');
        });

        test('should parse --org argument', () => {
            process.argv = ['node', 'script.js', '--org', 'MyOrg'];
            const result = utils.parseArgs();
            expect(result.org).toBe('MyOrg');
        });

        test('should parse --teams argument', () => {
            process.argv = ['node', 'script.js', '--teams', 'Team1,Team2,Team3'];
            const result = utils.parseArgs();
            expect(result.teams).toEqual(['Team1', 'Team2', 'Team3']);
        });

        test('should parse multiple arguments', () => {
            process.argv = ['node', 'script.js', '--from', '2023-01-01', '--to', '2023-12-31', '--org', 'TestOrg'];
            const result = utils.parseArgs();
            expect(result.startDate).toBe('2023-01-01');
            expect(result.endDate).toBe('2023-12-31');
            expect(result.org).toBe('TestOrg');
        });

        test('should handle no arguments', () => {
            process.argv = ['node', 'script.js'];
            const result = utils.parseArgs();
            expect(result).toEqual({});
        });
    });

    describe('validateDate', () => {
        test('should validate correct date format', () => {
            expect(utils.validateDate('2023-01-01')).toBe(true);
            expect(utils.validateDate('2023-12-31')).toBe(true);
        });

        test('should reject invalid date formats', () => {
            expect(utils.validateDate('2023-1-1')).toBe(false);
            expect(utils.validateDate('23-01-01')).toBe(false);
            expect(utils.validateDate('2023/01/01')).toBe(false);
            expect(utils.validateDate('invalid')).toBe(false);
            expect(utils.validateDate('')).toBeFalsy(); // Empty string returns falsy value
            expect(utils.validateDate(null)).toBeFalsy(); // null returns falsy value
            expect(utils.validateDate(undefined)).toBeFalsy(); // undefined returns falsy value
        });
    });

    describe('checkToken', () => {
        test('should return true for valid token', async () => {
            const headers = { Authorization: 'Bearer valid-token' };

            mockAxios.onGet('https://api.github.com/user').reply(200, {
                login: 'testuser',
            }, {
                'x-oauth-scopes': 'repo,read:org'
            });

            const result = await utils.checkToken(headers);
            expect(result).toBe(true);
        });

        test('should return false for invalid token', async () => {
            const headers = { Authorization: 'Bearer invalid-token' };

            mockAxios.onGet('https://api.github.com/user').reply(401, {
                message: 'Bad credentials'
            });

            const result = await utils.checkToken(headers);
            expect(result).toBe(false);
        });

        test('should handle network errors', async () => {
            const headers = { Authorization: 'Bearer test-token' };

            mockAxios.onGet('https://api.github.com/user').networkError();

            const result = await utils.checkToken(headers);
            expect(result).toBe(false);
        });
    });

    describe('getAllRepos', () => {
        const mockReposData = {
            repositories: [
                { repo: 'TestOrg/repo1', branch: 'main' },
                { repo: 'TestOrg/repo2', branch: 'develop' },
                { repo: 'OtherOrg/repo3', branch: 'master' }
            ]
        };

        beforeEach(() => {
            // Mock fs.readFileSync
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockReposData));
        });

        afterEach(() => {
            fs.readFileSync.mockRestore();
        });

        test('should return repositories for specified organization', async () => {
            const headers = { Authorization: 'Bearer test-token' };
            const result = await utils.getAllRepos('TestOrg', headers);

            expect(result).toEqual(['repo1', 'repo2']);
        });

        test('should return empty array for organization with no repos', async () => {
            const headers = { Authorization: 'Bearer test-token' };
            const result = await utils.getAllRepos('NonExistentOrg', headers);

            expect(result).toEqual([]);
        });

        test('should handle file not found error', async () => {
            fs.readFileSync.mockImplementation(() => {
                const error = new Error('File not found');
                error.code = 'ENOENT';
                throw error;
            });

            const headers = { Authorization: 'Bearer test-token' };
            const result = await utils.getAllRepos('TestOrg', headers);

            expect(result).toEqual([]);
        });

        test('should handle invalid JSON', async () => {
            fs.readFileSync.mockReturnValue('invalid json');

            const headers = { Authorization: 'Bearer test-token' };
            const result = await utils.getAllRepos('TestOrg', headers);

            expect(result).toEqual([]);
        });
    });

    describe('getCopilotMetrics', () => {
        test('should fetch copilot metrics successfully', async () => {
            const headers = { Authorization: 'Bearer test-token' };
            const mockMetrics = [
                {
                    date: '2023-01-01',
                    copilot_ide_code_completions: {
                        editors: [
                            {
                                name: 'vscode',
                                models: [
                                    {
                                        languages: [
                                            {
                                                name: 'javascript',
                                                total_code_lines_accepted: 100
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            ];

            mockAxios.onGet('https://api.github.com/orgs/TestOrg/copilot/metrics').reply(200, mockMetrics);

            const result = await utils.getCopilotMetrics('TestOrg', '2023-01-01', '2023-01-31', headers);

            expect(result.success).toBe(true);
            expect(result.totalCodeLinesAccepted).toBe(100);
        });

        test('should handle copilot metrics API errors', async () => {
            const headers = { Authorization: 'Bearer test-token' };

            mockAxios.onGet('https://api.github.com/orgs/TestOrg/copilot/metrics').reply(403, {
                message: 'Forbidden'
            });

            const result = await utils.getCopilotMetrics('TestOrg', null, null, headers);

            expect(result.success).toBe(false);
            expect(result.totalCodeLinesAccepted).toBe(0);
        });
    });

    describe('analyzeCommitForCopilot', () => {
        test('should detect copilot usage with valid metrics', () => {
            const commit = {
                stats: {
                    additions: 100,
                    deletions: 20
                }
            };

            const copilotMetrics = {
                success: true,
                totalCodeLinesAccepted: 500
            };

            const result = utils.analyzeCommitForCopilot(commit, copilotMetrics);

            expect(result.isCopilot).toBe(true);
            expect(result.confidence).toBe('high');
            expect(result.estimatedCopilotLines).toBeGreaterThan(0);
        });

        test('should not detect copilot without metrics', () => {
            const commit = {
                stats: {
                    additions: 100,
                    deletions: 20
                }
            };

            const result = utils.analyzeCommitForCopilot(commit, null);

            expect(result.isCopilot).toBe(false);
            expect(result.estimatedCopilotLines).toBe(0);
        });

        test('should handle commit without stats', () => {
            const commit = {};
            const copilotMetrics = { success: true, totalCodeLinesAccepted: 500 };

            const result = utils.analyzeCommitForCopilot(commit, copilotMetrics);

            expect(result.isCopilot).toBe(false);
            expect(result.estimatedCopilotLines).toBe(0);
        });
    });

    describe('getRepoBranch', () => {
        const mockReposData = {
            repositories: [
                { repo: 'TestOrg/repo1', branch: 'main' },
                { repo: 'TestOrg/repo2', branch: 'develop' }
            ]
        };

        beforeEach(() => {
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockReposData));
        });

        afterEach(() => {
            fs.readFileSync.mockRestore();
        });

        test('should return correct branch for existing repository', () => {
            const result = utils.getRepoBranch('TestOrg', 'repo1');
            expect(result).toBe('main');
        });

        test('should return main for non-existent repository', () => {
            const result = utils.getRepoBranch('TestOrg', 'non-existent');
            expect(result).toBe('main');
        });

        test('should return main when file cannot be read', () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            const result = utils.getRepoBranch('TestOrg', 'repo1');
            expect(result).toBe('main');
        });
    });
});
