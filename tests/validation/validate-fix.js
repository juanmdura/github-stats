/**
 * Quick validation script to test the team aggregation fix
 */

const fs = require('fs');
const path = require('path');

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((header, index) => {
            let value = values[index] || '';
            value = value.replace(/"/g, '').trim();

            // Try to convert to number if it looks like one
            if (/^\d+\.?\d*$/.test(value)) {
                row[header] = parseFloat(value);
            } else if (/^\d+$/.test(value)) {
                row[header] = parseInt(value);
            } else {
                row[header] = value;
            }
        });
        return row;
    });
}

function aggregateTeamDataWithMaxAI(data) {
    const uniqueCommits = new Map();
    const teamStats = {};

    console.log(`Processing ${data.length} total records...`);

    // First pass: collect unique commits with maximum AI assistance
    data.forEach(row => {
        const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
        const codeLines = parseInt(row.CodeLines) || 0;
        const aiLines = parseInt(row.AILines) || 0;

        // If commit already exists, keep the one with higher AI assistance
        if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
            const existing = uniqueCommits.get(commitKey);
            if (existing && existing.aiLines !== aiLines) {
                console.log(`Duplicate commit found: ${commitKey}`);
                console.log(`  Previous: ${existing.aiLines} AI lines in team ${existing.team}`);
                console.log(`  New: ${aiLines} AI lines in team ${row.Team}`);
                console.log(`  Keeping: ${aiLines > existing.aiLines ? 'New' : 'Previous'}`);
            }

            uniqueCommits.set(commitKey, {
                codeLines: codeLines,
                aiLines: aiLines,
                team: row.Team,
                contributor: row.Contributor
            });
        }
    });

    console.log(`After deduplication: ${uniqueCommits.size} unique commits`);

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

    // Convert Sets to sizes and calculate AI percentages
    Object.keys(teamStats).forEach(team => {
        const stats = teamStats[team];
        stats.contributorCount = stats.contributors.size;
        stats.aiPercentage = stats.totalCodeLines > 0
            ? (stats.totalAILines / stats.totalCodeLines * 100)
            : 0;

        // Clean up Sets for display
        delete stats.contributors;
    });

    return teamStats;
}

// Main execution
try {
    const csvPath = path.join(__dirname, 'output/consolidated_daily_batches.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const data = parseCSV(csvContent);

    console.log('=== Team Aggregation Validation ===\n');

    const teamStats = aggregateTeamDataWithMaxAI(data);

    console.log('\n=== Team Statistics ===');
    Object.entries(teamStats).forEach(([team, stats]) => {
        console.log(`\n${team}:`);
        console.log(`  Total Code Lines: ${stats.totalCodeLines.toLocaleString()}`);
        console.log(`  Total AI Lines: ${stats.totalAILines.toLocaleString()}`);
        console.log(`  AI Percentage: ${stats.aiPercentage.toFixed(2)}%`);
        console.log(`  Commits: ${stats.commits}`);
        console.log(`  Contributors: ${stats.contributorCount}`);
    });

    // Specific check for carloslizama17
    console.log('\n=== Carlos Lizama17 Analysis ===');
    const carlosCommits = data.filter(row => row.Contributor === 'carloslizama17');
    console.log(`Total carlos records: ${carlosCommits.length}`);

    const carlosTeams = new Set(carlosCommits.map(c => c.Team));
    console.log(`Teams carlos appears in: ${Array.from(carlosTeams).join(', ')}`);

    // Check for duplicate commits
    const carlosCommitGroups = {};
    carlosCommits.forEach(commit => {
        const key = commit.CommitSHA;
        if (!carlosCommitGroups[key]) {
            carlosCommitGroups[key] = [];
        }
        carlosCommitGroups[key].push(commit);
    });

    const duplicateCommits = Object.entries(carlosCommitGroups)
        .filter(([sha, commits]) => commits.length > 1);

    console.log(`Duplicate commits for carlos: ${duplicateCommits.length}`);
    duplicateCommits.forEach(([sha, commits]) => {
        console.log(`\nCommit ${sha.substring(0, 8)}:`);
        commits.forEach(commit => {
            console.log(`  Team: ${commit.Team}, AI Lines: ${commit.AILines}, AI %: ${commit.AIPercentage}%`);
        });
    });

} catch (error) {
    console.error('Error:', error.message);
}
