#!/usr/bin/env node

/**
 * Consolidate Daily Batches CSV Script
 * 
 * This script consolidates all CSV files from the daily-batches folder
 * into a single comprehensive CSV file.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class DailyBatchConsolidator {
    constructor() {
        this.dailyBatchesDir = path.join(__dirname, '..', 'output', 'daily-batches');
        this.outputDir = path.join(__dirname, '..', 'output');
        this.outputFile = path.join(this.outputDir, 'consolidated_daily_batches.csv');
        this.allData = [];
    }

    async consolidateFiles() {
        console.log('🔄 Starting daily batch consolidation...');
        console.log(`📁 Reading from: ${this.dailyBatchesDir}`);
        console.log(`📝 Output file: ${this.outputFile}`);

        try {
            // Get all CSV files in the daily-batches directory
            const files = fs.readdirSync(this.dailyBatchesDir)
                .filter(file => file.endsWith('.csv'))
                .sort(); // Sort files chronologically

            console.log(`📊 Found ${files.length} CSV files to consolidate`);

            // Process each file
            for (const file of files) {
                const filePath = path.join(this.dailyBatchesDir, file);
                console.log(`📖 Processing: ${file}`);
                await this.processFile(filePath);
            }

            // Sort all data by date for chronological order
            this.allData.sort((a, b) => {
                const dateA = new Date(a.Date);
                const dateB = new Date(b.Date);
                return dateA - dateB;
            });

            // Write consolidated data to output file
            await this.writeConsolidatedFile();

            console.log(`✅ Consolidation complete!`);
            console.log(`📊 Total records: ${this.allData.length.toLocaleString()}`);
            console.log(`📝 Output file: ${this.outputFile}`);

            // Display summary statistics
            this.displaySummary();

        } catch (error) {
            console.error('❌ Error during consolidation:', error);
            process.exit(1);
        }
    }

    processFile(filePath) {
        return new Promise((resolve, reject) => {
            const fileData = [];

            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Clean and validate the row data
                    const cleanedRow = this.cleanRowData(row);
                    if (cleanedRow) {
                        fileData.push(cleanedRow);
                    }
                })
                .on('end', () => {
                    this.allData.push(...fileData);
                    console.log(`   ✓ Added ${fileData.length} records from ${path.basename(filePath)}`);
                    resolve();
                })
                .on('error', (error) => {
                    console.error(`   ❌ Error reading ${filePath}:`, error);
                    reject(error);
                });
        });
    }

    cleanRowData(row) {
        try {
            // Clean and standardize the data
            return {
                Date: row.Date?.replace(/"/g, '') || '',
                Team: row.Team?.replace(/"/g, '') || '',
                TeamSlug: row.TeamSlug?.replace(/"/g, '') || '',
                TeamMembers: parseInt(row.TeamMembers) || 0,
                Repository: row.Repository?.replace(/"/g, '') || '',
                Contributor: row.Contributor?.replace(/"/g, '') || '',
                CommitSHA: row.CommitSHA?.replace(/"/g, '') || '',
                CommitMessage: row.CommitMessage?.replace(/"/g, '') || '',
                CodeLines: parseInt(row.CodeLines) || 0,
                AILines: parseInt(row.AILines) || 0,
                AIPercentage: row.AIPercentage?.replace(/["%]/g, '') || '0',
                Additions: parseInt(row.Additions) || 0,
                Deletions: parseInt(row.Deletions) || 0,
                TotalChanges: parseInt(row.TotalChanges) || 0
            };
        } catch (error) {
            console.warn(`   ⚠️  Skipping invalid row:`, error.message);
            return null;
        }
    }

    async writeConsolidatedFile() {
        const csvWriter = createCsvWriter({
            path: this.outputFile,
            header: [
                { id: 'Date', title: 'Date' },
                { id: 'Team', title: 'Team' },
                { id: 'TeamSlug', title: 'TeamSlug' },
                { id: 'TeamMembers', title: 'TeamMembers' },
                { id: 'Repository', title: 'Repository' },
                { id: 'Contributor', title: 'Contributor' },
                { id: 'CommitSHA', title: 'CommitSHA' },
                { id: 'CommitMessage', title: 'CommitMessage' },
                { id: 'CodeLines', title: 'CodeLines' },
                { id: 'AILines', title: 'AILines' },
                { id: 'AIPercentage', title: 'AIPercentage' },
                { id: 'Additions', title: 'Additions' },
                { id: 'Deletions', title: 'Deletions' },
                { id: 'TotalChanges', title: 'TotalChanges' }
            ]
        });

        await csvWriter.writeRecords(this.allData);
    }

    displaySummary() {
        const dateRange = this.getDateRange();
        const teams = new Set(this.allData.map(row => row.Team));
        const contributors = new Set(this.allData.map(row => row.Contributor));
        const repositories = new Set(this.allData.map(row => row.Repository));

        const totalCodeLines = this.allData.reduce((sum, row) => sum + row.CodeLines, 0);
        const totalAILines = this.allData.reduce((sum, row) => sum + row.AILines, 0);
        const avgAIPercentage = totalCodeLines > 0 ? (totalAILines / totalCodeLines * 100) : 0;

        console.log('\n📊 CONSOLIDATION SUMMARY');
        console.log('═'.repeat(50));
        console.log(`📅 Date Range: ${dateRange.start} to ${dateRange.end}`);
        console.log(`🏢 Teams: ${teams.size}`);
        console.log(`👥 Contributors: ${contributors.size}`);
        console.log(`📦 Repositories: ${repositories.size}`);
        console.log(`📝 Total Commits: ${this.allData.length.toLocaleString()}`);
        console.log(`💻 Total Code Lines: ${totalCodeLines.toLocaleString()}`);
        console.log(`🤖 Total AI Lines: ${totalAILines.toLocaleString()}`);
        console.log(`📊 Average AI Assistance: ${avgAIPercentage.toFixed(1)}%`);
        console.log('═'.repeat(50));
    }

    getDateRange() {
        const dates = this.allData.map(row => new Date(row.Date)).sort((a, b) => a - b);
        return {
            start: dates[0]?.toISOString().split('T')[0] || 'N/A',
            end: dates[dates.length - 1]?.toISOString().split('T')[0] || 'N/A'
        };
    }
}

// Check if csv-writer is available, if not, provide installation instructions
async function checkDependencies() {
    try {
        require('csv-writer');
        require('csv-parser');
    } catch (error) {
        console.log('📦 Installing required dependencies...');
        const { execSync } = require('child_process');
        try {
            execSync('npm install csv-writer csv-parser', { stdio: 'inherit' });
            console.log('✅ Dependencies installed successfully');
        } catch (installError) {
            console.error('❌ Failed to install dependencies. Please run:');
            console.error('npm install csv-writer csv-parser');
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    await checkDependencies();

    const consolidator = new DailyBatchConsolidator();
    await consolidator.consolidateFiles();
}

// Run the script if called directly
if (require.main === module) {
    console.log('🚀 Starting consolidation script...');
    main().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = DailyBatchConsolidator;
