const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

// Import the module to test
const core = require('../../src/github-stats-core');
const utils = require('../../src/get-org-code-stats');

// Mock axios
const mockAxios = new MockAdapter(axios);

// Mock the utils module
jest.mock('../../src/get-org-code-stats');

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
            utils.getRepoCommitsForTeam.mockResolvedValue([
                {
                    sha: 'abc123',
                    author: 'testuser',
                    date: '2023-06-01',
                    additions: 100,
                    deletions: 50,
                    message: 'Test commit',
                    repo: 'repo1'
                }
            ]);
            utils.isUserInTargetTeams.mockResolvedValue(true);
            utils.getCopilotMetrics.mockResolvedValue({});
            utils.analyzeCommitForCopilot.mockReturnValue({
                isCopilot: false,
                estimatedCopilotLines: 0,
                reason: 'No AI indicators found'
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
            expect(result.commits.total).toBe(2); // 2 repos * 1 commit each
            expect(result.commits.teamFiltered).toBe(2); // All commits are from team members
            expect(result.codeChanges.additions).toBe(200); // 2 repos * 100 additions each
            expect(result.codeChanges.deletions).toBe(100); // 2 repos * 50 deletions each
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
            utils.analyzeCommitForCopilot.mockReturnValue({
                isCopilot: true,
                estimatedCopilotLines: 25,
                reason: 'Based on GitHub Copilot metrics API'
            });

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result.codeChanges.aiLines).toBe(50); // 2 commits * 25 AI lines each
        });

        test('should filter commits by team members', async () => {
            // Mock multiple commits with different authors - clear previous mocks first
            utils.getRepoCommitsForTeam.mockReset();
            utils.isUserInTargetTeams.mockReset();

            // Mock commits for each repo
            utils.getRepoCommitsForTeam
                .mockResolvedValueOnce([
                    { sha: 'abc123', author: 'teamuser', date: '2023-06-01', additions: 100, deletions: 50, message: 'Test commit 1', repo: 'repo1' },
                    { sha: 'def456', author: 'nonteamuser', date: '2023-06-01', additions: 80, deletions: 20, message: 'Test commit 2', repo: 'repo1' }
                ])
                .mockResolvedValueOnce([
                    { sha: 'ghi789', author: 'teamuser', date: '2023-06-01', additions: 60, deletions: 30, message: 'Test commit 3', repo: 'repo2' },
                    { sha: 'jkl012', author: 'nonteamuser', date: '2023-06-01', additions: 40, deletions: 10, message: 'Test commit 4', repo: 'repo2' }
                ]);

            // Mock team membership check - alternating true/false for each user
            utils.isUserInTargetTeams
                .mockResolvedValueOnce(true)  // teamuser repo1 is in team
                .mockResolvedValueOnce(false) // nonteamuser repo1 is not in team
                .mockResolvedValueOnce(true)  // teamuser repo2 is in team
                .mockResolvedValueOnce(false); // nonteamuser repo2 is not in team

            const result = await core.collectStats(testOrg, testStartDate, testEndDate, testTargetTeams, testToken);

            expect(result.commits.total).toBe(4); // 2 repos * 2 commits each
            expect(result.commits.teamFiltered).toBe(2); // Only teamuser commits from both repos
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
            expect(utils.getRepoCommitsForTeam).toHaveBeenCalled();
            expect(utils.calculateTeamDailyStats).toHaveBeenCalled();
            expect(utils.displayTeamStatsTable).toHaveBeenCalled();
        });
    });
});
