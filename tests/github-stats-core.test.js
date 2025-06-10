const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

// Import the module to test
const core = require('../src/github-stats-core');
const utils = require('../src/get-org-code-stats');

// Mock axios
const mockAxios = new MockAdapter(axios);

// Mock the utils module
jest.mock('../src/get-org-code-stats');

describe('github-stats-core', () => {
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

    describe('collectStats', () => {
        const mockHeaders = { Authorization: 'Bearer test-token' };
        const testOrg = 'TestOrg';
        const testStartDate = '2023-01-01';
        const testEndDate = '2023-12-31';
        const testTargetTeams = ['Engineering'];
        const testToken = 'test-token';

        beforeEach(() => {
            // Setup default mocks
            utils.checkToken.mockResolvedValue(true);
            utils.getAllRepos.mockResolvedValue(['repo1', 'repo2']);
            utils.getOrgTeams.mockResolvedValue([
                { name: 'Engineering', slug: 'engineering' }
            ]);
            utils.getRepoMergedPRs.mockResolvedValue([
                {
                    number: 1,
                    user: { login: 'testuser' },
                    repo: 'repo1'
                }
            ]);
            utils.isUserInTargetTeams.mockResolvedValue(true);
            utils.getPRDetails.mockResolvedValue({
                number: 1,
                additions: 100,
                deletions: 50,
                title: 'Test PR',
                user: 'testuser'
            });
            utils.analyzeAICodeInPR.mockResolvedValue({
                isAIAssisted: false,
                aiLines: 0
            });
            utils.calculateTeamDailyStats.mockResolvedValue({
                Engineering: {
                    slug: 'engineering',
                    members: 5,
                    dailyStats: {},
                    totalCodeLines: 1000,
                    totalCopilotLines: 100
                }
            });
            utils.displayTeamStatsTable.mockImplementation(() => { });

            // Mock axios for organization verification
            mockAxios.onGet(`https://api.github.com/orgs/${testOrg}`).reply(200, {
                login: testOrg,
                name: 'Test Organization'
            });
        });

        test('should collect stats successfully', async () => {
            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeDefined();
            expect(result.repositories).toBe(2);
            expect(result.prs.total).toBe(2); // 2 repos * 1 PR each
            expect(result.prs.teamFiltered).toBe(2); // All PRs are from team members
            expect(result.codeChanges.additions).toBe(200); // 2 PRs * 100 additions each
            expect(result.codeChanges.deletions).toBe(100); // 2 PRs * 50 deletions each
            expect(result.codeChanges.total).toBe(300); // 200 + 100
        });

        test('should return null if token validation fails', async () => {
            utils.checkToken.mockResolvedValue(false);

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeNull();
        });

        test('should return null if organization access fails', async () => {
            mockAxios.onGet(`https://api.github.com/orgs/${testOrg}`).reply(404, {
                message: 'Not Found'
            });

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeNull();
        });

        test('should return null if no repositories found', async () => {
            utils.getAllRepos.mockResolvedValue([]);

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeNull();
        });

        test('should return null if no teams found', async () => {
            utils.getOrgTeams.mockResolvedValue([]);

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeNull();
        });

        test('should handle AI-assisted code detection', async () => {
            utils.analyzeAICodeInPR.mockResolvedValue({
                isAIAssisted: true,
                aiLines: 25,
                reason: 'Based on GitHub Copilot metrics API'
            });

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result.codeChanges.aiLines).toBe(50); // 2 PRs * 25 AI lines each
        });

        test('should filter PRs by team members', async () => {
            // Mock multiple PRs with different authors - clear previous mocks first
            utils.getRepoMergedPRs.mockReset();
            utils.isUserInTargetTeams.mockReset();

            // Mock PRs for each repo
            utils.getRepoMergedPRs
                .mockResolvedValueOnce([
                    { number: 1, user: { login: 'teamuser' }, repo: 'repo1' },
                    { number: 2, user: { login: 'nonteamuser' }, repo: 'repo1' }
                ])
                .mockResolvedValueOnce([
                    { number: 3, user: { login: 'teamuser' }, repo: 'repo2' },
                    { number: 4, user: { login: 'nonteamuser' }, repo: 'repo2' }
                ]);

            // Mock team membership check - alternating true/false for each user
            utils.isUserInTargetTeams
                .mockResolvedValueOnce(true)  // teamuser repo1 is in team
                .mockResolvedValueOnce(false) // nonteamuser repo1 is not in team
                .mockResolvedValueOnce(true)  // teamuser repo2 is in team
                .mockResolvedValueOnce(false); // nonteamuser repo2 is not in team

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result.prs.total).toBe(4); // 2 repos * 2 PRs each
            expect(result.prs.teamFiltered).toBe(2); // Only teamuser PRs from both repos
        });

        test('should handle network errors gracefully', async () => {
            mockAxios.onGet(`https://api.github.com/orgs/${testOrg}`).networkError();

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result).toBeNull();
        });

        test('should call all required utility functions', async () => {
            await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(utils.checkToken).toHaveBeenCalled();
            expect(utils.getAllRepos).toHaveBeenCalledWith(testOrg, expect.any(Object));
            expect(utils.getOrgTeams).toHaveBeenCalledWith(testOrg, testTargetTeams, expect.any(Object));
            expect(utils.getRepoMergedPRs).toHaveBeenCalled();
            expect(utils.calculateTeamDailyStats).toHaveBeenCalled();
            expect(utils.displayTeamStatsTable).toHaveBeenCalled();
        });
    });
});
