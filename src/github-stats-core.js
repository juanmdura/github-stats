/**
 * GitHub Organization Code Stats - Core Logic
 * This file contains the main logic flow for gathering GitHub organization statistics
 */

const axios = require('axios');
const utils = require('./get-org-code-stats.js');

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
    details: codeStats.commitDetails
  };

  // Print summary
  displaySummaryReport(results, allRepos.length, teamFilteredCommits.length);

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

module.exports = { collectStats };
