const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

// Import the module to test
const utils = require('../../src/get-org-code-stats');

// Mock axios
const mockAxios = new MockAdapter(axios);

describe('get-org-code-stats edge cases', () => {
    let originalConsole;

    beforeAll(() => {
        originalConsole = suppressConsole();
    });

    afterAll(() => {
        restoreConsole(originalConsole);
    });

    beforeEach(() => {
        mockAxios.reset();
        jest.clearAllMocks();
    });

    afterEach(() => {
        mockAxios.reset();
    });

    describe('loadDefaultTargetTeams', () => {
        test('should load teams from config file', () => {
            // This tests the actual teams configuration we set up
            expect(utils.DEFAULT_TARGET_TEAMS).toContain('core-engineering');
            expect(utils.DEFAULT_TARGET_TEAMS).toContain('data science');
            expect(utils.DEFAULT_TARGET_TEAMS).toContain('qa-automation-team');
        });
    });

    describe('parseArgs edge cases', () => {
        let originalArgv;

        beforeEach(() => {
            originalArgv = process.argv;
        });

        afterEach(() => {
            process.argv = originalArgv;
        });

        test('should handle missing argument values', () => {
            process.argv = ['node', 'script.js', '--from'];
            const result = utils.parseArgs();
            expect(result.startDate).toBeUndefined();
        });

        test('should handle teams with whitespace', () => {
            process.argv = ['node', 'script.js', '--teams', ' Team1 , Team2 , Team3 '];
            const result = utils.parseArgs();
            expect(result.teams).toEqual(['Team1', 'Team2', 'Team3']);
        });
    });

    describe('getCopilotMetrics edge cases', () => {
        test('should handle empty copilot response', async () => {
            const headers = { Authorization: 'Bearer test-token' };

            mockAxios.onGet('https://api.github.com/orgs/TestOrg/copilot/metrics').reply(200, []);

            const result = await utils.getCopilotMetrics('TestOrg', null, null, headers);

            expect(result.success).toBe(true);
            expect(result.totalCodeLinesAccepted).toBe(0);
            expect(result.dailyData).toEqual([]);
        });

        test('should handle 422 error (API disabled)', async () => {
            const headers = { Authorization: 'Bearer test-token' };

            mockAxios.onGet('https://api.github.com/orgs/TestOrg/copilot/metrics').reply(422, {
                message: 'Copilot metrics disabled'
            });

            const result = await utils.getCopilotMetrics('TestOrg', null, null, headers);

            expect(result.success).toBe(false);
            expect(result.totalCodeLinesAccepted).toBe(0);
        });
    });

    describe('analyzeCommitForCopilot edge cases', () => {
        test('should handle commit with zero additions', () => {
            const commit = {
                stats: {
                    additions: 0,
                    deletions: 20
                }
            };

            const copilotMetrics = {
                success: true,
                totalCodeLinesAccepted: 500
            };

            const result = utils.analyzeCommitForCopilot(commit, copilotMetrics);

            expect(result.isCopilot).toBe(false);
            expect(result.estimatedCopilotLines).toBe(0);
        });

        test('should handle copilot metrics with zero lines', () => {
            const commit = {
                stats: {
                    additions: 100,
                    deletions: 20
                }
            };

            const copilotMetrics = {
                success: true,
                totalCodeLinesAccepted: 0
            };

            const result = utils.analyzeCommitForCopilot(commit, copilotMetrics);

            expect(result.isCopilot).toBe(false);
            expect(result.estimatedCopilotLines).toBe(0);
        });
    });
});
