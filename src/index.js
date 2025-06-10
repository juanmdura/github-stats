#!/usr/bin/env node

/**
 * GitHub Organization Code Stats - Main Entry Point
 * 
 * This script gathers statistics on code contributions for an organization
 * including team-specific contributions and AI-assisted code detection
 */

// Load environment variables from .env file if present
try {
  require('dotenv').config({ path: require('path').join(__dirname, '../env/.env') });
} catch (error) {
  console.log('Note: No .env file found. Using environment variables directly.');
}

const core = require('./github-stats-core');
const { DEFAULT_TARGET_TEAMS, parseArgs } = require('./get-org-code-stats');

// Parse command line arguments
const args = parseArgs();

// IMPORTANT: Use environment variables for sensitive information
// Create a new token at: https://github.com/settings/tokens and set as GITHUB_TOKEN environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required.');
  console.error('Set it with: export GITHUB_TOKEN=your_token_here');
  process.exit(1);
}
const ORG = args.org || process.env.GITHUB_ORG; // Set default org via GITHUB_ORG environment variable

// Date range filter (format: YYYY-MM-DD)
const START_DATE = args.startDate || process.env.START_DATE || null; // e.g., '2023-01-01'
const END_DATE = args.endDate || process.env.END_DATE || null;     // e.g., '2023-12-31'

// Use custom teams from command line or default to predefined teams
const TARGET_TEAMS = args.teams || DEFAULT_TARGET_TEAMS;

// Validate dates if provided
if (START_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(START_DATE)) {
  console.error('Error: Start date must be in YYYY-MM-DD format');
  process.exit(1);
}

if (END_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(END_DATE)) {
  console.error('Error: End date must be in YYYY-MM-DD format');
  process.exit(1);
}

// Run the main script
(async () => {
  await core.collectStats(ORG, START_DATE, END_DATE, TARGET_TEAMS, GITHUB_TOKEN);
})();
