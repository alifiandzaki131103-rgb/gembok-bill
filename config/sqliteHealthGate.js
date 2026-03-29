const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let billingDbHealthPromise = null;

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

async function runIntegrityCheck(dbPath) {
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

    let movedMainDb = false;

    files.forEach((sourcePath) => {
        if (!fs.existsSync(sourcePath)) {
            return;
        }

        const destinationPath = path.join(
            quarantineDir,
            `${path.basename(sourcePath)}.${timestamp}.corrupt`
        );

        fs.renameSync(sourcePath, destinationPath);

        if (sourcePath === dbPath) {
            movedMainDb = true;
        }
    });

    if (!movedMainDb && fs.existsSync(dbPath)) {
        throw new Error(`Failed to quarantine corrupted primary DB file (${dbPath})`);
    }
}

function ensureHealthyBillingDatabase(dbPath, logger, scope) {
    if (billingDbHealthPromise) {
        return billingDbHealthPromise;
    }

    billingDbHealthPromise = (async () => {
        if (!fs.existsSync(dbPath)) {
            return;
        }

        const result = await runIntegrityCheck(dbPath);
        if (result.healthy) {
            return;
        }

        logger.error(`[${scope}] SQLite integrity check failed:`, result.detail);
        quarantineCorruptedDatabase(dbPath);
        logger.error(`[${scope}] Corrupted SQLite database moved to quarantine, fresh DB will be recreated.`);
    })();

    return billingDbHealthPromise;
}

module.exports = {
    ensureHealthyBillingDatabase
};
