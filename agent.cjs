const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// CONFIGURATION
const RESPONSE_FILE = 'response.txt';
const FILES_FLAG = 'FILES_FLAG';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function runCommand(command) {
    try {
        execSync(command, { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Robustly parses code blocks and identifies target file paths.
 */
function parseCodeBlocks(text) {
    const lines = text.split(/\r?\n/);
    const blocks = [];

    let insideBlock = false;
    let currentPath = null;
    let lastSeenHeader = null; 
    let currentContent = [];
    let captureFence = '';

    const startBlockRegex = /^(`{3,})(.*)$/;
    const headerRegex = /^#*\s*`?([\w\.\/\-\\@]+\.[a-z0-9]+)`?/i;
    // Regex for first-line comments: // path/to/file.js
    const commentPathRegex = /^\s*(?:\/\/|\/\*|#|--)\s*([\w\.\/\-\\@]+\.[a-z0-9]+)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!insideBlock) {
            // 1. Check for standalone file paths or headers before a block
            const headerMatch = line.match(headerRegex);
            if (headerMatch) {
                lastSeenHeader = headerMatch[1];
            }

            const match = line.match(startBlockRegex);
            if (match) {
                const fence = match[1];
                const infoString = match[2].trim();
                let extractedPath = '';
                
                // 2. Check info string: ```typescript:path/to/file.ts
                if (infoString.includes(':')) {
                    extractedPath = infoString.split(':')[1].trim();
                } else {
                    const parts = infoString.split(/\s+/);
                    const potential = parts.find(p => p.includes('/') || p.includes('.'));
                    if (potential) extractedPath = potential;
                }

                // 3. Fallback to the header immediately preceding the block
                if (!extractedPath && lastSeenHeader) {
                    extractedPath = lastSeenHeader;
                }

                // 4. Fallback: Peek at the NEXT line for a comment-style path
                let shouldSkipNextLine = false;
                if (!extractedPath && i + 1 < lines.length) {
                    const nextLineMatch = lines[i + 1].match(commentPathRegex);
                    if (nextLineMatch) {
                        extractedPath = nextLineMatch[1];
                        shouldSkipNextLine = true; 
                    }
                }

                if (extractedPath) {
                    insideBlock = true;
                    currentPath = extractedPath.replace(/['"`]/g, '').trim();
                    captureFence = fence;
                    currentContent = [];
                    lastSeenHeader = null; // Reset for next block
                    if (shouldSkipNextLine) i++; // Consume the path comment line
                    continue;
                }
            }
        } else {
            // Logic to find the closing fence
            const potentialEnd = line.trim();
            if (potentialEnd.startsWith(captureFence) && potentialEnd.replace(/`/g, '') === '') {
                blocks.push({
                    path: currentPath,
                    content: currentContent.join('\n')
                });
                insideBlock = false;
                currentPath = null;
                captureFence = '';
                currentContent = [];
            } else {
                currentContent.push(line);
            }
        }
    }

    return blocks;
}

async function main() {
    console.log("🤖 \x1b[36mAgent Code Applicator (Enhanced Parser)\x1b[0m");

    if (!fs.existsSync(RESPONSE_FILE)) {
        console.error(`❌ Error: Could not find ${RESPONSE_FILE}`);
        process.exit(1);
    }
    const rawText = fs.readFileSync(RESPONSE_FILE, 'utf-8');

    const contentToParse = rawText.includes(FILES_FLAG) 
        ? rawText.split(FILES_FLAG)[1] 
        : rawText;

    const filesToUpdate = parseCodeBlocks(contentToParse);

    if (filesToUpdate.length === 0) {
        console.log("⚠️  No valid code blocks found.");
        console.log("Supported formats:\n  - ### `path/to/file.js`\\n```\n  - ```lang:path/to/file.js\n  - ```lang\\n// path/to/file.js");
        process.exit(0);
    }

    console.log(`\nFound ${filesToUpdate.length} file blocks to update.`);

    if (!fs.existsSync('.git')) {
        console.error("❌ Error: Not a git repository. Please run 'git init' first.");
        process.exit(1);
    }

    console.log("\n💾 \x1b[33mCreating Git Checkpoint...\x1b[0m");
    try {
        runCommand('git add .');
        execSync('git commit -m "Checkpoint: Pre-Agent Update" --no-verify', { stdio: 'pipe' });
        console.log("✅ Checkpoint saved.");
    } catch (e) {
        console.log("ℹ️  Working directory clean or already checkpointed.");
    }

    console.log("\n📝 \x1b[33mWriting files...\x1b[0m");

    filesToUpdate.forEach(file => {
        try {
            const fullPath = path.resolve(process.cwd(), file.path);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, file.content);
            console.log(`   Updated: ${file.path}`);
        } catch (err) {
            console.error(`   ❌ Failed to write ${file.path}: ${err.message}`);
        }
    });

    console.log("\n✅ \x1b[32mUpdates applied!\x1b[0m");

    rl.question('\n❓ Do you want to KEEP these changes? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
            console.log("\n🚀 Changes kept.");
        } else {
            console.log("\nReverting changes...");
            runCommand('git reset --hard HEAD'); 
            runCommand('git clean -fd');
            console.log("🗑️  \x1b[31mChanges discarded.\x1b[0m");
        }
        rl.close();
    });
}

main();