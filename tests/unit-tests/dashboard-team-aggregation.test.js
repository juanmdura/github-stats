/**
 * Unit tests for dashboard team data aggregation
 * Validates that team data correctly aggregates contributor data without double-counting
 */

describe('Dashboard Team Data Aggregation', () => {
    let mockData;
    let mockDataWithDifferentAI;

    beforeEach(() => {
        // Mock data that simulates the double-counting bug
        // carloslizama17 appears in both Fulfillment and qa-automation-team
        mockData = [
            {
                Date: '2025-05-19',
                Team: 'Fulfillment',
                TeamSlug: 'fulfillment',
                TeamMembers: 5,
                Repository: 'order-handler',
                Contributor: 'carloslizama17',
                CommitSHA: '1ac08ebec9d7dd2f0bb85da46294b08cf8280818',
                CodeLines: 6,
                AILines: 0,
                AIPercentage: 0.0,
                Additions: 4,
                Deletions: 2,
                TotalChanges: 6
            },
            {
                Date: '2025-05-19',
                Team: 'qa-automation-team',
                TeamSlug: 'qa-automation-team',
                TeamMembers: 8,
                Repository: 'order-handler',
                Contributor: 'carloslizama17',
                CommitSHA: '1ac08ebec9d7dd2f0bb85da46294b08cf8280818', // Same commit!
                CodeLines: 6,
                AILines: 0,
                AIPercentage: 0.0,
                Additions: 4,
                Deletions: 2,
                TotalChanges: 6
            },
            {
                Date: '2025-05-19',
                Team: 'Fulfillment',
                TeamSlug: 'fulfillment',
                TeamMembers: 5,
                Repository: 'order-handler',
                Contributor: 'emestanza',
                CommitSHA: 'abc123def456',
                CodeLines: 100,
                AILines: 20,
                AIPercentage: 20.0,
                Additions: 80,
                Deletions: 20,
                TotalChanges: 100
            },
            {
                Date: '2025-05-19',
                Team: 'qa-automation-team',
                TeamSlug: 'qa-automation-team',
                TeamMembers: 8,
                Repository: 'api-automation',
                Contributor: 'shari-zb',
                CommitSHA: 'def456ghi789',
                CodeLines: 50,
                AILines: 10,
                AIPercentage: 20.0,
                Additions: 30,
                Deletions: 20,
                TotalChanges: 50
            }
        ];

        // Mock data that simulates the real-world scenario where same commit has different AI values across teams
        mockDataWithDifferentAI = [
            {
                Date: '2025-05-19',
                Team: 'Fulfillment',
                TeamSlug: 'fulfillment',
                TeamMembers: 5,
                Repository: 'order-handler',
                Contributor: 'carloslizama17',
                CommitSHA: '00ba127948c2d9678e0efb62c27fc49ab8733702',
                CodeLines: 231,
                AILines: 0, // No AI assistance recorded for Fulfillment team
                AIPercentage: 0.0,
                Additions: 225,
                Deletions: 6,
                TotalChanges: 231
            },
            {
                Date: '2025-05-19',
                Team: 'qa-automation-team',
                TeamSlug: 'qa-automation-team',
                TeamMembers: 8,
                Repository: 'order-handler',
                Contributor: 'carloslizama17',
                CommitSHA: '00ba127948c2d9678e0efb62c27fc49ab8733702', // Same commit!
                CodeLines: 231,
                AILines: 15, // AI assistance recorded for qa-automation-team
                AIPercentage: 6.5,
                Additions: 225,
                Deletions: 6,
                TotalChanges: 231
            },
            {
                Date: '2025-05-19',
                Team: 'Fulfillment',
                TeamSlug: 'fulfillment',
                TeamMembers: 5,
                Repository: 'order-handler',
                Contributor: 'emestanza',
                CommitSHA: 'abc123def456',
                CodeLines: 100,
                AILines: 20,
                AIPercentage: 20.0,
                Additions: 80,
                Deletions: 20,
                TotalChanges: 100
            }
        ];
    });

    describe('Team Data Aggregation Functions', () => {

        function aggregateTeamDataCorrectly(data) {
            // Correct aggregation: Should not double-count commits from the same contributor
            // that appear in multiple teams
            const uniqueCommits = new Set();
            const teamStats = {};

            data.forEach(row => {
                const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;

                if (!uniqueCommits.has(commitKey)) {
                    uniqueCommits.add(commitKey);

                    if (!teamStats[row.Team]) {
                        teamStats[row.Team] = {
                            totalCodeLines: 0,
                            totalAILines: 0,
                            commits: 0,
                            contributors: new Set()
                        };
                    }

                    teamStats[row.Team].totalCodeLines += parseInt(row.CodeLines) || 0;
                    teamStats[row.Team].totalAILines += parseInt(row.AILines) || 0;
                    teamStats[row.Team].commits += 1;
                    teamStats[row.Team].contributors.add(row.Contributor);
                }
            });

            // Convert Set to size for easier testing
            Object.keys(teamStats).forEach(team => {
                teamStats[team].contributors = teamStats[team].contributors.size;
            });

            return teamStats;
        }

        function aggregateTeamDataIncorrectly(data) {
            // Incorrect aggregation: Double-counts commits from contributors in multiple teams
            const teamStats = {};

            data.forEach(row => {
                if (!teamStats[row.Team]) {
                    teamStats[row.Team] = {
                        totalCodeLines: 0,
                        totalAILines: 0,
                        commits: 0,
                        contributors: new Set()
                    };
                }

                teamStats[row.Team].totalCodeLines += parseInt(row.CodeLines) || 0;
                teamStats[row.Team].totalAILines += parseInt(row.AILines) || 0;
                teamStats[row.Team].commits += 1;
                teamStats[row.Team].contributors.add(row.Contributor);
            });

            // Convert Set to size for easier testing
            Object.keys(teamStats).forEach(team => {
                teamStats[team].contributors = teamStats[team].contributors.size;
            });

            return teamStats;
        }

        test('should correctly aggregate team data without double-counting', () => {
            const correctStats = aggregateTeamDataCorrectly(mockData);

            // Fulfillment team should have:
            // - carloslizama17's commit: 6 code lines (counted once)
            // - emestanza's commit: 100 code lines
            // Total: 106 code lines, 20 AI lines, 2 commits, 2 contributors
            expect(correctStats.Fulfillment.totalCodeLines).toBe(106);
            expect(correctStats.Fulfillment.totalAILines).toBe(20);
            expect(correctStats.Fulfillment.commits).toBe(2);
            expect(correctStats.Fulfillment.contributors).toBe(2);

            // qa-automation-team should have:
            // - shari-zb's commit: 50 code lines (carloslizama17's commit not double-counted)
            // Total: 50 code lines, 10 AI lines, 1 commit, 1 contributor
            expect(correctStats['qa-automation-team'].totalCodeLines).toBe(50);
            expect(correctStats['qa-automation-team'].totalAILines).toBe(10);
            expect(correctStats['qa-automation-team'].commits).toBe(1);
            expect(correctStats['qa-automation-team'].contributors).toBe(1);
        });

        test('should demonstrate the double-counting bug in incorrect aggregation', () => {
            const incorrectStats = aggregateTeamDataIncorrectly(mockData);

            // With incorrect aggregation, Fulfillment team would have:
            // - carloslizama17's commit: 6 code lines
            // - emestanza's commit: 100 code lines
            // Total: 106 code lines, 20 AI lines, 2 commits, 2 contributors
            expect(incorrectStats.Fulfillment.totalCodeLines).toBe(106);
            expect(incorrectStats.Fulfillment.totalAILines).toBe(20);
            expect(incorrectStats.Fulfillment.commits).toBe(2);
            expect(incorrectStats.Fulfillment.contributors).toBe(2);

            // qa-automation-team with incorrect aggregation would have:
            // - carloslizama17's commit: 6 code lines (DOUBLE-COUNTED!)
            // - shari-zb's commit: 50 code lines
            // Total: 56 code lines, 10 AI lines, 2 commits, 2 contributors
            expect(incorrectStats['qa-automation-team'].totalCodeLines).toBe(56); // Bug: should be 50
            expect(incorrectStats['qa-automation-team'].totalAILines).toBe(10);
            expect(incorrectStats['qa-automation-team'].commits).toBe(2); // Bug: should be 1
            expect(incorrectStats['qa-automation-team'].contributors).toBe(2);
        });

        test('should identify contributors who belong to multiple teams', () => {
            const multiTeamContributors = {};

            mockData.forEach(row => {
                if (!multiTeamContributors[row.Contributor]) {
                    multiTeamContributors[row.Contributor] = new Set();
                }
                multiTeamContributors[row.Contributor].add(row.Team);
            });

            // Filter contributors who appear in multiple teams
            const contributorsInMultipleTeams = Object.entries(multiTeamContributors)
                .filter(([contributor, teams]) => teams.size > 1)
                .map(([contributor, teams]) => ({
                    contributor,
                    teams: Array.from(teams)
                }));

            expect(contributorsInMultipleTeams).toHaveLength(1);
            expect(contributorsInMultipleTeams[0].contributor).toBe('carloslizama17');
            expect(contributorsInMultipleTeams[0].teams).toEqual(['Fulfillment', 'qa-automation-team']);
        });

        test('should calculate correct AI percentages per team', () => {
            const correctStats = aggregateTeamDataCorrectly(mockData);

            // Fulfillment: 20 AI lines out of 106 total = 18.87%
            const fulfillmentAIPercentage = correctStats.Fulfillment.totalCodeLines > 0
                ? (correctStats.Fulfillment.totalAILines / correctStats.Fulfillment.totalCodeLines * 100)
                : 0;
            expect(fulfillmentAIPercentage).toBeCloseTo(18.87, 2);

            // qa-automation-team: 10 AI lines out of 50 total = 20.00%
            const qaTeamAIPercentage = correctStats['qa-automation-team'].totalCodeLines > 0
                ? (correctStats['qa-automation-team'].totalAILines / correctStats['qa-automation-team'].totalCodeLines * 100)
                : 0;
            expect(qaTeamAIPercentage).toBeCloseTo(20.00, 2);
        });

        test('should handle commits with different AI values across teams by taking maximum AI assistance', () => {
            function aggregateTeamDataWithMaxAI(data) {
                const uniqueCommits = new Map();
                const teamStats = {};

                // First pass: collect unique commits with maximum AI assistance
                data.forEach(row => {
                    const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
                    const codeLines = parseInt(row.CodeLines) || 0;
                    const aiLines = parseInt(row.AILines) || 0;

                    // If commit already exists, keep the one with higher AI assistance
                    if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
                        uniqueCommits.set(commitKey, {
                            codeLines: codeLines,
                            aiLines: aiLines,
                            team: row.Team,
                            contributor: row.Contributor
                        });
                    }
                });

                // Second pass: aggregate by team using unique commits
                uniqueCommits.forEach(commit => {
                    if (!teamStats[commit.team]) {
                        teamStats[commit.team] = {
                            totalCodeLines: 0,
                            totalAILines: 0,
                            commits: 0,
                            contributors: new Set()
                        };
                    }

                    teamStats[commit.team].totalCodeLines += commit.codeLines;
                    teamStats[commit.team].totalAILines += commit.aiLines;
                    teamStats[commit.team].commits += 1;
                    teamStats[commit.team].contributors.add(commit.contributor);
                });

                // Convert Set to size for easier testing
                Object.keys(teamStats).forEach(team => {
                    teamStats[team].contributors = teamStats[team].contributors.size;
                });

                return teamStats;
            }

            const correctedStats = aggregateTeamDataWithMaxAI(mockDataWithDifferentAI);

            // The commit should be attributed to qa-automation-team since it has higher AI assistance (15 vs 0)
            expect(correctedStats['qa-automation-team'].totalCodeLines).toBe(231);
            expect(correctedStats['qa-automation-team'].totalAILines).toBe(15);
            expect(correctedStats['qa-automation-team'].commits).toBe(1);
            expect(correctedStats['qa-automation-team'].contributors).toBe(1);

            // Fulfillment team should only have emestanza's commit
            expect(correctedStats.Fulfillment.totalCodeLines).toBe(100);
            expect(correctedStats.Fulfillment.totalAILines).toBe(20);
            expect(correctedStats.Fulfillment.commits).toBe(1);
            expect(correctedStats.Fulfillment.contributors).toBe(1);

            // Verify AI percentages
            const qaTeamAIPercentage = correctedStats['qa-automation-team'].totalCodeLines > 0
                ? (correctedStats['qa-automation-team'].totalAILines / correctedStats['qa-automation-team'].totalCodeLines * 100)
                : 0;
            expect(qaTeamAIPercentage).toBeCloseTo(6.5, 1); // 15/231 * 100 ≈ 6.5%

            const fulfillmentAIPercentage = correctedStats.Fulfillment.totalCodeLines > 0
                ? (correctedStats.Fulfillment.totalAILines / correctedStats.Fulfillment.totalCodeLines * 100)
                : 0;
            expect(fulfillmentAIPercentage).toBeCloseTo(20.0, 1); // 20/100 * 100 = 20%
        });

        test('should validate total lines consistency with max AI logic', () => {
            const correctStats = aggregateTeamDataCorrectly(mockData);

            // Total unique code lines should be 156 (106 + 50)
            const totalCodeLines = Object.values(correctStats)
                .reduce((sum, team) => sum + team.totalCodeLines, 0);
            expect(totalCodeLines).toBe(156);

            // Total unique AI lines should be 30 (20 + 10)
            const totalAILines = Object.values(correctStats)
                .reduce((sum, team) => sum + team.totalAILines, 0);
            expect(totalAILines).toBe(30);
        });
    });

    describe('Real Data Validation', () => {
        test('should identify the carloslizama17 double-counting issue in real data', async () => {
            // This test would use real CSV data to validate the bug exists
            const fs = require('fs');
            const path = require('path');

            const csvPath = path.join(__dirname, '../../output/consolidated_daily_batches.csv');

            // Skip if CSV doesn't exist
            if (!fs.existsSync(csvPath)) {
                console.log('Skipping real data test - CSV file not found');
                return;
            }

            const csvContent = fs.readFileSync(csvPath, 'utf8');
            const lines = csvContent.trim().split('\n');
            const headers = lines[0].split(',');

            const data = lines.slice(1).map(line => {
                const values = line.split(',');
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] ? values[index].replace(/"/g, '') : '';
                });
                return row;
            });

            // Find carloslizama17's commits
            const carlosCommits = data.filter(row => row.Contributor === 'carloslizama17');

            if (carlosCommits.length > 0) {
                // Group by commit SHA to find duplicates
                const commitGroups = {};
                carlosCommits.forEach(commit => {
                    const key = commit.CommitSHA;
                    if (!commitGroups[key]) {
                        commitGroups[key] = [];
                    }
                    commitGroups[key].push(commit);
                });

                // Find commits that appear in multiple teams
                const duplicateCommits = Object.entries(commitGroups)
                    .filter(([sha, commits]) => commits.length > 1)
                    .map(([sha, commits]) => ({
                        sha,
                        teams: commits.map(c => c.Team),
                        commits: commits.length
                    }));

                if (duplicateCommits.length > 0) {
                    console.log('Found duplicate commits for carloslizama17:');
                    duplicateCommits.forEach(duplicate => {
                        console.log(`  - Commit ${duplicate.sha.substring(0, 8)} appears in teams: ${duplicate.teams.join(', ')}`);
                    });

                    // Verify that carloslizama17 appears in both Fulfillment and qa-automation-team
                    const carlosTeams = new Set(carlosCommits.map(c => c.Team));
                    expect(carlosTeams.has('Fulfillment')).toBe(true);
                    expect(carlosTeams.has('qa-automation-team')).toBe(true);

                    // This confirms the bug exists
                    expect(duplicateCommits.length).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Dashboard Integration', () => {
        test('should provide corrected team aggregation function', () => {
            // This is the corrected function that should be used in the dashboard
            function correctTeamAggregation(dailyBatchesData) {
                const uniqueCommits = new Set();
                const teamData = {};

                dailyBatchesData.forEach(row => {
                    const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;

                    if (!uniqueCommits.has(commitKey)) {
                        uniqueCommits.add(commitKey);

                        if (!teamData[row.Team]) {
                            teamData[row.Team] = {
                                totalCodeLines: 0,
                                totalAILines: 0,
                                commits: 0,
                                contributors: new Set(),
                                repositories: new Set()
                            };
                        }

                        teamData[row.Team].totalCodeLines += parseInt(row.CodeLines) || 0;
                        teamData[row.Team].totalAILines += parseInt(row.AILines) || 0;
                        teamData[row.Team].commits += 1;
                        teamData[row.Team].contributors.add(row.Contributor);
                        teamData[row.Team].repositories.add(row.Repository);
                    }
                });

                // Convert Sets to sizes and calculate AI percentages
                Object.keys(teamData).forEach(team => {
                    const stats = teamData[team];
                    stats.contributorCount = stats.contributors.size;
                    stats.repositoryCount = stats.repositories.size;
                    stats.aiPercentage = stats.totalCodeLines > 0
                        ? (stats.totalAILines / stats.totalCodeLines * 100)
                        : 0;

                    // Clean up Sets for JSON serialization
                    delete stats.contributors;
                    delete stats.repositories;
                });

                return teamData;
            }

            const correctedStats = correctTeamAggregation(mockData);

            // Verify the corrected function works properly
            expect(correctedStats.Fulfillment.totalCodeLines).toBe(106);
            expect(correctedStats.Fulfillment.commits).toBe(2);
            expect(correctedStats.Fulfillment.contributorCount).toBe(2);

            expect(correctedStats['qa-automation-team'].totalCodeLines).toBe(50);
            expect(correctedStats['qa-automation-team'].commits).toBe(1);
            expect(correctedStats['qa-automation-team'].contributorCount).toBe(1);
        });
    });
});
