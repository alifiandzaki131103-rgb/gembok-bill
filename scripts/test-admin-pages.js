#!/usr/bin/env node

/**
 * Test Admin Pages - Script untuk menguji apakah halaman admin dapat diakses
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

function parsePort(value, fallbackPort) {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallbackPort;
    }

    return parsed;
}

function loadAppSettings() {
    const settingsPath = path.join(__dirname, '..', 'settings.json');

    try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        return {};
    }
}

const appSettings = loadAppSettings();
const testHost = process.env.ADMIN_TEST_HOST || process.env.HOST || appSettings.server_host || 'localhost';
const testPort = parsePort(process.env.ADMIN_TEST_PORT || process.env.PORT || appSettings.server_port, 3005);
const requestTimeoutMs = parsePort(process.env.ADMIN_TEST_TIMEOUT_MS, 10000);

async function testAdminPage(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: testHost,
            port: testPort,
            path: path,
            method: 'GET',
            headers: {
                'Cookie': 'admin_auth=mock_admin_session' // Mock session cookie
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(requestTimeoutMs, () => {
            req.destroy(new Error(`Request timeout after ${requestTimeoutMs}ms`));
        });
        
        req.end();
    });
}

async function testAdminPages() {
    console.log('🔍 Testing admin pages accessibility...\n');
    console.log(`🌐 Target: http://${testHost}:${testPort}`);
    console.log('');
    
    try {
        // Test technicians page
        console.log('🔧 Testing /admin/technicians page...');
        const techniciansResponse = await testAdminPage('/admin/technicians');
        console.log(`   Status Code: ${techniciansResponse.statusCode}`);
        if (techniciansResponse.statusCode === 200) {
            console.log('   ✅ Technicians page is accessible');
        } else if (techniciansResponse.statusCode === 500) {
            console.log('   ❌ Technicians page returns Internal Server Error');
            // Check if it's the join_date error
            if (techniciansResponse.data.includes('join_date')) {
                console.log('   ℹ️  Error is related to join_date column');
            }
        } else {
            console.log(`   ⚠️  Technicians page returns status ${techniciansResponse.statusCode}`);
        }
        
        console.log('');
        
        // Test installations page
        console.log('🔧 Testing /admin/installations page...');
        const installationsResponse = await testAdminPage('/admin/installations');
        console.log(`   Status Code: ${installationsResponse.statusCode}`);
        if (installationsResponse.statusCode === 200) {
            console.log('   ✅ Installations page is accessible');
        } else if (installationsResponse.statusCode === 500) {
            console.log('   ❌ Installations page returns Internal Server Error');
        } else {
            console.log(`   ⚠️  Installations page returns status ${installationsResponse.statusCode}`);
        }
        
        console.log('\n🎉 Admin pages test completed!');
        
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        console.error('❌ Error testing admin pages:', message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    testAdminPages()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Admin pages test failed:', error);
            process.exit(1);
        });
}

module.exports = testAdminPages;
