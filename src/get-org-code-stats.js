/**
 * GitHub Organization Code Stats - Utility Functions
 * This file contains all the utility functions needed by the main github-stats-core.js file
 */

const axios = require('axios');

// Load default teams from config file
function loadDefaultTargetTeams() {
  const fs = require('fs');
  const path = require('path');

  try {
    const teamsConfigPath = path.join(__dirname, '../config/teams.json');
    const teamsData = JSON.parse(fs.readFileSync(teamsConfigPath, 'utf8'));

    if (!teamsData.defaultTargetTeams || !Array.isArray(teamsData.defaultTargetTeams)) {
      console.warn('Warning: Invalid teams.json format, using fallback teams');
      return ['Engineering'];
    }

    return teamsData.defaultTargetTeams;
  } catch (error) {
    console.warn('Warning: Could not read teams.json, using fallback teams:', error.message);
    return ['Engineering'];
  }
}

// Define the default teams we want to filter by
// Loaded from config/teams.json file
const DEFAULT_TARGET_TEAMS = loadDefaultTargetTeams();

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
    return false;
  }
}

async function getAllRepos(org, headers) {
  const fs = require('fs');
  const path = require('path');

  try {
    console.log(`Loading repositories for ${org} from repos.json file...`);

    // Read the repos.json file from environment variable or default path
    const configPath = process.env.REPOS_CONFIG_PATH || 'config/repos.json';
    const reposFilePath = path.isAbsolute(configPath)
      ? configPath
      : path.join(__dirname, '..', configPath);
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
    console.error('❌ Error reading repositories from repos.json:', error.message);
    return [];
  }
}

// Get Copilot metrics for an organization using the GitHub API
async function getCopilotMetrics(org, startDate, endDate, headers) {
  try {
    const url = `https://api.github.com/orgs/${org}/copilot/metrics`;
    const params = {};

    // Convert YYYY-MM-DD format to ISO 8601 format and handle date constraints
    if (startDate) {
      // GitHub Copilot metrics API only supports last 28 days
      const now = new Date();
      const maxPastDate = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000)); // 28 days ago
      const requestedStart = new Date(startDate);

      // Use the more recent of the requested date or max past date
      const actualStart = requestedStart > maxPastDate ? requestedStart : maxPastDate;
      params.since = actualStart.toISOString();
      console.log(`📅 Copilot metrics: Using start date ${params.since} (API limit: max 28 days ago)`);
    }
    if (endDate) {
      // Cannot be in the future and must not precede since date
      const now = new Date();
      const requestedEnd = new Date(endDate);
      const actualEnd = requestedEnd < now ? requestedEnd : now;
      params.until = actualEnd.toISOString();
      console.log(`📅 Copilot metrics: Using end date ${params.until}`);
    }

    console.log(`🔗 Calling Copilot metrics API: ${url} with params:`, params);
    const response = await axios.get(url, { headers, params });

    // Extract total code lines accepted from the metrics
    const metrics = response.data;
    let totalCodeLinesAccepted = 0;

    console.log(`📊 Raw Copilot API response contains ${Array.isArray(metrics) ? metrics.length : 'unknown'} entries`);

    // The API returns metrics in array format with daily entries
    if (metrics && Array.isArray(metrics)) {
      // Daily metrics format - traverse the nested structure to find code lines
      metrics.forEach((dayMetric, index) => {
        console.log(`   Day ${index + 1} (${dayMetric.date}): Processing metrics...`);

        if (dayMetric.copilot_ide_code_completions && dayMetric.copilot_ide_code_completions.editors) {
          dayMetric.copilot_ide_code_completions.editors.forEach(editor => {
            if (editor.models) {
              editor.models.forEach(model => {
                if (model.languages) {
                  model.languages.forEach(language => {
                    const linesAccepted = language.total_code_lines_accepted || 0;
                    totalCodeLinesAccepted += linesAccepted;
                    if (linesAccepted > 0) {
                      console.log(`     ${language.name} in ${editor.name}: ${linesAccepted} lines accepted`);
                    }
                  });
                }
              });
            }
          });
        }
      });
    } else if (metrics && metrics.total_code_lines_accepted) {
      // Summary format (fallback)
      totalCodeLinesAccepted = metrics.total_code_lines_accepted;
    }

    console.log(`📊 GitHub Copilot metrics for ${org}: ${totalCodeLinesAccepted} total lines accepted over ${Array.isArray(metrics) ? metrics.length : 0} days`);

    return {
      totalCodeLinesAccepted,
      success: true,
      dailyData: Array.isArray(metrics) ? metrics : []
    };
  } catch (error) {
    console.error(`❌ Unable to fetch Copilot metrics: ${error.message}`);
    //⚠️
    return {
      totalCodeLinesAccepted: 0,
      success: false,
      dailyData: []
    };
  }
}

// Get Copilot metrics for a specific team using the GitHub API
async function getTeamCopilotMetrics(org, teamSlug, startDate, endDate, headers) {
  try {
    const url = `https://api.github.com/orgs/${org}/team/${teamSlug}/copilot/metrics`;
    const params = {};

    // Convert YYYY-MM-DD format to ISO 8601 format and handle date constraints
    if (startDate) {
      // GitHub Copilot metrics API only supports last 28 days
      const now = new Date();
      const maxPastDate = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000)); // 28 days ago
      const requestedStart = new Date(startDate);

      // Use the more recent of the requested date or max past date
      const actualStart = requestedStart > maxPastDate ? requestedStart : maxPastDate;
      params.since = actualStart.toISOString();
    }
    if (endDate) {
      // Cannot be in the future and must not precede since date
      const now = new Date();
      const requestedEnd = new Date(endDate);
      const actualEnd = requestedEnd < now ? requestedEnd : now;
      params.until = actualEnd.toISOString();
    }

    const response = await axios.get(url, { headers, params });

    // Extract daily metrics from the response
    const metrics = response.data;
    let dailyMetrics = [];
    let totalCodeLinesAccepted = 0;

    // The API returns daily metrics in an array format
    if (metrics && Array.isArray(metrics)) {
      dailyMetrics = metrics.map(dayMetric => {
        let dayCodeLinesAccepted = 0;

        // Traverse the nested structure to find code lines accepted
        if (dayMetric.copilot_ide_code_completions && dayMetric.copilot_ide_code_completions.editors) {
          dayMetric.copilot_ide_code_completions.editors.forEach(editor => {
            if (editor.models) {
              editor.models.forEach(model => {
                if (model.languages) {
                  model.languages.forEach(language => {
                    dayCodeLinesAccepted += language.total_code_lines_accepted || 0;
                  });
                }
              });
            }
          });
        }

        return {
          date: dayMetric.date,
          total_lines_suggested: dayMetric.total_lines_suggested || 0,
          total_lines_accepted: dayMetric.total_lines_accepted || 0,
          total_code_suggestions: dayMetric.total_code_suggestions || 0,
          total_code_acceptances: dayMetric.total_code_acceptances || 0,
          total_code_lines_suggested: dayMetric.total_code_lines_suggested || 0,
          total_code_lines_accepted: dayCodeLinesAccepted
        };
      });

      totalCodeLinesAccepted = dailyMetrics.reduce((total, dayMetric) => {
        return total + dayMetric.total_code_lines_accepted;
      }, 0);
    }

    console.log(`📊 GitHub Copilot metrics for team ${teamSlug}: ${totalCodeLinesAccepted} lines accepted over ${dailyMetrics.length} days`);

    return {
      dailyMetrics,
      totalCodeLinesAccepted,
      success: true
    };
  } catch (error) {
    console.error(`❌ Unable to fetch Copilot metrics for team ${teamSlug}: ${error.message}`);
    return {
      dailyMetrics: [],
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
      console.error(`❌ Unable to fetch commit data for Copilot analysis: ${error.message}`);
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
        team.name.toLowerCase() === targetTeam.toLowerCase()
      )
    );

    console.log(`Found ${teams.length} matching teams out of ${response.data.length} total teams`);
    return teams;
  } catch (error) {
    console.error('❌ Error fetching organization teams:', error.message);
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
    console.error(`❌ Error fetching members for team ${teamSlug}:`, error.message);
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
    console.error(`❌ Error fetching contributors for ${repo}:`, error.message);
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
        if (error.response && error.response.status === 404) {
          console.error(`❌ Repository ${org}/${repo} not found or not accessible`);
          return [];
        } else {
          console.error(`❌ Error fetching PR page ${page}: ${error.message}`);
        }
        hasMorePages = false;
      }
    }

    console.log(`  ✅ Found ${allPRs.length} total merged PRs for ${repo} in the specified date range`);
    return allPRs;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error(`❌ Repository ${org}/${repo} not found or not accessible`);
    } else {
      console.error(`❌ Error fetching PRs for ${repo}: ${error.message}`);
    }
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
    console.error(`❌ Error fetching details for PR #${prNumber}: ${error.message}`);
    return null;
  }
}

// Analyze a PR to determine if it contains AI-assisted code using Copilot metrics
async function analyzeAICodeInPR(org, repo, pr, headers, copilotMetrics = null) {
  try {
    console.log(`    🔍 Analyzing PR #${pr.number} for AI assistance...`);
    console.log(`    📋 PR has mergeCommitSha: ${pr.mergeCommitSha ? 'Yes' : 'No'}`);
    console.log(`    📊 Copilot metrics available: ${copilotMetrics && copilotMetrics.success ? 'Yes' : 'No'}`);
    if (copilotMetrics) {
      console.log(`    📈 Total Copilot lines in org: ${copilotMetrics.totalCodeLinesAccepted}`);
    }

    // Only use actual Copilot metrics data for AI detection
    let aiAssisted = false;
    let aiLinesEstimate = 0;
    let reason = '';

    if (pr.mergeCommitSha && copilotMetrics && copilotMetrics.success) {
      // Get detailed commit info
      const commitUrl = `https://api.github.com/repos/${org}/${repo}/commits/${pr.mergeCommitSha}`;
      console.log(`    🔗 Fetching commit details from: ${commitUrl}`);

      try {
        const commitDetails = await axios.get(commitUrl, { headers });
        console.log(`    📝 Commit stats: additions=${commitDetails.data.stats?.additions}, deletions=${commitDetails.data.stats?.deletions}`);

        // Use the enhanced analyzeCommitForCopilot function
        const commitAnalysis = analyzeCommitForCopilot(commitDetails.data, copilotMetrics);
        console.log(`    🤖 Commit analysis result: isCopilot=${commitAnalysis.isCopilot}, estimatedLines=${commitAnalysis.estimatedCopilotLines}`);

        if (commitAnalysis.isCopilot) {
          aiAssisted = true;
          reason = commitAnalysis.reason;
          aiLinesEstimate = commitAnalysis.estimatedCopilotLines || 0;
        }
      } catch (commitError) {
        console.log(`    ⚠️ Error fetching commit details: ${commitError.message}`);
        // Fallback: estimate based on PR size and overall Copilot usage
        if (copilotMetrics.totalCodeLinesAccepted > 0) {
          const prSize = pr.additions + pr.deletions;
          const estimatedRatio = Math.min(0.3, copilotMetrics.totalCodeLinesAccepted / 10000);
          aiLinesEstimate = Math.round(prSize * estimatedRatio);
          if (aiLinesEstimate > 0) {
            aiAssisted = true;
            reason = 'Estimated based on organization Copilot metrics (commit details unavailable)';
          }
        }
      }
    } else {
      console.log(`    ⚠️ Cannot analyze: Missing merge commit SHA or Copilot metrics`);
      // Fallback estimation if we have organization-level Copilot metrics
      if (copilotMetrics && copilotMetrics.success && copilotMetrics.totalCodeLinesAccepted > 0) {
        const prSize = pr.additions + pr.deletions;
        const estimatedRatio = Math.min(0.2, copilotMetrics.totalCodeLinesAccepted / 20000);
        aiLinesEstimate = Math.round(prSize * estimatedRatio);
        if (aiLinesEstimate > 0) {
          aiAssisted = true;
          reason = 'Estimated based on organization Copilot usage patterns';
        }
        console.log(`    📊 Fallback estimation: prSize=${prSize}, ratio=${estimatedRatio}, estimated=${aiLinesEstimate}`);
      }
    }

    console.log(`    ✅ Final result: AI-assisted=${aiAssisted}, lines=${aiLinesEstimate}, reason="${reason}"`);
    return {
      isAIAssisted: aiAssisted,
      aiLines: aiLinesEstimate,
      reason
    };
  } catch (error) {
    console.error(`    ❌ Error analyzing AI code in PR: ${error.message}`);
    return { isAIAssisted: false, aiLines: 0 };
  }
}

// Get the branch for a specific repository from repos.json
function getRepoBranch(org, repoName) {
  const fs = require('fs');
  const path = require('path');

  try {
    // Read the repos.json file from environment variable or default path
    const configPath = process.env.REPOS_CONFIG_PATH || 'config/repos.json';
    const reposFilePath = path.isAbsolute(configPath)
      ? configPath
      : path.join(__dirname, '..', configPath);
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

// Calculate total code lines for a team by analyzing commits from team members
async function calculateTeamTotalCodeLines(org, team, members, startDate, endDate, headers) {
  console.log(`  Calculating code contributions by team members...`);
  const teamDailyCommits = await getTeamDailyCommits(org, team, members, startDate, endDate, headers);

  let totalCodeLines = 0;
  const dailyCodeStats = {};

  // Process commit data into daily stats with individual contributions
  Object.entries(teamDailyCommits).forEach(([date, stats]) => {
    dailyCodeStats[date] = {
      date,
      totalCodeLines: stats.totalLines,
      copilotLines: 0, // Will be filled by Copilot function
      contributions: stats.contributions || [] // Individual contributions with PR/commit info
    };
    totalCodeLines += stats.totalLines;
  });

  return {
    totalCodeLines,
    dailyCodeStats
  };
}

// Calculate total Copilot lines for a team using GitHub Copilot metrics
async function calculateTeamCopilotTotalLines(org, team, startDate, endDate, headers) {
  console.log(`  Getting team Copilot metrics...`);
  const copilotMetrics = await getTeamCopilotMetrics(org, team.slug, startDate, endDate, headers);

  let totalCopilotLines = 0;
  const dailyCopilotStats = {};

  // Process Copilot daily metrics
  if (copilotMetrics.success && copilotMetrics.dailyMetrics.length > 0) {
    copilotMetrics.dailyMetrics.forEach(dayMetric => {
      const date = dayMetric.date;
      dailyCopilotStats[date] = {
        date,
        copilotLines: dayMetric.total_code_lines_accepted || 0
      };
      totalCopilotLines += dayMetric.total_code_lines_accepted || 0;
    });
  }

  return {
    totalCopilotLines,
    dailyCopilotStats
  };
}

// Calculate per-team daily statistics combining code changes and Copilot metrics
async function calculateTeamDailyStats(org, teams, startDate, endDate, headers) {
  console.log('\n=== Calculating per-team daily statistics ===');

  const teamStats = {};

  for (const team of teams) {
    console.log(`\nProcessing team: ${team.name} (${team.slug})`);

    // Get team members
    const members = await getTeamMembers(team.slug, org, headers);
    console.log(`  Team has ${members.length} members`);

    // Calculate total code lines
    const codeStats = await calculateTeamTotalCodeLines(org, team, members, startDate, endDate, headers);

    // Calculate total Copilot lines
    const copilotStats = await calculateTeamCopilotTotalLines(org, team, startDate, endDate, headers);

    // Merge daily stats from both sources
    const allDates = new Set([
      ...Object.keys(codeStats.dailyCodeStats),
      ...Object.keys(copilotStats.dailyCopilotStats)
    ]);

    // Initialize team stats with daily breakdown
    teamStats[team.name] = {
      slug: team.slug,
      members: members.length,
      dailyStats: {},
      totalCodeLines: codeStats.totalCodeLines,
      totalCopilotLines: copilotStats.totalCopilotLines
    };    // Build daily stats with proper structure
    allDates.forEach(date => {
      const dailyCodeLines = codeStats.dailyCodeStats[date]?.totalCodeLines || 0;
      const dailyCopilotLines = copilotStats.dailyCopilotStats[date]?.copilotLines || 0;
      const contributions = codeStats.dailyCodeStats[date]?.contributions || [];

      teamStats[team.name].dailyStats[date] = {
        date,
        totalCodeLines: dailyCodeLines,
        totalCopilotLines: dailyCopilotLines,
        copilotLines: dailyCopilotLines, // Keep for backward compatibility
        contributions: contributions // Individual contributions with PR/commit info
      };
    });

    console.log(`  Team ${team.name}: ${teamStats[team.name].totalCodeLines} total code lines, ${teamStats[team.name].totalCopilotLines} total Copilot lines across ${allDates.size} days`);
  }

  return teamStats;
}

// Get daily commit statistics for team members across all repositories
async function getTeamDailyCommits(org, team, members, startDate, endDate, headers) {
  const dailyStats = {};

  try {
    // Get all repositories to analyze
    const repos = await getAllRepos(org, headers);

    for (const repo of repos) {
      console.log(`    Analyzing commits in ${repo}...`);

      // Get commits from this repository within the date range
      const repoCommits = await getRepoCommitsForTeam(org, repo, members, startDate, endDate, headers);

      // Aggregate daily statistics
      repoCommits.forEach(commit => {
        const date = commit.date;
        if (!dailyStats[date]) {
          dailyStats[date] = {
            totalLines: 0,
            commits: 0,
            contributions: []
          };
        }
        dailyStats[date].totalLines += commit.additions + commit.deletions;
        dailyStats[date].commits += 1;

        // Track individual contributions
        dailyStats[date].contributions.push({
          author: commit.author,
          additions: commit.additions,
          deletions: commit.deletions,
          totalLines: commit.additions + commit.deletions,
          commitSha: commit.sha,
          repository: repo,
          message: commit.message
        });
      });
    }
  } catch (error) {
    console.error(`❌ Error calculating team commits: ${error.message}`);
  }

  return dailyStats;
}

// Get commits from a repository filtered by team members and date range
async function getRepoCommitsForTeam(org, repo, teamMembers, startDate, endDate, headers) {
  try {
    const url = `https://api.github.com/repos/${org}/${repo}/commits`;
    const params = {
      per_page: 100
    };

    // Add date filters in ISO format for GitHub API
    if (startDate) {
      params.since = new Date(startDate).toISOString();
    }
    if (endDate) {
      // End of day for the end date
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      params.until = endDateTime.toISOString();
    }

    const commits = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages && page <= 5) { // Limit to 5 pages to avoid too many API calls
      try {
        const response = await axios.get(url, {
          headers,
          params: { ...params, page }
        });

        if (response.data.length === 0) {
          hasMorePages = false;
          break;
        }

        // Filter commits by team members and get detailed stats
        for (const commit of response.data) {
          const author = commit.author ? commit.author.login : commit.commit.author.email;

          // Check if commit author is in the team (or include all if teamMembers is empty)
          if (teamMembers.length === 0 || teamMembers.includes(author)) {
            try {
              // Get detailed commit info to get line changes
              const detailUrl = `https://api.github.com/repos/${org}/${repo}/commits/${commit.sha}`;
              const detailResponse = await axios.get(detailUrl, { headers });

              const commitDate = commit.commit.author.date.split('T')[0]; // Extract YYYY-MM-DD

              commits.push({
                sha: commit.sha,
                author: author,
                date: commitDate,
                additions: detailResponse.data.stats ? detailResponse.data.stats.additions : 0,
                deletions: detailResponse.data.stats ? detailResponse.data.stats.deletions : 0,
                message: commit.commit.message
              });
            } catch (detailError) {
              // Skip this commit if we can't get details
              console.error(`❌ Skipping commit ${commit.sha}: ${detailError.message}`);
            }
          }
        }

        hasMorePages = response.data.length === params.per_page;
        page++;
      } catch (error) {
        console.error(`❌ Error fetching commits page ${page}: ${error.message}`);
        hasMorePages = false;
      }
    }

    return commits;
  } catch (error) {
    console.error(`❌ Error fetching commits for ${repo}: ${error.message}`);
    return [];
  }
}

// Display team statistics in a formatted table
function displayTeamStatsTable(teamStats, startDate, endDate) {
  console.log('\n=== TEAM DAILY STATISTICS REPORT ===');
  console.log(`Date Range: ${startDate || 'All time'} to ${endDate || 'Present'}`);
  console.log('');

  // Get all unique dates across all teams
  const allDates = new Set();
  Object.values(teamStats).forEach(team => {
    Object.keys(team.dailyStats).forEach(date => allDates.add(date));
  });

  const sortedDates = Array.from(allDates).sort();

  if (sortedDates.length === 0) {
    console.log('No daily statistics available for the specified date range.');
    return;
  }

  // Display summary table
  console.log('TEAM SUMMARY:');
  console.log('┌─────────────────────────┬─────────┬──────────────────┬─────────────────┬─────────────┐');
  console.log('│ Team Name               │ Members │ Total Code Lines │ Total AI Lines  │ AI %        │');
  console.log('├─────────────────────────┼─────────┼──────────────────┼─────────────────┼─────────────┤');

  Object.entries(teamStats).forEach(([teamName, stats]) => {
    const name = teamName.padEnd(23);
    const members = stats.members.toString().padStart(7);
    const totalCode = stats.totalCodeLines.toString().padStart(16);
    const totalAI = stats.totalCopilotLines.toString().padStart(15);
    const aiPercentage = stats.totalCodeLines > 0 ?
      ((stats.totalCopilotLines / stats.totalCodeLines) * 100).toFixed(1) + '%' :
      '0.0%';
    const aiPercent = aiPercentage.padStart(11);
    console.log(`│ ${name} │ ${members} │ ${totalCode} │ ${totalAI} │ ${aiPercent} │`);
  });

  console.log('└─────────────────────────┴─────────┴──────────────────┴─────────────────┴─────────────┘');

  // Display daily breakdown if we have data
  if (sortedDates.length > 0) {
    console.log('\nDAILY BREAKDOWN:');
    console.log('┌────────────┬─────────────────────────┬──────────────────┬─────────────────┬─────────────┬──────────────┬────────────────────┐');
    console.log('│ Date       │ Team Name               │ Total Code Lines │ AI Lines        │ AI %        │ Commit ID    │ Contributor        │');
    console.log('├────────────┼─────────────────────────┼──────────────────┼─────────────────┼─────────────┼──────────────┼────────────────────┤');

    // Tracking variables for grand totals
    let grandTotalCodeLines = 0;
    let grandTotalAiLines = 0;

    sortedDates.forEach((date, dateIndex) => {
      // Tracking variables for daily subtotals
      let dailyTotalCodeLines = 0;
      let dailyTotalAiLines = 0;

      Object.entries(teamStats).forEach(([teamName, stats]) => {
        const dayStats = stats.dailyStats[date];
        if (dayStats && dayStats.contributions && dayStats.contributions.length > 0) {
          // Display each contribution as a separate row
          dayStats.contributions.forEach((contribution, index) => {
            const dateStr = (index === 0) ? date.padEnd(10) : ''.padEnd(10);
            const name = (index === 0) ? teamName.padEnd(23) : ''.padEnd(23);

            // Show individual contribution lines for this commit
            const individualLines = contribution.totalLines;
            const totalCode = individualLines.toString().padStart(16);

            // For AI lines, we'll estimate based on the individual contribution
            // and the team's daily AI percentage
            const teamAiRatio = dayStats.totalCodeLines > 0 ? (dayStats.copilotLines / dayStats.totalCodeLines) : 0;
            const estimatedAiLines = Math.round(individualLines * teamAiRatio);
            const aiLines = estimatedAiLines.toString().padStart(15);

            // Calculate AI percentage for this individual contribution
            const individualAiPercentage = individualLines > 0 ?
              ((estimatedAiLines / individualLines) * 100).toFixed(1) + '%' :
              '0.0%';
            const aiPercent = individualAiPercentage.padStart(11);

            // Commit ID (use commit SHA, truncated)
            const commitId = contribution.commitSha.substring(0, 8).padEnd(12);

            // Contributor name
            const contributorName = contribution.author.substring(0, 18).padEnd(18);

            console.log(`│ ${dateStr} │ ${name} │ ${totalCode} │ ${aiLines} │ ${aiPercent} │ ${commitId} │ ${contributorName} │`);

            // Add to daily totals
            dailyTotalCodeLines += individualLines;
            dailyTotalAiLines += estimatedAiLines;
          });
        } else if (dayStats && dayStats.totalCodeLines > 0) {
          // Show summary row if no individual contributions are available but we have totals
          const dateStr = date.padEnd(10);
          const name = teamName.padEnd(23);
          const totalCode = dayStats.totalCodeLines.toString().padStart(16);
          const aiLines = dayStats.copilotLines.toString().padStart(15);

          // Calculate daily AI percentage
          const dailyAiPercentage = dayStats.totalCodeLines > 0 ?
            ((dayStats.copilotLines / dayStats.totalCodeLines) * 100).toFixed(1) + '%' :
            '0.0%';
          const aiPercent = dailyAiPercentage.padStart(11);

          const commitId = 'N/A'.padEnd(12);
          const contributorName = 'Multiple/Unknown'.padEnd(18);

          console.log(`│ ${dateStr} │ ${name} │ ${totalCode} │ ${aiLines} │ ${aiPercent} │ ${commitId} │ ${contributorName} │`);

          // Add to daily totals
          dailyTotalCodeLines += dayStats.totalCodeLines;
          dailyTotalAiLines += dayStats.copilotLines;
        }
      });

      // Display daily subtotal
      if (dailyTotalCodeLines > 0) {
        const subtotalAiPercentage = dailyTotalCodeLines > 0 ?
          ((dailyTotalAiLines / dailyTotalCodeLines) * 100).toFixed(1) + '%' :
          '0.0%';

        console.log('├────────────┼─────────────────────────┼──────────────────┼─────────────────┼─────────────┼──────────────┼────────────────────┤');
        console.log(`│ ${date.padEnd(10)} │ ${'** DAILY SUBTOTAL **'.padEnd(23)} │ ${dailyTotalCodeLines.toString().padStart(16)} │ ${dailyTotalAiLines.toString().padStart(15)} │ ${subtotalAiPercentage.padStart(11)} │ ${'-'.padEnd(12)} │ ${'-'.padEnd(18)} │`);

        // Add separator line between days (except for the last day)
        if (dateIndex < sortedDates.length - 1) {
          console.log('├────────────┼─────────────────────────┼──────────────────┼─────────────────┼─────────────┼──────────────┼────────────────────┤');
        }

        // Add to grand totals
        grandTotalCodeLines += dailyTotalCodeLines;
        grandTotalAiLines += dailyTotalAiLines;
      }
    });

    // Display grand total
    if (grandTotalCodeLines > 0) {
      const grandTotalAiPercentage = grandTotalCodeLines > 0 ?
        ((grandTotalAiLines / grandTotalCodeLines) * 100).toFixed(1) + '%' :
        '0.0%';

      console.log('├────────────┼─────────────────────────┼──────────────────┼─────────────────┼─────────────┼──────────────┼────────────────────┤');
      console.log(`│ ${'ALL DATES'.padEnd(10)} │ ${'*** GRAND TOTAL ***'.padEnd(23)} │ ${grandTotalCodeLines.toString().padStart(16)} │ ${grandTotalAiLines.toString().padStart(15)} │ ${grandTotalAiPercentage.padStart(11)} │ ${'-'.padEnd(12)} │ ${'-'.padEnd(18)} │`);
    }

    console.log('└────────────┴─────────────────────────┴──────────────────┴─────────────────┴─────────────┴──────────────┴────────────────────┘');
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
  getTeamCopilotMetrics,
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
  getRepoBranch,
  calculateTeamTotalCodeLines,
  calculateTeamCopilotTotalLines,
  calculateTeamDailyStats,
  displayTeamStatsTable,
  getTeamDailyCommits,
  getRepoCommitsForTeam
};