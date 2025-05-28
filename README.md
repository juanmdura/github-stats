# GitHub Organization Code Statistics

This tool calculates total lines of code modified (additions and deletions) across all repositories in a GitHub organization, with filters for teams and date ranges, plus detection of AI-assisted code.

## Features

- Fetches statistics for all repositories in a GitHub organization
- Sorts repositories by most recently pushed (descending order)
- Supports date range filtering to analyze code changes within specific time periods
- Filter repositories by team contributions (only analyze repos with contributors from specified teams)
- Detects and reports GitHub Copilot suggestions (AI-assisted code)
- Shows detailed statistics per repository
- Automatically handles GitHub API pagination and rate limiting
- Validates GitHub token permissions

## Prerequisites

- Node.js
- A GitHub personal access token with the following scopes:
  - `repo` - For accessing repository data 
  - `read:org` - For accessing team membership information

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Set up your GitHub token in the script or as an environment variable.

## Usage

Run the script with optional date filters:

```bash
# Get statistics for all time
node index.js

# Get statistics for a specific date range
node index.js --from 2023-01-01 --to 2023-12-31

# Specify a different organization
node index.js --org MyOrgName --from 2023-01-01

# Filter by specific teams
node index.js --teams "Core Engineering,Data Science" --from 2023-01-01
```

You can also run it using npm:

```bash
npm start -- --from 2023-01-01 --to 2023-12-31 --org MyOrgName
```

### Command Line Options

- `--from DATE`: Start date in YYYY-MM-DD format
- `--to DATE`: End date in YYYY-MM-DD format
- `--org NAME`: GitHub organization name
- `--teams LIST`: Comma-separated list of team names to filter by (e.g., "Core Engineering,Data Science")
- `--help`, `-h`: Show help message

## Output

The script will display:
- Total lines added
- Total lines deleted
- Total lines modified (sum of additions and deletions)
- Estimated lines suggested by GitHub Copilot
- Percentage of code contributed by Copilot
- Statistics broken down by repository

## Code Structure

The codebase is structured as follows:

- `index.js` - Main entry point with command-line argument handling
- `github-stats-core.js` - Core logic implementing the workflow and orchestrating the analysis
- `get-org-code-stats.js` - Utility functions and detailed GitHub API interactions

This modular approach makes the code more maintainable and easier to extend.

## Workflow

The tool follows this sequence:
1. Get all repositories sorted by most recently pushed (descending)
2. Get all PRs merged in the specified time period
3. Filter those PRs by members of configured teams/groups
4. Count lines of code modified in the filtered PRs
5. Count AI-assisted lines in the filtered PRs

## Troubleshooting

If you see zero stats, check:
1. Token permissions (should have `repo` scope)
2. Organization access permissions
3. Whether repositories exist and have commit history
4. Date range filters (if specified)
5. Team filters (if specified)
