const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(function (line) {
    const at = line.indexOf('=');
    if (at > 0 && !line.trim().startsWith('#') && !process.env[line.slice(0, at).trim()]) process.env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
});

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
let controlDatabase;
function passwordHash(password) { const salt = crypto.randomBytes(16).toString('hex'); return new Promise(function (resolve, reject) { crypto.scrypt(password, salt, 64, function (error, key) { if (error) reject(error); else resolve(`scrypt$${salt}$${key.toString('hex')}`); }); }); }
function passwordMatches(password, stored) { const parts = String(stored || '').split('$'); if (parts.length !== 3 || parts[0] !== 'scrypt') return Promise.resolve(false); return new Promise(function (resolve, reject) { crypto.scrypt(password, parts[1], 64, function (error, key) { if (error) reject(error); else resolve(crypto.timingSafeEqual(Buffer.from(parts[2], 'hex'), key)); }); }); }
function safeTenantIdentifier(companyId) { return `company_${String(companyId).replace(/[^a-f0-9]/gi, '').toLowerCase()}`; }
async function initializeTenantDatabase(db) { await Promise.all([db.collection('franchises').createIndex({ franchiseCode: 1 }, { unique: true }), db.collection('products').createIndex({ productCode: 1 }, { unique: true }), db.collection('inventory').createIndex({ franchiseId: 1, productId: 1 }, { unique: true }), db.collection('orders').createIndex({ orderNumber: 1 }, { unique: true }), db.collection('smart_tips').createIndex({ appliedFranchiseIds: 1, status: 1 }), db.collection('users').createIndex({ email: 1 }, { unique: true }), db.collection('compliance_tasks').createIndex({ franchiseId: 1, ruleKey: 1, periodKey: 1 }, { unique: true }), db.collection('notifications').createIndex({ createdAt: -1 }), db.createCollection('order_items').catch(function (error) { if (error.codeName !== 'NamespaceExists') throw error; })]); return db; }
async function connectDatabase() { await client.connect(); controlDatabase = client.db(process.env.MONGODB_CONTROL_DB || 'franchise_control'); await Promise.all([controlDatabase.collection('admins').createIndex({ email: 1 }, { unique: true }), controlDatabase.collection('companies').createIndex({ email: 1 }, { unique: true }), controlDatabase.collection('companies').createIndex({ databaseIdentifier: 1 }, { unique: true, sparse: true }), controlDatabase.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })]); const admins = controlDatabase.collection('admins'); if (!await admins.findOne({ email: 'admin@example.com' })) await admins.insertOne({ email: 'admin@example.com', name: 'System Administrator', role: 'ADMIN', passwordHash: await passwordHash('Admin@123'), createdAt: new Date() }); console.log('MongoDB central control database connected successfully'); return controlDatabase; }
function getControlDatabase() { if (!controlDatabase) throw new Error('MongoDB is not connected'); return controlDatabase; }
function getTenantDatabase(identifier) { if (!/^company_[a-f0-9]{24}$/.test(String(identifier))) throw new Error('Invalid tenant database identifier'); return client.db(identifier); }
module.exports = { connectDatabase, getControlDatabase, getTenantDatabase, initializeTenantDatabase, safeTenantIdentifier, passwordHash, passwordMatches, getClient: function () { return client; }, ObjectId };
