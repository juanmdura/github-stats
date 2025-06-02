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
  
  // STEP 1: Get all PRs merged in the period across all repositories
  const allMergedPRs = await getAllMergedPRs(org, allRepos, startDate, endDate, headers);
  
  // STEP 2: Filter PRs by members of configured groups (teams)
  const teamFilteredPRs = await filterPRsByTeamMembers(allMergedPRs, teams, org, headers);
  
  console.log(`\nFound ${teamFilteredPRs.length} PRs from target team members out of ${allMergedPRs.length} total PRs`);
  
  // STEPS 3 & 4: Count lines of code modified in those PRs and AI-assisted lines
  const codeStats = await calculateCodeStats(org, teamFilteredPRs, headers);
  
  // Generate summary report
  const results = {
    repositories: allRepos.length,
    prs: {
      total: allMergedPRs.length,
      teamFiltered: teamFilteredPRs.length
    },
    codeChanges: {
      additions: codeStats.totalAdditions,
      deletions: codeStats.totalDeletions,
      aiLines: codeStats.totalAILines,
      total: codeStats.totalAdditions + codeStats.totalDeletions
    },
    details: codeStats.prDetails
  };
  
  // Print summary
  displaySummaryReport(results, allRepos.length, teamFilteredPRs.length);
  
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
    console.error('Your token might need "read:org" permission.');
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
 * Get all merged PRs across all repositories in the date range
 */
async function getAllMergedPRs(org, allRepos, startDate, endDate, headers) {
  console.log('\n=== Fetching merged PRs ===');
  let allMergedPRs = [];
  
  for (const repo of allRepos) {
    const mergedPRs = await utils.getRepoMergedPRs(org, repo, startDate, endDate, headers);
    
    // Store repo name with each PR for easier reference
    mergedPRs.forEach(pr => {
      pr.repo = repo;
    });
    
    allMergedPRs = allMergedPRs.concat(mergedPRs);
  }
  
  console.log(`\nFound a total of ${allMergedPRs.length} merged PRs across all repositories in the specified date range`);
  return allMergedPRs;
}

/**
 * Filter PRs by team membership
 */
async function filterPRsByTeamMembers(allMergedPRs, teams, org, headers) {
  console.log('\n=== Filtering PRs by team members ===');
  const teamFilteredPRs = [];
  
  for (const pr of allMergedPRs) {
    // Get PR author
    const author = pr.user.login;
    
    // Check if author is in target teams
    if (await utils.isUserInTargetTeams(author, teams, org, headers)) {
      teamFilteredPRs.push(pr);
    }
  }
  
  return teamFilteredPRs;
}

/**
 * Calculate code statistics from PRs
 */
async function calculateCodeStats(org, teamFilteredPRs, headers) {
  console.log('\n=== Calculating code changes ===');
  
  // Get Copilot metrics for the organization to improve AI detection
  const copilotMetrics = await utils.getCopilotMetrics(org, null, null, headers);
  
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalAILines = 0;
  
  const prDetails = [];
  
  for (const pr of teamFilteredPRs) { 
    const details = await utils.getPRDetails(org, pr.repo, pr.number, headers);
    
    if (details) {
      prDetails.push(details);
      totalAdditions += details.additions;
      totalDeletions += details.deletions;
      
      // STEP 4: Count lines of code modified with AI assistance using enhanced detection
      const aiAnalysis = await utils.analyzeAICodeInPR(org, pr.repo, details, headers, copilotMetrics);
      if (aiAnalysis.isAIAssisted) {
        totalAILines += aiAnalysis.aiLines;
        console.log(`  PR #${details.number} (${details.title}) is AI-assisted: ${aiAnalysis.reason} (~${aiAnalysis.aiLines} lines)`);
      }
    }
  }
  
  return {
    totalAdditions,
    totalDeletions,
    totalAILines,
    prDetails
  };
}

/**
 * Display summary report
 */
function displaySummaryReport(results, repoCount, prCount) {
  console.log(`\nTotal code changes from team members:`);
  console.log(`- Additions: ${results.codeChanges.additions}`);
  console.log(`- Deletions: ${results.codeChanges.deletions}`);
  console.log(`- Estimated AI-assisted lines: ${results.codeChanges.aiLines}`);
  console.log(`- Total lines modified: ${results.codeChanges.total}`);
  
  console.log(`\nDetailed PRs analyzed:`);
  results.details.forEach(pr => {
    console.log(`- PR #${pr.number} (${pr.title}) in ${pr.repo}: ${pr.additions} additions, ${pr.deletions} deletions`);
  });
  
  console.log(`\n=== Summary ===`);
  console.log(`Total repositories analyzed: ${repoCount}`);
  console.log(`Total PRs from target teams: ${prCount}`);
  console.log(`Total code changes from target teams: ${results.codeChanges.total}`);
  console.log(`Estimated AI-assisted lines: ${results.codeChanges.aiLines}`);
}

module.exports = { collectStats };
