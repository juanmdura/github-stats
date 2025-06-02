/**
 * GitHub Organization Code Stats - Utility Functions
 * This file contains all the utility functions needed by the main github-stats-core.js file
 */

const axios = require('axios');

// Define the default teams we want to filter by
const DEFAULT_TARGET_TEAMS = [
  'Engineering'
];

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && i + 1 < args.length) {
      params.startDate = args[i + 1];
      i++;
    } else if (args[i] === '--to' && i + 1 < args.length) {
      params.endDate = args[i + 1];
      i++;
    } else if (args[i] === '--org' && i + 1 < args.length) {
      params.org = args[i + 1];
      i++;
    } else if (args[i] === '--teams' && i + 1 < args.length) {
      params.teams = args[i + 1].split(',').map(t => t.trim());
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
GitHub Organization Code Stats - Usage:
  node index.js [options]

Options:
  --from DATE       Start date in YYYY-MM-DD format
  --to DATE         End date in YYYY-MM-DD format
  --org NAME        GitHub organization name
  --teams LIST      Comma-separated list of team names to filter by
  --help, -h        Show this help message

Features:
  - Lines of code statistics (additions/deletions)
  - Date range filtering
  - Team contribution filtering
  - GitHub Copilot suggestion detection

Examples:
  node index.js --from 2023-01-01 --to 2023-12-31
  node index.js --org MyOrgName
  node index.js --teams "Core Engineering,Data Science"
      `);
      process.exit(0);
    }
  }

  return params;
}

// Validate a date string in YYYY-MM-DD format
function validateDate(dateString) {
  return dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

// Check if the token works by getting the authenticated user info
async function checkToken(headers) {
  try {
    const response = await axios.get('https://api.github.com/user', { headers });
    console.log('✅ Token validation successful');
    console.log(`Authenticated as: ${response.data.login}`);

    // Check token scopes
    if (response.headers && response.headers['x-oauth-scopes']) {
      console.log(`Token scopes: ${response.headers['x-oauth-scopes']}`);
    } else {
      console.log('Unable to determine token scopes');
    }

    return true;
  } catch (error) {
    console.error('❌ Token validation failed:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    }
    return false;
  }
}

async function getAllRepos(org, headers) {
  const fs = require('fs');
  const path = require('path');

  try {
    console.log(`Loading repositories for ${org} from repos.json file...`);

    // Read the repos.json file
    const reposFilePath = path.join(__dirname, 'repos.json');
    const reposData = JSON.parse(fs.readFileSync(reposFilePath, 'utf8'));

    if (!reposData.repositories || !Array.isArray(reposData.repositories)) {
      console.error('Invalid repos.json format: missing "repositories" array');
      return [];
    }

    // Filter repositories that belong to the specified organization
    const orgRepos = reposData.repositories.filter(item => {
      const [repoOrg] = item.repo.split('/');
      return repoOrg === org;
    });

    if (orgRepos.length === 0) {
      console.log(`\n=== No repositories found for organization "${org}" ===`);
      console.log('Make sure the repos.json file contains repositories for this organization.');
      return [];
    }

    console.log(`\nFound ${orgRepos.length} repositories for ${org} in repos.json:`);
    orgRepos.forEach(item => {
      const [, repoName] = item.repo.split('/');
      console.log(`- ${repoName} (branch: ${item.branch})`);
    });

    // Return just the repository names (without org prefix) for compatibility
    return orgRepos.map(item => {
      const [, repoName] = item.repo.split('/');
      return repoName;
    });

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Error: repos.json file not found. Please create the file with your repository list.');
    } else if (error instanceof SyntaxError) {
      console.error('Error: Invalid JSON format in repos.json file.');
    } else {
      console.error('Error reading repositories from repos.json:', error.message);
    }
    return [];
  }
}

// Get Copilot metrics for an organization using the GitHub API
async function getCopilotMetrics(org, startDate, endDate, headers) {
  try {
    const url = `https://api.github.com/orgs/${org}/copilot/metrics`;
    const params = {};

    // Add date filters if provided
    if (startDate) {
      params.since = startDate;
    }
    if (endDate) {
      params.until = endDate;
    }

    const response = await axios.get(url, { headers, params });

    // Extract total code lines accepted from the metrics
    const metrics = response.data;
    let totalCodeLinesAccepted = 0;

    // The API returns metrics in different formats, handle both daily and summary formats
    if (metrics && Array.isArray(metrics)) {
      // Daily metrics format
      totalCodeLinesAccepted = metrics.reduce((total, dayMetric) => {
        return total + (dayMetric.total_code_lines_accepted || 0);
      }, 0);
    } else if (metrics && metrics.total_code_lines_accepted) {
      // Summary format
      totalCodeLinesAccepted = metrics.total_code_lines_accepted;
    }

    console.log(`📊 GitHub Copilot metrics for ${org}: ${totalCodeLinesAccepted} lines accepted`);

    return {
      totalCodeLinesAccepted,
      success: true
    };
  } catch (error) {
    console.warn(`⚠️ Unable to fetch Copilot metrics: ${error.message}`);
    if (error.response && error.response.status === 403) {
      console.warn('Token may need "copilot" scope to access Copilot metrics');
    }
    return {
      totalCodeLinesAccepted: 0,
      success: false
    };
  }
}

// Analyze a commit using Copilot metrics data
function analyzeCommitForCopilot(commit, copilotMetrics = null) {
  // Only use actual Copilot metrics data if available
  if (copilotMetrics && copilotMetrics.success && copilotMetrics.totalCodeLinesAccepted > 0) {
    if (commit.stats && commit.stats.additions > 0) {
      // Estimate based on the ratio of Copilot lines to total additions
      const estimatedCopilotRatio = Math.min(0.7, copilotMetrics.totalCodeLinesAccepted / (commit.stats.additions * 10));

      return {
        isCopilot: true,
        confidence: 'high',
        reason: 'Based on GitHub Copilot metrics API',
        estimatedCopilotLines: Math.round(commit.stats.additions * estimatedCopilotRatio)
      };
    }
  }

  return {
    isCopilot: false,
    estimatedCopilotLines: 0
  };
}

async function getRepoStats(org, repo, startDate, endDate, headers) {
  const url = `https://api.github.com/repos/${org}/${repo}/stats/contributors`;

  try {
    const res = await axios.get(url, { headers });

    // Check for rate limiting
    if (res.headers['x-ratelimit-remaining']) {
      const remaining = res.headers['x-ratelimit-remaining'];
      if (parseInt(remaining) < 10) {
        console.warn(`  ⚠️ GitHub API rate limit getting low: ${remaining} requests remaining`);
      }
    }

    // Sometimes GitHub takes time to generate stats
    if (!Array.isArray(res.data)) {
      console.log(`  GitHub is computing stats for ${repo}...`);
      return null;
    }

    if (res.data.length === 0) {
      console.log(`  No contributors data found for ${repo}`);
      return { additions: 0, deletions: 0, copilotLines: 0 };
    }

    // Get Copilot metrics for better AI code estimation
    const copilotMetrics = await getCopilotMetrics(org, startDate, endDate, headers);

    // Convert date strings to timestamps for comparison
    const startTimestamp = startDate ? new Date(startDate).getTime() / 1000 : null;
    const endTimestamp = endDate ? new Date(endDate).getTime() / 1000 : null;

    let additions = 0, deletions = 0, copilotLines = 0;
    let filteredWeeks = 0;
    let totalWeeks = 0;

    // Try to fetch commit data to identify Copilot-authored lines
    let copilotData = null;
    let commitRes = null;
    try {
      const commitUrl = `https://api.github.com/repos/${org}/${repo}/commits`;
      const commitParams = {
        headers,
        params: {
          per_page: 100
        }
      };

      if (startTimestamp) {
        const startDate = new Date(startTimestamp * 1000).toISOString();
        commitParams.params.since = startDate;
      }

      if (endTimestamp) {
        const endDate = new Date(endTimestamp * 1000).toISOString();
        commitParams.params.until = endDate;
      }

      commitRes = await axios.get(commitUrl, commitParams);

      // For each commit, get more detailed info to analyze
      const detailedCommits = [];
      for (const commit of commitRes.data.slice(0, 10)) { // Analyze up to 10 recent commits
        try {
          const detailUrl = `https://api.github.com/repos/${org}/${repo}/commits/${commit.sha}`;
          const detailRes = await axios.get(detailUrl, { headers });
          detailedCommits.push(detailRes.data);
        } catch (e) {
          // Skip this commit if details can't be fetched
        }
      }

      // Identify commits that might be from Copilot using our enhanced analyzer
      copilotData = detailedCommits.filter(commit => {
        const analysis = analyzeCommitForCopilot(commit, copilotMetrics);
        if (analysis.isCopilot) {
          copilotLines += analysis.estimatedCopilotLines || 0;
        }
        return analysis.isCopilot;
      });

    } catch (error) {
      console.log(`  Unable to fetch commit data for Copilot analysis: ${error.message}`);
    }

    res.data.forEach(contributor => {
      if (!contributor.weeks) {
        console.log(`  Missing weeks data for a contributor in ${repo}`);
        return;
      }

      contributor.weeks.forEach(week => {
        totalWeeks++;
        // Each week entry has a 'w' field with a Unix timestamp
        const weekTimestamp = week.w;

        // Apply date filtering if specified
        if (
          (startTimestamp === null || weekTimestamp >= startTimestamp) &&
          (endTimestamp === null || weekTimestamp <= endTimestamp)
        ) {
          additions += week.a || 0;
          deletions += week.d || 0;
          filteredWeeks++;
        }
      });
    });

    // If we have organization-level Copilot metrics but no commit-level data,
    // estimate based on the total metrics
    if (copilotMetrics.success && copilotLines === 0 && (additions + deletions) > 0) {
      // Rough estimation based on organization-wide Copilot usage
      const totalOrgLines = additions + deletions;
      const estimatedCopilotRatio = Math.min(0.4, copilotMetrics.totalCodeLinesAccepted / (totalOrgLines * 5));
      copilotLines = Math.round(totalOrgLines * estimatedCopilotRatio);
    }

    // Report Copilot analysis results
    if (copilotData && copilotData.length > 0) {
      console.log(`  🤖 Found ${copilotData.length} potential Copilot-suggested commits with ~${copilotLines} lines`);
    } else if (copilotMetrics.success) {
      console.log(`  🤖 Estimated ~${copilotLines} Copilot-assisted lines based on org metrics`);
    }

    // Report if date filtering was applied
    if (startTimestamp !== null || endTimestamp !== null) {
      const dateRange = [
        startDate ? `from ${startDate}` : '',
        endDate ? `to ${endDate}` : ''
      ].filter(Boolean).join(' ');

      console.log(`  📅 Date filtering: ${dateRange}`);
      console.log(`  📊 Analyzing ${filteredWeeks} weeks out of ${totalWeeks} total weeks`);
    }

    return { additions, deletions, copilotLines };
  } catch (error) {
    if (error.response && error.response.status === 202) {
      // 202 means GitHub is computing the stats
      return null;
    }
    throw error; // Let the caller handle other errors
  }
}

// Cache of team members to avoid repeated API calls
const teamMembersCache = new Map();

// Fetch all teams in the organization
async function getOrgTeams(org, targetTeams, headers) {
  try {
    console.log(`\nFetching teams for organization ${org}...`);
    const teamsUrl = `https://api.github.com/orgs/${org}/teams`;
    const response = await axios.get(teamsUrl, { headers });

    const teams = response.data.filter(team =>
      targetTeams.some(targetTeam =>
        team.name.toLowerCase().includes(targetTeam.toLowerCase())
      )
    );

    console.log(`Found ${teams.length} matching teams out of ${response.data.length} total teams`);
    return teams;
  } catch (error) {
    console.error('Error fetching organization teams:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      if (error.response.status === 403) {
        console.error('Access denied to team data. Your token may need "read:org" permission.');
      }
    }
    return [];
  }
}

// Get members of a team
async function getTeamMembers(teamSlug, org, headers) {
  const cacheKey = `${org}_${teamSlug}`;
  if (teamMembersCache.has(cacheKey)) {
    return teamMembersCache.get(cacheKey);
  }

  try {
    const url = `https://api.github.com/orgs/${org}/teams/${teamSlug}/members`;
    const response = await axios.get(url, { headers });
    const members = response.data.map(member => member.login);

    teamMembersCache.set(cacheKey, members);
    return members;
  } catch (error) {
    console.error(`Error fetching members for team ${teamSlug}:`, error.message);
    return [];
  }
}

// Check if a user belongs to any of the target teams
async function isUserInTargetTeams(username, teams, org, headers) {
  for (const team of teams) {
    const members = await getTeamMembers(team.slug, org, headers);
    if (members.includes(username)) {
      return true;
    }
  }
  return false;
}

// Get all contributors of a repository
async function getRepoContributors(org, repo, headers) {
  try {
    const url = `https://api.github.com/repos/${org}/${repo}/contributors`;
    const response = await axios.get(url, { headers });
    return response.data.map(contributor => contributor.login);
  } catch (error) {
    console.error(`Error fetching contributors for ${repo}:`, error.message);
    return [];
  }
}

// Check if repo has contributors from target teams
async function checkRepoTeamContribution(org, repo, teams, headers) {
  console.log(`  Checking if ${repo} has contributors from target teams...`);
  const contributors = await getRepoContributors(org, repo, headers);

  if (contributors.length === 0) {
    console.log(`  No contributors found for ${repo}`);
    return false;
  }

  for (const contributor of contributors) {
    if (await isUserInTargetTeams(contributor, teams, org, headers)) {
      console.log(`  ✅ Repository ${repo} has contributors from target teams`);
      return true;
    }
  }

  console.log(`  ❌ No contributors from target teams found for ${repo}`);
  return false;
}

// Get all merged PRs in a repository within a date range
async function getRepoMergedPRs(org, repo, startDate, endDate, headers) {
  try {
    console.log(`  Fetching merged PRs for ${repo}...`);
    const url = `https://api.github.com/repos/${org}/${repo}/pulls`;
    const params = {
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 100
    };

    // PRs across multiple pages
    let allPRs = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        const response = await axios.get(url, {
          headers,
          params: { ...params, page }
        });

        // Filter merged PRs within the date range
        const prs = response.data.filter(pr => {
          // Only consider merged PRs (closed PRs with merge_commit_sha)
          if (!pr.merged_at) return false;

          const mergedDate = new Date(pr.merged_at);

          // Apply date filter if specified
          const afterStartDate = !startDate || mergedDate >= new Date(startDate);
          const beforeEndDate = !endDate || mergedDate <= new Date(endDate);

          return afterStartDate && beforeEndDate;
        });

        if (prs.length > 0) {
          allPRs = allPRs.concat(prs);
          console.log(`    Found ${prs.length} merged PRs on page ${page}`);
        }

        // Check if there are more pages of results
        hasMorePages = response.data.length === params.per_page;
        page++;

        // Stop if we've gone beyond our date range
        if (response.data.length > 0) {
          const oldestPRDate = new Date(response.data[response.data.length - 1].updated_at);
          if (startDate && oldestPRDate < new Date(startDate)) {
            hasMorePages = false;
          }
        }
      } catch (error) {
        console.error(`    Error fetching PR page ${page}: ${error.message}`);
        hasMorePages = false;
      }
    }

    console.log(`  ✅ Found ${allPRs.length} total merged PRs for ${repo} in the specified date range`);
    return allPRs;
  } catch (error) {
    console.error(`  Error fetching PRs for ${repo}: ${error.message}`);
    return [];
  }
}

// Get detailed information about a PR including files changed and line counts
async function getPRDetails(org, repo, prNumber, headers) {
  try {
    const url = `https://api.github.com/repos/${org}/${repo}/pulls/${prNumber}`;
    const response = await axios.get(url, { headers });

    // Now get the files changed in this PR
    const filesUrl = `${url}/files`;
    const filesResponse = await axios.get(filesUrl, { headers });

    let additions = 0;
    let deletions = 0;

    filesResponse.data.forEach(file => {
      additions += file.additions || 0;
      deletions += file.deletions || 0;
    });

    return {
      number: prNumber,
      additions,
      deletions,
      total: additions + deletions,
      user: response.data.user.login,
      title: response.data.title,
      mergeCommitSha: response.data.merge_commit_sha,
      mergedAt: response.data.merged_at,
      files: filesResponse.data.map(f => f.filename)
    };
  } catch (error) {
    console.error(`    Error fetching details for PR #${prNumber}: ${error.message}`);
    return null;
  }
}

// Analyze a PR to determine if it contains AI-assisted code using Copilot metrics
async function analyzeAICodeInPR(org, repo, pr, headers, copilotMetrics = null) {
  try {
    // Only use actual Copilot metrics data for AI detection
    let aiAssisted = false;
    let aiLinesEstimate = 0;
    let reason = '';

    if (pr.mergeCommitSha && copilotMetrics && copilotMetrics.success) {
      // Get detailed commit info
      const commitUrl = `https://api.github.com/repos/${org}/${repo}/commits/${pr.mergeCommitSha}`;
      const commitDetails = await axios.get(commitUrl, { headers });

      // Use the enhanced analyzeCommitForCopilot function
      const commitAnalysis = analyzeCommitForCopilot(commitDetails.data, copilotMetrics);

      if (commitAnalysis.isCopilot) {
        aiAssisted = true;
        reason = commitAnalysis.reason;
        aiLinesEstimate = commitAnalysis.estimatedCopilotLines || 0;
      }
    }

    return {
      isAIAssisted: aiAssisted,
      aiLines: aiLinesEstimate,
      reason
    };
  } catch (error) {
    console.error(`    Error analyzing AI code in PR: ${error.message}`);
    return { isAIAssisted: false, aiLines: 0 };
  }
}

// Get the branch for a specific repository from repos.json
function getRepoBranch(org, repoName) {
  const fs = require('fs');
  const path = require('path');

  try {
    const reposFilePath = path.join(__dirname, 'repos.json');
    const reposData = JSON.parse(fs.readFileSync(reposFilePath, 'utf8'));

    if (!reposData.repositories || !Array.isArray(reposData.repositories)) {
      return 'main'; // Default fallback
    }

    const fullRepoName = `${org}/${repoName}`;
    const repoInfo = reposData.repositories.find(item => item.repo === fullRepoName);

    return repoInfo ? repoInfo.branch : 'main'; // Default to 'main' if not found
  } catch (error) {
    console.warn(`Warning: Could not read branch info for ${org}/${repoName}, defaulting to 'main'`);
    return 'main';
  }
}

// Export all utility functions for use in github-stats-core.js
module.exports = {
  DEFAULT_TARGET_TEAMS,
  parseArgs,
  validateDate,
  checkToken,
  getAllRepos,
  getCopilotMetrics,
  analyzeCommitForCopilot,
  getRepoStats,
  getOrgTeams,
  getTeamMembers,
  isUserInTargetTeams,
  getRepoContributors,
  checkRepoTeamContribution,
  getRepoMergedPRs,
  getPRDetails,
  analyzeAICodeInPR,
  getRepoBranch
};