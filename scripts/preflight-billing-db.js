const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function isCorruptionError(err) {
    if (!err || typeof err.message !== 'string') {
        return false;
    }

    const message = err.message.toLowerCase();
    return message.includes('sqlite_corrupt')
        || message.includes('database disk image is malformed')
        || message.includes('file is not a database');
}

function closeDb(db) {
    return new Promise((resolve) => {
        if (!db) {
            resolve();
            return;
        }

        db.close(() => {
            resolve();
        });
    });
}

function quarantineCorruptedDatabase(dbPath) {
    const dataDir = path.dirname(dbPath);
    const quarantineDir = path.join(dataDir, 'corrupt-backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const files = [
        dbPath,
        `${dbPath}-wal`,
        `${dbPath}-shm`
    ];

    if (!fs.existsSync(quarantineDir)) {
        fs.mkdirSync(quarantineDir, { recursive: true });
    }

    files.forEach((sourcePath) => {
        if (!fs.existsSync(sourcePath)) {
            return;
        }

        const destinationPath = path.join(
            quarantineDir,
            `${path.basename(sourcePath)}.${timestamp}.corrupt`
        );

        fs.renameSync(sourcePath, destinationPath);
    });
}

async function checkIntegrity(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (openErr) => {
            if (openErr) {
                closeDb(db).then(() => {
                    if (isCorruptionError(openErr)) {
                        resolve({ healthy: false, detail: openErr.message });
                        return;
                    }

                    reject(openErr);
                });
                return;
            }

            db.get('PRAGMA integrity_check', (integrityErr, row) => {
                const integrityResult = row && typeof row.integrity_check === 'string'
                    ? row.integrity_check.trim().toLowerCase()
                    : '';
                const isHealthy = !integrityErr && integrityResult === 'ok';
                const detail = integrityErr
                    ? integrityErr.message
                    : `integrity_check=${integrityResult || 'unknown'}`;

                closeDb(db).then(() => {
                    resolve({ healthy: isHealthy, detail });
                });
            });
        });
    });
}

async function run() {
    const dbPath = path.join(__dirname, '..', 'data', 'billing.db');

    if (!fs.existsSync(dbPath)) {
        process.exit(0);
    }

    const integrity = await checkIntegrity(dbPath);
    if (integrity.healthy) {
        process.exit(0);
    }

    console.error(`[DB-PREFLIGHT] Corrupted billing DB detected: ${integrity.detail}`);
    quarantineCorruptedDatabase(dbPath);
    console.error('[DB-PREFLIGHT] Corrupted DB files moved to data/corrupt-backups. Fresh DB will be recreated at startup.');
    process.exit(0);
}

run().catch((error) => {
    console.error('[DB-PREFLIGHT] Failed to run billing DB preflight:', error.message || error);
    process.exit(1);
});
