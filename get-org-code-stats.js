/**
 * GitHub Organization Code Stats - Utility Functions
 * This file contains all the utility functions needed by the main github-stats-core.js file
 */

const axios = require('axios');

// Define the default teams we want to filter by
const DEFAULT_TARGET_TEAMS = [
  'Consumer Connect',
  'Core Engineering',
  'Data Science',
  'Enterprise Solutions',
  'Flexifleet',
  'Fulfillment',
  'QA Automation'
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
  let page = 1;
  let repos = [];

  try {
    // First try the direct organization endpoint
    console.log(`Fetching repositories for ${org} using organization endpoint...`);
    while (true) {
      console.log(`Fetching page ${page} from org API...`);
      const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}`;
      
      // Log the headers being sent (without showing the full token)
      const authHeader = headers.Authorization || '';
      const token = authHeader.replace('Bearer ', '');
      const tokenForDisplay = token ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}` : 'undefined';
      
      const res = await axios.get(url, { headers });
      
      if (res.data.length === 0) {
        console.log(`No more repositories found on page ${page}`);
        break;
      }
      
      console.log(`Found ${res.data.length} repositories on page ${page}`);
      repos = repos.concat(res.data.map(r => ({
        name: r.name,
        visibility: r.private ? 'private' : 'public',
        pushed_at: r.pushed_at // Store the pushed_at date for sorting
      })));
      page++;
    }
    
    // If no repos found through org API, try the user's repositories that belong to this org
    if (repos.length === 0) {
      console.log(`\nTrying alternative method: fetching user's repositories that belong to ${org}...`);
      page = 1;
      
      while (true) {
        const url = `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,organization_member`;
        const res = await axios.get(url, { headers });
        
        if (res.data.length === 0) break;
        
        // Filter only repos from the specified org
        const orgRepos = res.data
          .filter(repo => repo.owner.login === org || (repo.organization && repo.organization.login === org))
          .map(r => ({
            name: r.name,
            visibility: r.private ? 'private' : 'public',
            pushed_at: r.pushed_at // Store the pushed_at date for sorting
          }));
        
        if (orgRepos.length > 0) {
          console.log(`Found ${orgRepos.length} repositories from org ${org} on page ${page}`);
          repos = repos.concat(orgRepos);
        }
        
        page++;
      }
    }
    
    if (repos.length === 0) {
      console.log('\n=== No repositories found ===');
      console.log('Possible reasons:');
      console.log('1. Your token does not have access to this organization');
      console.log('2. The organization name is incorrect');
      console.log('3. The organization has no repositories');
      console.log('4. All repositories are private and require special access');
      return [];
    } else {
      // Sort repositories by most recently pushed (descending order)
      repos.sort((a, b) => {
        return new Date(b.pushed_at) - new Date(a.pushed_at);
      });
      
      console.log(`\nFound ${repos.length} total repositories in ${org} (sorted by most recently pushed):`);
      repos.forEach(r => {
        const pushedDate = new Date(r.pushed_at).toISOString().split('T')[0];
        console.log(`- ${r.name} (${r.visibility}) - Last pushed: ${pushedDate}`);
      });
      
      return repos.map(r => r.name);
    }
  } catch (error) {
    console.error('Error fetching repositories:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    }
    return [];
  }
}

// Analyze a commit to determine if it likely contains Copilot suggestions
function analyzeCommitForCopilot(commit) {
  // Check for common patterns in commit messages
  const message = commit.commit.message.toLowerCase();
  
  const copilotKeywords = [
    'copilot', 
    'ai suggestion', 
    'ai assist',
    'suggested by ai', 
    'code suggestion',
    'github copilot',
    'ai-generated',
    'ai-assisted',
    'ai generated',
    'ai assisted'
  ];
  
  for (const keyword of copilotKeywords) {
    if (message.includes(keyword)) {
      return {
        isCopilot: true,
        confidence: 'high',
        reason: `Commit message contains "${keyword}"`
      };
    }
  }
  
  // Check for patterns in commit authorship
  if (commit.commit.author && commit.commit.author.email) {
    const email = commit.commit.author.email.toLowerCase();
    if (email.includes('copilot') || email.includes('noreply') || email.includes('automated')) {
      return {
        isCopilot: true, 
        confidence: 'medium',
        reason: 'Commit author email suggests automation'
      };
    }
  }
  
  // Check for common Copilot commit patterns (typically large additions in single commits)
  if (commit.stats && commit.stats.additions > 100 && commit.stats.deletions < 10) {
    return {
      isCopilot: true,
      confidence: 'low',
      reason: 'Large code addition with few deletions (typical Copilot pattern)'
    };
  }
  
  return { isCopilot: false };
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
      
      // Identify commits that might be from Copilot using our analyzer
      copilotData = detailedCommits.filter(commit => {
        const analysis = analyzeCommitForCopilot(commit);
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
    
    // Estimate Copilot contribution if we have commit data
    if (copilotData && copilotData.length > 0) {
      // Rough estimation - assumes equal distribution of lines across commits
      // and that Copilot commits have similar line counts to other commits
      const copilotCommitPercent = copilotData.length / (commitRes?.data?.length || 1);
      copilotLines = Math.round((additions + deletions) * copilotCommitPercent);
      console.log(`  🤖 Found ${copilotData.length} potential Copilot-suggested commits`);
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

// Analyze a PR to determine if it contains AI-assisted code
async function analyzeAICodeInPR(org, repo, pr, headers) {
  try {
    // Check PR title and description for AI indicators
    const hasCopilotKeywords = pr => {
      const copilotKeywords = [
        'copilot', 'ai suggestion', 'ai assist', 'suggested by ai',
        'code suggestion', 'github copilot', 'ai-generated', 
        'ai-assisted', 'ai generated', 'ai assisted'
      ];
      
      const title = pr.title ? pr.title.toLowerCase() : '';
      const body = pr.body ? pr.body.toLowerCase() : '';
      
      for (const keyword of copilotKeywords) {
        if (title.includes(keyword) || body.includes(keyword)) {
          return true;
        }
      }
      return false;
    };
    
    // Get commit information for the PR
    let aiAssisted = false;
    let aiLinesEstimate = 0;
    let reason = '';
    
    if (pr.mergeCommitSha) {
      // Get detailed commit info
      const commitUrl = `https://api.github.com/repos/${org}/${repo}/commits/${pr.mergeCommitSha}`;
      const commitDetails = await axios.get(commitUrl, { headers });
      
      // Check if commit message indicates AI usage
      const commitMsg = commitDetails.data.commit.message.toLowerCase();
      const hasAIKeywordsInCommit = commitMsg.includes('copilot') || 
                                   commitMsg.includes('ai suggestion') || 
                                   commitMsg.includes('ai-generated') ||
                                   commitMsg.includes('ai assisted');
      
      if (hasAIKeywordsInCommit) {
        aiAssisted = true;
        reason = 'AI keywords in commit message';
      } else if (hasCopilotKeywords(pr)) {
        aiAssisted = true;
        reason = 'AI keywords in PR title or description';
      }
      
      // If the PR appears to be AI-assisted, estimate how many lines were AI-generated
      if (aiAssisted) {
        // Conservative estimate: large PRs with many additions are likely to have more AI code
        const totalLines = pr.additions + pr.deletions;
        
        // Different heuristics based on PR size
        if (totalLines > 500) {
          // For large PRs with AI indicators, estimate 70% AI contribution
          aiLinesEstimate = Math.round(totalLines * 0.7);
        } else if (totalLines > 100) {
          // For medium PRs with AI indicators, estimate 50% AI contribution
          aiLinesEstimate = Math.round(totalLines * 0.5);
        } else {
          // For smaller PRs with AI indicators, estimate 30% AI contribution
          aiLinesEstimate = Math.round(totalLines * 0.3);
        }
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

// Export all utility functions for use in github-stats-core.js
module.exports = {
  DEFAULT_TARGET_TEAMS,
  parseArgs,
  validateDate,
  checkToken,
  getAllRepos,
  analyzeCommitForCopilot,
  getRepoStats,
  getOrgTeams,
  getTeamMembers,
  isUserInTargetTeams,
  getRepoContributors,
  checkRepoTeamContribution,
  getRepoMergedPRs,
  getPRDetails,
  analyzeAICodeInPR
};