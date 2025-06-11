/**
 * GitHub Organization Code Stats - Core Logic
 * This file contains the main logic flow for gathering GitHub organization statistics
 */

const axios = require('axios');
const utils = require('./get-org-code-stats.js');
const fs = require('fs');
const path = require('path');

// Main function to run the stats collection
async function collectStats(org, startDate, endDate, targetTeams, token) {
  console.log(`Organization: ${org}`);

  const headers = createHeaders(token);

  // First validate the token
  if (!await validateToken(headers)) {
    return null;
  }

  // Try to get organization information to verify access
  if (!await verifyOrgAccess(org, headers)) {
    return null;
  }

  // Get all repositories
  const allRepos = await utils.getAllRepos(org, headers);

  if (allRepos.length === 0) {
    console.log('No repositories found or accessible. Cannot calculate code stats.');
    return null;
  }

  // Get teams and handle team filtering
  const teams = await getTeamsForAnalysis(org, targetTeams, headers);
  if (!teams) {
    return null;
  }

  // Show date filtering information if applicable
  displayDateFilters(startDate, endDate);

  // STEP 1: Get all commits in the period across all repositories
  const allCommits = await getAllCommits(org, allRepos, startDate, endDate, headers);

  // STEP 2: Filter commits by members of configured groups (teams)
  const teamFilteredCommits = await filterCommitsByTeamMembers(allCommits, teams, org, headers);

  console.log(`\nFound ${teamFilteredCommits.length} commits from target team members out of ${allCommits.length} total commits`);

  // STEPS 3 & 4: Count lines of code modified in those commits and AI-assisted lines
  const codeStats = await calculateCodeStatsFromCommits(org, teamFilteredCommits, headers);

  // STEP 5: Calculate per-team daily statistics
  const teamStats = await utils.calculateTeamDailyStats(org, teams, startDate, endDate, headers);

  // Display the team statistics table
  utils.displayTeamStatsTable(teamStats, startDate, endDate);

  // Generate summary report
  const results = {
    repositories: allRepos.length,
    commits: {
      total: allCommits.length,
      teamFiltered: teamFilteredCommits.length
    },
    codeChanges: {
      additions: codeStats.totalAdditions,
      deletions: codeStats.totalDeletions,
      aiLines: codeStats.totalAILines,
      total: codeStats.totalAdditions + codeStats.totalDeletions
    },
    details: codeStats.commitDetails,
    teamStats: teamStats
  };

  // Print summary
  displaySummaryReport(results, allRepos.length, teamFilteredCommits.length);

  // Save results to CSV
  await saveResultsToCSV(results, org, startDate, endDate);

  return results;
}

/**
 * Create HTTP headers for GitHub API requests
 */
function createHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'node.js script',
    Accept: 'application/vnd.github+json'
  };
}

/**
 * Validate the GitHub token
 */
async function validateToken(headers) {
  const tokenValid = await utils.checkToken(headers);
  if (!tokenValid) {
    console.error('\nPlease provide a valid GitHub token with the appropriate permissions.');
    console.log('Create a new token at: https://github.com/settings/tokens');
    console.log('Ensure it has the "repo" scope and access to the organization repositories.');
    return false;
  }
  return true;
}

/**
 * Verify access to the GitHub organization
 */
async function verifyOrgAccess(org, headers) {
  try {
    const orgUrl = `https://api.github.com/orgs/${org}`;
    const orgData = await axios.get(orgUrl, { headers });
    console.log(`✅ Organization "${org}" found: ${orgData.data.name || orgData.data.login}`);
    return true;
  } catch (error) {
    console.error(`❌ Cannot access organization "${org}": ${error.message}`);
    if (error.response && error.response.status === 404) {
      console.error('Organization not found or you don\'t have access to it.');
    } else if (error.response) {
      console.error(`Status: ${error.response.status}, Message: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

/**
 * Get and display teams for filtering
 */
async function getTeamsForAnalysis(org, targetTeams, headers) {
  console.log('Filtering repositories by contributions from the following teams:');
  targetTeams.forEach(team => console.log(`- ${team}`));

  const teams = await utils.getOrgTeams(org, targetTeams, headers);
  if (teams.length === 0) {
    console.error('No matching teams found or access denied to team data.');
    return null;
  }
  return teams;
}

/**
 * Display date filter information
 */
function displayDateFilters(startDate, endDate) {
  if (startDate || endDate) {
    console.log('\n=== Date Filter ===');
    if (startDate) console.log(`Start Date: ${startDate}`);
    if (endDate) console.log(`End Date: ${endDate}`);
    console.log('Only counting changes that occurred within this date range.');
  }
}

/**
 * Get all commits across all repositories in the date range
 */
async function getAllCommits(org, allRepos, startDate, endDate, headers) {
  console.log('\n=== Fetching commits ===');
  let allCommits = [];

  for (const repo of allRepos) {
    const repoCommits = await utils.getRepoCommitsForTeam(org, repo, [], startDate, endDate, headers);

    // Store repo name with each commit for easier reference
    repoCommits.forEach(commit => {
      commit.repo = repo;
    });

    allCommits = allCommits.concat(repoCommits);
  }

  console.log(`\nFound a total of ${allCommits.length} commits across all repositories in the specified date range`);
  return allCommits;
}

/**
 * Filter commits by team membership
 */
async function filterCommitsByTeamMembers(allCommits, teams, org, headers) {
  console.log('\n=== Filtering commits by team members ===');
  const teamFilteredCommits = [];

  for (const commit of allCommits) {
    // Get commit author
    const author = commit.author;

    // Check if author is in target teams
    if (await utils.isUserInTargetTeams(author, teams, org, headers)) {
      teamFilteredCommits.push(commit);
    }
  }

  return teamFilteredCommits;
}

/**
 * Calculate code statistics from commits
 */
async function calculateCodeStatsFromCommits(org, teamFilteredCommits, headers) {
  console.log('\n=== Calculating code changes ===');

  // Get Copilot metrics for the organization to improve AI detection
  const copilotMetrics = await utils.getCopilotMetrics(org, null, null, headers);

  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalAILines = 0;

  const commitDetails = [];

  for (const commit of teamFilteredCommits) {
    // Commit already has additions/deletions from getRepoCommitsForTeam
    commitDetails.push({
      sha: commit.sha,
      author: commit.author,
      date: commit.date,
      additions: commit.additions,
      deletions: commit.deletions,
      message: commit.message,
      repo: commit.repo
    });

    totalAdditions += commit.additions;
    totalDeletions += commit.deletions;

    // STEP 4: Count lines of code modified with AI assistance using enhanced detection
    const aiAnalysis = utils.analyzeCommitForCopilot(commit, copilotMetrics);
    if (aiAnalysis.isCopilot) {
      totalAILines += aiAnalysis.estimatedCopilotLines;
      console.log(`  Commit ${commit.sha.substring(0, 8)} by ${commit.author} is AI-assisted: ${aiAnalysis.reason} (~${aiAnalysis.estimatedCopilotLines} lines)`);
    }
  }

  return {
    totalAdditions,
    totalDeletions,
    totalAILines,
    commitDetails
  };
}

/**
 * Display summary report
 */
function displaySummaryReport(results, repoCount, commitCount) {
  console.log(`\n=== Summary ===`);
  console.log(`Total repositories analyzed: ${repoCount}`);
  console.log(`Total commits from target teams: ${commitCount}`);
  console.log(`- Additions: ${results.codeChanges.additions}`);
  console.log(`- Deletions: ${results.codeChanges.deletions}`);
  console.log(`- Total lines modified: ${results.codeChanges.total}`);
  console.log(`- Estimated AI-assisted lines: ${results.codeChanges.aiLines}`);


  /*if (results.details.length > 0) {
    console.log(`\n=== Detailed Commits Analyzed (${results.details.length}) ===`);
    results.details.forEach(commit => {
      console.log(`- Commit ${commit.sha.substring(0, 8)} by ${commit.author} in ${commit.repo}: ${commit.additions} additions, ${commit.deletions} deletions`);
    });
  }*/
}

/**
 * Save results to CSV files in daily batches optimized for visualization
 */
async function saveResultsToCSV(results, org, startDate, endDate) {
  console.log('\n=== Saving results to daily batch CSV files ===');

  // Create output directory structure
  const outputDir = 'output';
  const dailyBatchDir = path.join(outputDir, 'daily-batches');
  const summaryDir = path.join(outputDir, 'summary');

  [outputDir, dailyBatchDir, summaryDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  try {
    // Get all unique dates from team stats
    const allDates = new Set();
    if (results.teamStats) {
      Object.values(results.teamStats).forEach(team => {
        Object.keys(team.dailyStats).forEach(date => allDates.add(date));
      });
    }

    const sortedDates = Array.from(allDates).sort();

    if (sortedDates.length === 0) {
      console.log('No daily statistics available for CSV export.');
      return;
    }

    // 1. Save daily batch files (one per day)
    const savedDailyFiles = [];
    for (const date of sortedDates) {
      const dailyFilename = await saveDailyBatchCSV(results, org, date, dailyBatchDir);
      if (dailyFilename) {
        savedDailyFiles.push(dailyFilename);
      }
    }

    // 2. Save consolidated time series CSV
    await saveTimeSeriesCSV(results.teamStats, org, startDate, endDate, summaryDir);

    // 3. Save team performance summary CSV
    await saveTeamPerformanceSummaryCSV(results.teamStats, org, startDate, endDate, summaryDir);

    // 4. Save repository activity CSV
    await saveRepositoryActivityCSV(results.details, org, startDate, endDate, summaryDir);

    console.log(`✅ Daily batch CSV files saved:`);
    console.log(`   📁 Daily batches: ./${dailyBatchDir}/ (${savedDailyFiles.length} files)`);
    savedDailyFiles.slice(0, 3).forEach(file => console.log(`      - ${path.basename(file)}`));
    if (savedDailyFiles.length > 3) {
      console.log(`      ... and ${savedDailyFiles.length - 3} more daily files`);
    }

    console.log(`   📁 Summary files: ./${summaryDir}/`);
    console.log(`      - ${org}_time_series_${startDate}_to_${endDate}.csv`);
    console.log(`      - ${org}_team_performance_${startDate}_to_${endDate}.csv`);
    console.log(`      - ${org}_repository_activity_${startDate}_to_${endDate}.csv`);

  } catch (error) {
    console.error(`❌ Error saving CSV files: ${error.message}`);
  }
}

/**
 * Save daily batch CSV for a specific date (optimized for visualization)
 */
async function saveDailyBatchCSV(results, org, date, outputDir) {
  const filename = path.join(outputDir, `${org}_daily_${date}.csv`);

  // CSV structure optimized for time-series visualization
  const csvHeader = 'Date,Team,TeamSlug,TeamMembers,Repository,Contributor,CommitSHA,CommitMessage,CodeLines,AILines,AIPercentage,Additions,Deletions,TotalChanges\n';

  const csvRows = [];

  // Process team stats for this specific date
  if (results.teamStats) {
    Object.entries(results.teamStats).forEach(([teamName, teamStats]) => {
      const dayStats = teamStats.dailyStats[date];

      if (dayStats && dayStats.contributions && dayStats.contributions.length > 0) {
        // Add individual contribution rows
        dayStats.contributions.forEach(contribution => {
          const teamAiRatio = dayStats.totalCodeLines > 0 ? (dayStats.copilotLines / dayStats.totalCodeLines) : 0;
          const estimatedAiLines = Math.round(contribution.totalLines * teamAiRatio);
          const individualAiPercentage = contribution.totalLines > 0 ?
            ((estimatedAiLines / contribution.totalLines) * 100).toFixed(1) : '0.0';

          // Clean commit message
          const cleanMessage = (contribution.message || '').replace(/"/g, '""').replace(/\n/g, ' ').substring(0, 200);

          csvRows.push([
            `"${date}"`,
            `"${teamName}"`,
            `"${teamStats.slug}"`,
            teamStats.members,
            `"${contribution.repository}"`,
            `"${contribution.author}"`,
            `"${contribution.commitSha}"`,
            `"${cleanMessage}"`,
            contribution.totalLines,
            estimatedAiLines,
            `${individualAiPercentage}%`,
            contribution.additions,
            contribution.deletions,
            contribution.additions + contribution.deletions
          ].join(','));
        });
      } else if (dayStats && dayStats.totalCodeLines > 0) {
        // Add summary row for teams without detailed contributions
        const dailyAiPercentage = dayStats.totalCodeLines > 0 ?
          ((dayStats.copilotLines / dayStats.totalCodeLines) * 100).toFixed(1) : '0.0';

        csvRows.push([
          `"${date}"`,
          `"${teamName}"`,
          `"${teamStats.slug}"`,
          teamStats.members,
          '"Multiple"',
          '"Team Summary"',
          '"N/A"',
          '"Aggregated daily activity"',
          dayStats.totalCodeLines,
          dayStats.copilotLines,
          `${dailyAiPercentage}%`,
          dayStats.totalCodeLines, // Approximation
          0, // No deletion data available
          dayStats.totalCodeLines
        ].join(','));
      }
    });
  }

  if (csvRows.length > 0) {
    const csvContent = csvHeader + csvRows.join('\n');
    fs.writeFileSync(filename, csvContent, 'utf8');
    return filename;
  }

  return null;
}

/**
 * Save consolidated time series CSV for visualization dashboards
 */
async function saveTimeSeriesCSV(teamStats, org, startDate, endDate, outputDir) {
  const filename = path.join(outputDir, `${org}_time_series_${startDate}_to_${endDate}.csv`);

  // CSV optimized for time-series charts
  const csvHeader = 'Date,Team,TeamSlug,DailyCodeLines,DailyAILines,DailyAIPercentage,CumulativeCodeLines,CumulativeAILines,CumulativeAIPercentage,ActiveContributors,CommitCount\n';

  const csvRows = [];

  // Get all unique dates
  const allDates = new Set();
  Object.values(teamStats).forEach(team => {
    Object.keys(team.dailyStats).forEach(date => allDates.add(date));
  });

  const sortedDates = Array.from(allDates).sort();

  // Track cumulative stats per team
  const teamCumulativeStats = {};

  sortedDates.forEach(date => {
    Object.entries(teamStats).forEach(([teamName, stats]) => {
      // Initialize cumulative tracking
      if (!teamCumulativeStats[teamName]) {
        teamCumulativeStats[teamName] = {
          cumulativeCodeLines: 0,
          cumulativeAILines: 0
        };
      }

      const dayStats = stats.dailyStats[date];

      if (dayStats) {
        // Update cumulative stats
        teamCumulativeStats[teamName].cumulativeCodeLines += dayStats.totalCodeLines;
        teamCumulativeStats[teamName].cumulativeAILines += dayStats.copilotLines;

        // Calculate percentages
        const dailyAiPercentage = dayStats.totalCodeLines > 0 ?
          ((dayStats.copilotLines / dayStats.totalCodeLines) * 100).toFixed(1) : '0.0';

        const cumulativeAiPercentage = teamCumulativeStats[teamName].cumulativeCodeLines > 0 ?
          ((teamCumulativeStats[teamName].cumulativeAILines / teamCumulativeStats[teamName].cumulativeCodeLines) * 100).toFixed(1) : '0.0';

        // Count active contributors and commits
        const activeContributors = dayStats.contributions ?
          new Set(dayStats.contributions.map(c => c.author)).size : 0;
        const commitCount = dayStats.contributions ? dayStats.contributions.length : 0;

        csvRows.push([
          `"${date}"`,
          `"${teamName}"`,
          `"${stats.slug}"`,
          dayStats.totalCodeLines,
          dayStats.copilotLines,
          `${dailyAiPercentage}%`,
          teamCumulativeStats[teamName].cumulativeCodeLines,
          teamCumulativeStats[teamName].cumulativeAILines,
          `${cumulativeAiPercentage}%`,
          activeContributors,
          commitCount
        ].join(','));
      } else {
        // Fill in zero values for days with no activity
        const cumulativeAiPercentage = teamCumulativeStats[teamName].cumulativeCodeLines > 0 ?
          ((teamCumulativeStats[teamName].cumulativeAILines / teamCumulativeStats[teamName].cumulativeCodeLines) * 100).toFixed(1) : '0.0';

        csvRows.push([
          `"${date}"`,
          `"${teamName}"`,
          `"${stats.slug}"`,
          0,
          0,
          '0.0%',
          teamCumulativeStats[teamName].cumulativeCodeLines,
          teamCumulativeStats[teamName].cumulativeAILines,
          `${cumulativeAiPercentage}%`,
          0,
          0
        ].join(','));
      }
    });
  });

  const csvContent = csvHeader + csvRows.join('\n');
  fs.writeFileSync(filename, csvContent, 'utf8');
}

/**
 * Save team performance summary CSV
 */
async function saveTeamPerformanceSummaryCSV(teamStats, org, startDate, endDate, outputDir) {
  const filename = path.join(outputDir, `${org}_team_performance_${startDate}_to_${endDate}.csv`);

  const csvHeader = 'Team,TeamSlug,Members,TotalCodeLines,TotalAILines,AIPercentage,AvgDailyCodeLines,AvgDailyAILines,ActiveDays,TotalCommits,UniqueContributors\n';

  const csvRows = [];

  Object.entries(teamStats).forEach(([teamName, stats]) => {
    const aiPercentage = stats.totalCodeLines > 0 ?
      ((stats.totalCopilotLines / stats.totalCodeLines) * 100).toFixed(1) : '0.0';

    // Calculate averages and activity metrics
    const activeDays = Object.keys(stats.dailyStats).length;
    const avgDailyCodeLines = activeDays > 0 ? (stats.totalCodeLines / activeDays).toFixed(1) : '0.0';
    const avgDailyAILines = activeDays > 0 ? (stats.totalCopilotLines / activeDays).toFixed(1) : '0.0';

    // Count total commits and unique contributors
    let totalCommits = 0;
    const uniqueContributors = new Set();

    Object.values(stats.dailyStats).forEach(dayStats => {
      if (dayStats.contributions) {
        totalCommits += dayStats.contributions.length;
        dayStats.contributions.forEach(contrib => uniqueContributors.add(contrib.author));
      }
    });

    csvRows.push([
      `"${teamName}"`,
      `"${stats.slug}"`,
      stats.members,
      stats.totalCodeLines,
      stats.totalCopilotLines,
      `${aiPercentage}%`,
      avgDailyCodeLines,
      avgDailyAILines,
      activeDays,
      totalCommits,
      uniqueContributors.size
    ].join(','));
  });

  const csvContent = csvHeader + csvRows.join('\n');
  fs.writeFileSync(filename, csvContent, 'utf8');
}

/**
 * Save repository activity CSV
 */
async function saveRepositoryActivityCSV(commitDetails, org, startDate, endDate, outputDir) {
  const filename = path.join(outputDir, `${org}_repository_activity_${startDate}_to_${endDate}.csv`);

  const csvHeader = 'Date,Repository,Author,CommitSHA,Message,Additions,Deletions,TotalChanges,DayOfWeek,WeekNumber\n';

  const csvRows = commitDetails.map(commit => {
    const commitDate = new Date(commit.date);
    const dayOfWeek = commitDate.toLocaleDateString('en-US', { weekday: 'long' });
    const weekNumber = getWeekNumber(commitDate);

    const message = (commit.message || '').replace(/"/g, '""').replace(/\n/g, ' ').substring(0, 300);

    return [
      `"${commit.date}"`,
      `"${commit.repo}"`,
      `"${commit.author}"`,
      `"${commit.sha}"`,
      `"${message}"`,
      commit.additions,
      commit.deletions,
      commit.additions + commit.deletions,
      `"${dayOfWeek}"`,
      weekNumber
    ].join(',');
  });

  const csvContent = csvHeader + csvRows.join('\n');
  fs.writeFileSync(filename, csvContent, 'utf8');
}

/**
 * Get week number for a date
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = { collectStats };
