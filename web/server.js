const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

class WebServer {
    constructor(port = 3000) {
        this.port = port;
        this.webDir = __dirname; // Current directory contains web files
        this.outputDir = path.join(__dirname, '..', 'output'); // Go up one level to find output
    }

    start() {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            // Enable CORS for all requests
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // Serve web files
            if (pathname === '/' || pathname === '/index.html') {
                this.serveFile(path.join(this.webDir, 'index.html'), 'text/html', res);
            } else if (pathname === '/dashboard.js') {
                this.serveFile(path.join(this.webDir, 'dashboard.js'), 'application/javascript', res);
            }
            // Serve CSV files from output directory
            else if (pathname.startsWith('/api/csv/')) {
                this.serveCSVFile(pathname, res);
            }
            // List available CSV files
            else if (pathname === '/api/csv-files') {
                this.listCSVFiles(res);
            }
            else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.listen(this.port, () => {
            console.log(`\n🚀 GitHub Stats Dashboard Server started!`);
            console.log(`📊 Open your browser and navigate to: http://localhost:${this.port}`);
            console.log(`📁 Web files: ${this.webDir}`);
            console.log(`📊 CSV data: ${this.outputDir}`);
            console.log(`\nPress Ctrl+C to stop the server.\n`);
        });

        return server;
    }

    serveFile(filePath, contentType, res) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
            }

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    serveCSVFile(pathname, res) {
        // Extract filename from pathname (e.g., /api/csv/filename.csv -> filename.csv)
        const filename = pathname.replace('/api/csv/', '');

        // Check both daily-batches and summary directories
        const possiblePaths = [
            path.join(this.outputDir, 'daily-batches', filename),
            path.join(this.outputDir, 'summary', filename),
            path.join(this.outputDir, filename)
        ];

        let foundPath = null;
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                foundPath = filePath;
                break;
            }
        }

        if (!foundPath) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'CSV file not found' }));
            return;
        }

        fs.readFile(foundPath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Error reading CSV file' }));
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            res.end(data);
        });
    }

    listCSVFiles(res) {
        const csvFiles = {
            dailyBatches: [],
            summary: []
        };

        try {
            // List daily batch files
            const dailyBatchDir = path.join(this.outputDir, 'daily-batches');
            if (fs.existsSync(dailyBatchDir)) {
                csvFiles.dailyBatches = fs.readdirSync(dailyBatchDir)
                    .filter(file => file.endsWith('.csv'))
                    .map(file => ({
                        name: file,
                        path: `/api/csv/${file}`,
                        type: 'daily-batch'
                    }));
            }

            // List summary files
            const summaryDir = path.join(this.outputDir, 'summary');
            if (fs.existsSync(summaryDir)) {
                csvFiles.summary = fs.readdirSync(summaryDir)
                    .filter(file => file.endsWith('.csv'))
                    .map(file => ({
                        name: file,
                        path: `/api/csv/${file}`,
                        type: 'summary'
                    }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(csvFiles));

        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Error listing CSV files' }));
        }
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const server = new WebServer(port);
    server.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down server...');
        process.exit(0);
    });
}

module.exports = WebServer;
