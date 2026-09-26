const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connectDatabase, getControlDatabase, getTenantDatabase, initializeTenantDatabase, safeTenantIdentifier, passwordHash, passwordMatches, getClient, ObjectId } = require('./db');

const port = Number(process.env.PORT) || 3000;
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
function response(res, status, data, headers) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...(headers || {}) }); res.end(JSON.stringify(data)); }
function invalid(message) { const error = new Error(message); error.status = 400; return error; }
function oid(value, label) { if (!ObjectId.isValid(value) || String(new ObjectId(value)) !== String(value)) throw invalid(`Invalid ${label || 'identifier'}`); return new ObjectId(value); }
function idValues(value) { const text = value && value.toString ? value.toString() : String(value); return ObjectId.isValid(text) && String(new ObjectId(text)) === text ? [new ObjectId(text), text] : [value]; }
function idFilter(value) { return { $in: idValues(value) }; }
function sameId(left, right) { return left !== undefined && left !== null && right !== undefined && right !== null && left.toString() === right.toString(); }
function value(input, label, min) { const result = Number(input); if (!Number.isFinite(result) || (min !== undefined && result < min)) throw invalid(`Invalid ${label}`); return result; }
function required(input, label) { if (!String(input || '').trim()) throw invalid(`${label} is required`); return String(input).trim(); }
/**
 * Validates an Indian mobile number when provided.
 * Accepts exactly 10 digits starting with 6-9 (optionally prefixed with +91).
 * Returns the 10-digit string on success or throws an invalid error.
 * If value is empty/null/undefined returns '' (phone is optional everywhere).
 */
function validatePhone(input, label) {
    if (!input && input !== 0) return ''; // phone is optional
    var digits = String(input).replace(/^\+91/, '').replace(/[\s\-]/g, '');
    if (!/^[6-9][0-9]{9}$/.test(digits)) {
        throw invalid(`${label || 'Phone number'}: Enter a valid 10-digit Indian mobile number (must start with 6, 7, 8, or 9).`);
    }
    return digits;
}
function body(req) { return new Promise(function (resolve, reject) { let content = ''; req.on('data', function (part) { content += part; if (content.length > 1048576) { req.destroy(); reject(invalid('Request body is too large')); } }); req.on('end', function () { if (!content.trim()) return resolve({}); try { resolve(JSON.parse(content)); } catch (_) { reject(invalid('Invalid JSON')); } }); req.on('error', reject); }); }
function output(doc) { if (!doc) return null; const item = { ...doc, id: doc._id.toString(), _id: doc._id.toString() }; ['franchiseId', 'productId'].forEach(function (key) { if (item[key] && item[key].toString) item[key] = item[key].toString(); }); ['productIds', 'appliedFranchiseIds'].forEach(function (key) { if (Array.isArray(item[key])) item[key] = item[key].map(function (id) { return id.toString(); }); }); item.franchise_code = item.franchiseCode; item.owner_name = item.ownerName; item.product_code = item.productCode; item.cost_price = item.costPrice; item.reorder_level = item.reorderLevel; item.order_number = item.orderNumber; item.customer_name = item.customerName; item.customer_phone = item.customerPhone; item.order_date = item.orderDate; return item; }
function identifier(id, codeField) { return ObjectId.isValid(id) && String(new ObjectId(id)) === id ? { _id: idFilter(id) } : { [codeField]: id }; }
function generated(prefix) { return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`; }
function cookie(req, name) { const found = String(req.headers.cookie || '').split(';').map(function (x) { return x.trim().split('='); }).find(function (x) { return x[0] === name; }); return found ? decodeURIComponent(found.slice(1).join('=')) : ''; }
function sessionCookie(id) { return `fms_session=${encodeURIComponent(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function clearSessionCookie() { return 'fms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'; }
function publicUser(account, type) { return { id: account._id.toString(), name: account.name || account.contactPerson, company: account.companyName, email: account.email, role: account.role || type, branchId: account.branchId && account.branchId.toString ? account.branchId.toString() : null, logoUrl: (account.brand && account.brand.logoUrl) || account.logoUrl || '', brand: account.brand || null }; }
async function currentSession(req) { const id = cookie(req, 'fms_session'); if (!id || !/^[a-f0-9]{64}$/.test(id)) return null; return getControlDatabase().collection('sessions').findOne({ token: id, expiresAt: { $gt: new Date() } }); }
async function requireCompany(req) { const session = await currentSession(req); if (!session || !['COMPANY', 'USER'].includes(session.role)) { const error = new Error('Company authentication is required'); error.status = 401; throw error; } const company = await getControlDatabase().collection('companies').findOne({ _id: session.companyId }); if (!company || company.status !== 'APPROVED' || !company.databaseIdentifier) { const error = new Error(company && company.status === 'PENDING' ? 'Your registration is awaiting Admin approval.' : 'Your registration request was rejected.'); error.status = 403; throw error; } const db = getTenantDatabase(company.databaseIdentifier); const user = session.role === 'USER' ? await db.collection('users').findOne({ _id: session.accountId, status: 'ACTIVE' }) : null; if (session.role === 'USER' && !user) { const error = new Error('Your user account is unavailable'); error.status = 403; throw error; } return { session, company, db, actor: user || { _id: company._id, name: company.contactPerson, email: company.email, role: 'COMPANY_ADMIN', logoUrl: (company.brand && company.brand.logoUrl) || company.logoUrl || '' } }; }
async function requireAdmin(req) { const session = await currentSession(req); if (!session || session.role !== 'ADMIN') { const error = new Error('Admin authentication is required'); error.status = 401; throw error; } return session; }
async function createSession(res, role, account, companyId) { const token = crypto.randomBytes(32).toString('hex'); await getControlDatabase().collection('sessions').insertOne({ token, role, accountId: account._id, companyId: companyId || (role === 'COMPANY' ? account._id : null), createdAt: new Date(), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) }); return { 'Set-Cookie': sessionCookie(token) }; }
function management(tenant) { if (!tenant.actor || !['COMPANY_ADMIN', 'BRANCH_ADMIN'].includes(tenant.actor.role)) { const error = new Error('Management permission is required'); error.status = 403; throw error; } }
function periodFor(frequency, now) { const date = now || new Date(); if (frequency === 'DAILY') return date.toISOString().slice(0, 10); if (frequency === 'WEEKLY') { const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7))); return monday.toISOString().slice(0, 10); } return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }
const complianceRules = [{ frequency: 'DAILY', key: 'OPENING_STOCK', title: 'Opening stock verified' }, { frequency: 'DAILY', key: 'CASH_VERIFIED', title: 'Cash verified' }, { frequency: 'DAILY', key: 'INVENTORY_CHECKED', title: 'Inventory checked' }, { frequency: 'WEEKLY', key: 'LOW_STOCK_REVIEW', title: 'Low-stock review' }, { frequency: 'WEEKLY', key: 'DAMAGED_STOCK_REVIEW', title: 'Damaged stock review' }, { frequency: 'WEEKLY', key: 'PENDING_ORDERS', title: 'Pending orders reviewed' }, { frequency: 'MONTHLY', key: 'INVENTORY_AUDIT', title: 'Inventory audit' }, { frequency: 'MONTHLY', key: 'SALES_REPORT', title: 'Sales report generated' }, { frequency: 'MONTHLY', key: 'FRANCHISE_REVIEW', title: 'Franchise review completed' }];
async function ensureComplianceTasks(db) { const now = new Date(), active = await db.collection('franchises').find({ status: 'ACTIVE' }).toArray(); const operations = []; active.forEach(function (franchise) { complianceRules.forEach(function (rule) { const periodKey = periodFor(rule.frequency, now); operations.push({ updateOne: { filter: { franchiseId: franchise._id, ruleKey: rule.key, periodKey }, update: { $setOnInsert: { franchiseId: franchise._id, ruleKey: rule.key, title: rule.title, frequency: rule.frequency, periodKey, status: 'PENDING', dueAt: now, createdAt: now, updatedAt: now } }, upsert: true } }); }); }); if (operations.length) await db.collection('compliance_tasks').bulkWrite(operations, { ordered: false }); }
async function inventoryDetails(records, db) { const [franchises, products] = await Promise.all([db.collection('franchises').find({}).toArray(), db.collection('products').find({}).toArray()]); return records.map(function (record) { const f = franchises.find(function (x) { return sameId(x._id, record.franchiseId); }) || {}; const p = products.find(function (x) { return sameId(x._id, record.productId); }) || {}; return { ...output(record), franchise_id: record.franchiseId.toString(), franchise_name: f.name || '', franchise_code: f.franchiseCode || '', is_main_franchise: Boolean(f.isHeadOffice), product_id: record.productId.toString(), product_name: p.name || '', product_code: p.productCode || '', category: p.category || '', price: p.price || 0, reorder_level: p.reorderLevel || 0 }; }); }
async function ensureFranchiseInventory(db, franchiseId) { const products = await db.collection('products').find({ status: 'ACTIVE' }).toArray(); if (!products.length) return; await db.collection('inventory').bulkWrite(products.map(function (product) { return { updateOne: { filter: { franchiseId, productId: product._id }, update: { $setOnInsert: { franchiseId, productId: product._id, quantity: 0, reservedQuantity: 0, updatedAt: new Date() } }, upsert: true } }; })); }
function orderDetails(records, franchises) { return records.map(function (order) { const destFranchise = franchises.find(function (item) { return sameId(item._id, order.destinationId || order.franchiseId); }) || {}; const sourceFranchise = franchises.find(function (item) { return sameId(item._id, order.sourceId); }) || {}; const isMain = Boolean(sourceFranchise.isHeadOffice || order.sourceIsMain); const sName = order.sourceName || (sourceFranchise.name ? (isMain ? `${sourceFranchise.name} (Main Inventory)` : sourceFranchise.name) : 'Main Inventory'); const dName = order.destinationName || destFranchise.name || 'Franchise Branch'; const tType = order.transferType || (isMain ? 'MAIN_TO_FRANCHISE' : 'FRANCHISE_TO_FRANCHISE'); return { ...output(order), source_id: order.sourceId ? order.sourceId.toString() : (sourceFranchise._id ? sourceFranchise._id.toString() : ''), source_name: sName, source_code: order.sourceCode || sourceFranchise.franchiseCode || '', source_is_main: isMain, destination_id: (order.destinationId || order.franchiseId) ? (order.destinationId || order.franchiseId).toString() : '', destination_name: dName, destination_code: order.destinationCode || destFranchise.franchiseCode || '', transfer_type: tType, is_franchise_to_franchise: tType === 'FRANCHISE_TO_FRANCHISE', franchise_name: dName, franchise_code: order.destinationCode || destFranchise.franchiseCode || '', total_items: (order.items || []).length, item_summary: (order.items || []).map(function (item) { return `${item.productName} (x${item.quantity})`; }).join(', ') }; }); }
async function calculateTipAdjustments(db, franchiseId, lines, session) { const tips = await db.collection('smart_tips').find({ status: 'ACTIVE', appliedFranchiseIds: { $in: idValues(franchiseId) } }, { session }).toArray(); const appliedTips = []; let discount = 0; tips.forEach(function (tip) { const targets = lines.filter(function (line) { return tip.productIds.some(function (productId) { return sameId(productId, line.productId); }); }); if (!targets.length) return; let amount = 0; if (tip.tipType === 'DISCOUNT') amount = targets.reduce(function (sum, line) { return sum + line.totalPrice; }, 0) * (tip.discountPercent / 100); if (tip.tipType === 'COMBO' && tip.productIds.every(function (productId) { return lines.some(function (line) { return sameId(line.productId, productId) && line.quantity > 0; }); })) { const comboBase = tip.productIds.reduce(function (sum, productId) { const line = lines.find(function (item) { return sameId(item.productId, productId); }); return sum + line.unitPrice; }, 0); amount = Math.max(0, comboBase - tip.comboPrice); } appliedTips.push({ tipId: tip._id, title: tip.title, tipType: tip.tipType, productIds: tip.productIds, discountAmount: Number(amount.toFixed(2)), message: tip.tipType === 'OFFER' ? tip.offerText : '' }); discount += amount; }); return { appliedTips, discount: Number(discount.toFixed(2)) }; }
async function createOrder(data, db, session) {
    const destIdInput = data.destinationFranchiseId || data.destination_id || data.franchiseId || data.franchise_id;
    if (!destIdInput) throw invalid('Destination franchise branch is required');
    const destinationId = oid(destIdInput, 'destination franchise ID');
    const destination = await db.collection('franchises').findOne({ _id: idFilter(destinationId), status: 'ACTIVE' }, { session });
    if (!destination) throw invalid('The selected destination franchise is unavailable or inactive');

    const sourceIdInput = data.sourceFranchiseId || data.source_id;
    let source;
    if (sourceIdInput) {
        const sourceId = oid(sourceIdInput, 'source inventory/franchise ID');
        source = await db.collection('franchises').findOne({ _id: idFilter(sourceId), status: 'ACTIVE' }, { session });
        if (!source) throw invalid('The selected source inventory/franchise is unavailable or inactive');
    } else {
        source = await db.collection('franchises').findOne({ isHeadOffice: true, status: 'ACTIVE' }, { session });
        if (!source) source = await db.collection('franchises').findOne({ _id: { $ne: destination._id }, status: 'ACTIVE' }, { session });
        if (!source) source = destination;
    }

    if (sameId(source._id, destination._id)) {
        throw invalid('Source and destination cannot be the same franchise location');
    }

    if (!Array.isArray(data.items) || !data.items.length) throw invalid('An order or transfer needs at least one item');
    const requested = new Map();
    data.items.forEach(function (line) {
        const productId = oid(line.productId || line.product_id, 'product ID');
        const quantity = value(line.quantity, 'quantity', 1);
        const old = requested.get(productId.toString());
        requested.set(productId.toString(), { productId, quantity: quantity + (old ? old.quantity : 0) });
    });

    const lines = [];
    for (const item of requested.values()) {
        const product = await db.collection('products').findOne({ _id: idFilter(item.productId), status: 'ACTIVE' }, { session });
        if (!product) throw invalid('Selected product is unavailable or inactive');
        const stock = await db.collection('inventory').findOne({ franchiseId: idFilter(source._id), productId: idFilter(product._id) }, { session });
        if (!stock) throw invalid(`"${product.name}" does not exist in the selected source (${source.name})`);
        if (stock.quantity < item.quantity) {
            throw invalid(`Insufficient stock for "${product.name}" at ${source.name}. Available: ${stock.quantity}, Requested: ${item.quantity}`);
        }
        lines.push({
            productId: product._id,
            productName: product.name,
            productCode: product.productCode,
            quantity: item.quantity,
            unitPrice: Number(product.price),
            totalPrice: Number(product.price) * item.quantity
        });
    }

    for (const line of lines) {
        const deductResult = await db.collection('inventory').updateOne(
            { franchiseId: idFilter(source._id), productId: idFilter(line.productId), quantity: { $gte: line.quantity } },
            { $inc: { quantity: -line.quantity }, $set: { updatedAt: new Date() } },
            { session }
        );
        if (!deductResult.modifiedCount) throw invalid(`Insufficient inventory for ${line.productName} at ${source.name}`);
        await db.collection('inventory').updateOne(
            { franchiseId: idFilter(destination._id), productId: idFilter(line.productId) },
            { $inc: { quantity: line.quantity }, $set: { updatedAt: new Date() }, $setOnInsert: { franchiseId: destination._id, productId: line.productId, reservedQuantity: 0 } },
            { upsert: true, session }
        );
    }

    const adjustments = await calculateTipAdjustments(db, destination._id, lines, session);
    const baseSubtotal = lines.reduce(function (sum, line) { return sum + line.totalPrice; }, 0);
    const subtotal = Math.max(0, Number((baseSubtotal - adjustments.discount).toFixed(2)));
    const tax = Number((subtotal * 0.18).toFixed(2));
    const now = new Date();
    const isMainSource = Boolean(source.isHeadOffice);
    const transferType = isMainSource ? 'MAIN_TO_FRANCHISE' : 'FRANCHISE_TO_FRANCHISE';

    const order = {
        _id: new ObjectId(),
        orderNumber: generated('ORD'),
        transferType,
        sourceId: source._id,
        sourceName: isMainSource ? `${source.name} (Main Inventory)` : source.name,
        sourceCode: source.franchiseCode,
        sourceIsMain: isMainSource,
        destinationId: destination._id,
        destinationName: destination.name,
        destinationCode: destination.franchiseCode,
        franchiseId: destination._id,
        customerName: String(data.customerName || data.customer_name || 'Enterprise Stock Transfer'),
        customerPhone: validatePhone(data.customerPhone || data.customer_phone, 'Contact phone'),
        orderDate: now,
        status: data.status || 'COMPLETED',
        baseSubtotal,
        discount: adjustments.discount,
        subtotal,
        tax,
        total: subtotal + tax,
        appliedTips: adjustments.appliedTips,
        items: lines,
        createdAt: now,
        updatedAt: now
    };
    await db.collection('orders').insertOne(order, { session });
    return order;
}

async function handleAuth(req, res, id) {
    const data = await body(req), control = getControlDatabase();
    if (id === 'register') {
        const email = required(data.email, 'Email').toLowerCase();
        const phone = validatePhone(data.phone, 'Phone number');
        const account = { companyName: required(data.company, 'Company name'), contactPerson: required(data.name, 'Contact person'), email, phone, address: String(data.address || ''), passwordHash: await passwordHash(required(data.password, 'Password')), status: 'PENDING', setupCompleted: false, setupStep: 0, createdAt: new Date(), updatedAt: new Date() };
        const result = await control.collection('companies').insertOne(account);
        return response(res, 201, { success: true, message: 'Registration submitted. Your registration is awaiting Admin approval.', company: { id: result.insertedId.toString(), companyName: account.companyName, status: account.status } });
    }
    if (id === 'company-login' || id === 'login') {
        const email = required(data.email, 'Email').toLowerCase(), enteredPassword = required(data.password, 'Password');
        const company = await control.collection('companies').findOne({ email });
        if (company) {
            if (!await passwordMatches(enteredPassword, company.passwordHash)) return response(res, 401, { success: false, message: 'Invalid email or password' });
            if (company.status !== 'APPROVED') return response(res, 403, { success: false, message: company.status === 'PENDING' ? 'Your registration is awaiting Admin approval.' : `Your registration request was rejected.${company.rejectionReason ? ` Reason: ${company.rejectionReason}` : ''}` });
            const headers = await createSession(res, 'COMPANY', company); return response(res, 200, { success: true, setupRequired: company.setupCompleted === false, user: publicUser(company, 'COMPANY') }, headers);
        }
        const companies = await control.collection('companies').find({ status: 'APPROVED', databaseIdentifier: { $exists: true } }).toArray();
        for (const owner of companies) { const tenantDb = getTenantDatabase(owner.databaseIdentifier), user = await tenantDb.collection('users').findOne({ email, status: 'ACTIVE' }); if (user && await passwordMatches(enteredPassword, user.passwordHash)) { const headers = await createSession(res, 'USER', user, owner._id); return response(res, 200, { success: true, setupRequired: false, user: publicUser({ ...user, companyName: owner.companyName, logoUrl: (owner.brand && owner.brand.logoUrl) || owner.logoUrl || '' }, 'USER') }, headers); } }
        return response(res, 401, { success: false, message: 'Invalid email or password' });
    }
    if (id === 'admin-login') {
        const admin = await control.collection('admins').findOne({ email: required(data.email, 'Email').toLowerCase() });
        if (!admin || !await passwordMatches(required(data.password, 'Password'), admin.passwordHash)) return response(res, 401, { success: false, message: 'Invalid email or password' });
        const headers = await createSession(res, 'ADMIN', admin); return response(res, 200, { success: true, user: publicUser(admin, 'ADMIN') }, headers);
    }
    if (id === 'me') { const session = await currentSession(req); if (!session) return response(res, 401, { success: false, message: 'Not signed in' }); const account = session.role === 'ADMIN' ? await control.collection('admins').findOne({ _id: session.accountId }) : session.role === 'COMPANY' ? await control.collection('companies').findOne({ _id: session.companyId }) : await getTenantDatabase((await control.collection('companies').findOne({ _id: session.companyId })).databaseIdentifier).collection('users').findOne({ _id: session.accountId }); if (!account || (session.role !== 'ADMIN' && session.role !== 'USER' && account.status !== 'APPROVED')) return response(res, 401, { success: false, message: 'Not signed in' }); return response(res, 200, { success: true, setupRequired: session.role === 'COMPANY' && account.setupCompleted === false, user: publicUser(account, session.role) }); }
    if (id === 'logout') { const token = cookie(req, 'fms_session'); if (token) await control.collection('sessions').deleteOne({ token }); return response(res, 200, { success: true }, { 'Set-Cookie': clearSessionCookie() }); }
    return response(res, 404, { success: false, message: 'Authentication route not found' });
}
async function adminApi(req, res, parts, method) {
    await requireAdmin(req); const control = getControlDatabase(), action = parts[2], companyId = parts[3];
    if (action === 'dashboard' && method === 'GET') {
        const companies = await control.collection('companies').find({}).toArray();
        let franchises = 0;
        for (const company of companies.filter(function (x) { return x.status === 'APPROVED' && x.databaseIdentifier; })) {
            try { franchises += await getTenantDatabase(company.databaseIdentifier).collection('franchises').countDocuments(); } catch (_) {}
        }
        const pending = companies.filter(function (x) { return x.status === 'PENDING'; });
        const approved = companies.filter(function (x) { return x.status === 'APPROVED'; });
        const rejected = companies.filter(function (x) { return x.status === 'REJECTED'; });
        return response(res, 200, {
            success: true,
            data: {
                totalCompanies: companies.length,
                pendingRequests: pending.length,
                approvedCompanies: approved.length,
                rejectedCompanies: rejected.length,
                totalFranchises: franchises,
                recentRequests: pending.slice(0, 4).map(function (c) {
                    return {
                        id: c._id.toString(),
                        companyName: c.companyName,
                        contactPerson: c.contactPerson,
                        email: c.email,
                        phone: c.phone,
                        status: c.status,
                        brand: c.brand || {},
                        logoUrl: (c.brand && c.brand.logoUrl) || c.logoUrl || '',
                        createdAt: c.createdAt
                    };
                })
            }
        });
    }
    if (action === 'companies' && method === 'GET' && !companyId) {
        const statusParam = new URL(req.url, 'http://localhost').searchParams.get('status');
        let filter = {};
        if (statusParam && statusParam.toUpperCase() !== 'ALL') {
            filter.status = statusParam.toUpperCase();
        }
        const records = await control.collection('companies').find(filter).sort({ createdAt: -1 }).toArray();
        const data = await Promise.all(records.map(async function (c) {
            let count = 0;
            let mainFranchise = null;
            if (c.status === 'APPROVED' && c.databaseIdentifier) {
                try {
                    const tenantDb = getTenantDatabase(c.databaseIdentifier);
                    count = await tenantDb.collection('franchises').countDocuments();
                    const hq = await tenantDb.collection('franchises').findOne({ isHeadOffice: true });
                    if (hq) mainFranchise = { name: hq.name, city: hq.city, state: hq.state, franchiseCode: hq.franchiseCode };
                } catch (_) {}
            }
            return {
                id: c._id.toString(),
                companyName: c.companyName,
                contactPerson: c.contactPerson,
                email: c.email,
                phone: c.phone,
                address: c.address,
                status: c.status,
                rejectionReason: c.rejectionReason || '',
                setupCompleted: Boolean(c.setupCompleted),
                databaseIdentifier: c.databaseIdentifier || null,
                createdAt: c.createdAt,
                franchiseCount: count,
                brand: c.brand || {},
                brandName: (c.brand && c.brand.name) || '',
                logoUrl: (c.brand && c.brand.logoUrl) || c.logoUrl || '',
                mainFranchise: mainFranchise,
                mainLocation: mainFranchise ? `${mainFranchise.name} (${mainFranchise.city || ''})` : (c.status === 'APPROVED' ? 'Setup in progress' : 'N/A')
            };
        }));
        return response(res, 200, { success: true, data });
    }
    if (action === 'companies' && companyId) {
        const company = await control.collection('companies').findOne({ _id: oid(companyId, 'company ID') });
        if (!company) return response(res, 404, { success: false, message: 'Company not found' });
        if (method === 'POST' && parts[4] === 'approve') {
            const identifier = company.databaseIdentifier || safeTenantIdentifier(company._id);
            await initializeTenantDatabase(getTenantDatabase(identifier));
            await control.collection('companies').updateOne({ _id: company._id }, { $set: { status: 'APPROVED', databaseIdentifier: identifier, setupCompleted: Boolean(company.setupCompleted), approvedAt: new Date(), rejectionReason: '', updatedAt: new Date() } });
            return response(res, 200, { success: true, message: 'Company approved and its dedicated database is ready.' });
        }
        if (method === 'POST' && parts[4] === 'reject') {
            const data = await body(req);
            await control.collection('companies').updateOne({ _id: company._id }, { $set: { status: 'REJECTED', rejectionReason: required(data.reason, 'Rejection reason'), rejectedAt: new Date(), updatedAt: new Date() } });
            await control.collection('sessions').deleteMany({ companyId: company._id });
            return response(res, 200, { success: true });
        }
        if (method === 'GET') {
            let franchises = [], mainFranchise = null, warehouse = null;
            if (company.status === 'APPROVED' && company.databaseIdentifier) {
                try {
                    const tenantDb = getTenantDatabase(company.databaseIdentifier);
                    franchises = await tenantDb.collection('franchises').find({}).toArray();
                    mainFranchise = await tenantDb.collection('franchises').findOne({ isHeadOffice: true });
                    warehouse = await tenantDb.collection('inventory_locations').findOne({ isMain: true });
                } catch (_) {}
            }
            return response(res, 200, {
                success: true,
                data: {
                    id: company._id.toString(),
                    companyName: company.companyName,
                    contactPerson: company.contactPerson,
                    email: company.email,
                    phone: company.phone,
                    address: company.address,
                    status: company.status,
                    rejectionReason: company.rejectionReason || '',
                    setupCompleted: Boolean(company.setupCompleted),
                    setupStep: company.setupStep || 0,
                    databaseIdentifier: company.databaseIdentifier || null,
                    createdAt: company.createdAt,
                    approvedAt: company.approvedAt,
                    rejectedAt: company.rejectedAt,
                    brand: company.brand || {},
                    brandName: (company.brand && company.brand.name) || '',
                    logoUrl: (company.brand && company.brand.logoUrl) || company.logoUrl || '',
                    mainFranchise: mainFranchise ? output(mainFranchise) : null,
                    warehouse: warehouse ? output(warehouse) : null,
                    franchiseCount: franchises.length,
                    franchises: franchises.map(output)
                }
            });
        }
    }
    if (action === 'settings' && method === 'GET') {
        const session = await currentSession(req);
        const admin = await control.collection('admins').findOne({ _id: session.accountId });
        const totalCompanies = await control.collection('companies').countDocuments();
        return response(res, 200, {
            success: true,
            data: {
                admin: { email: admin ? admin.email : 'admin@example.com', name: admin ? admin.name : 'System Administrator', role: admin ? admin.role : 'ADMIN', createdAt: admin ? admin.createdAt : new Date() },
                system: {
                    database: process.env.MONGODB_CONTROL_DB || 'franchise_control',
                    totalCompanies: totalCompanies,
                    nodeVersion: process.version,
                    platform: process.platform,
                    uptime: Math.round(process.uptime())
                }
            }
        });
    }
    if (action === 'change-password' && method === 'POST') {
        const session = await currentSession(req);
        const data = await body(req);
        const admin = await control.collection('admins').findOne({ _id: session.accountId });
        if (!admin || !await passwordMatches(required(data.currentPassword, 'Current password'), admin.passwordHash)) {
            return response(res, 400, { success: false, message: 'Current password is incorrect' });
        }
        if (String(data.newPassword).length < 6) {
            throw invalid('New password must have at least 6 characters');
        }
        const hash = await passwordHash(required(data.newPassword, 'New password'));
        await control.collection('admins').updateOne({ _id: admin._id }, { $set: { passwordHash: hash, updatedAt: new Date() } });
        return response(res, 200, { success: true, message: 'Admin password updated successfully.' });
    }
    return response(res, 404, { success: false, message: 'Admin route not found' });
}
async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean), resource = parts[1], id = parts[2], method = req.method;
    if (resource === 'auth') return handleAuth(req, res, id);
    if (resource === 'admin') return adminApi(req, res, parts, method);
    const tenant = await requireCompany(req), db = tenant.db;
    const franchises = db.collection('franchises'), products = db.collection('products'), inventory = db.collection('inventory'), orders = db.collection('orders');
    if (resource === 'company' && id === 'setup') {
        const control = getControlDatabase();
        if (method === 'GET') { const [mainFranchise, warehouse, admin] = await Promise.all([franchises.findOne({ isHeadOffice: true }), db.collection('inventory_locations').findOne({ isMain: true }), db.collection('users').findOne({ role: 'COMPANY_ADMIN' })]); return response(res, 200, { success: true, data: { company: { companyName: tenant.company.companyName, description: tenant.company.description || '', contactPerson: tenant.company.contactPerson, email: tenant.company.email, phone: tenant.company.phone, address: tenant.company.address, website: tenant.company.website || '', logoUrl: tenant.company.logoUrl || '' }, brand: tenant.company.brand || {}, mainFranchise: mainFranchise ? output(mainFranchise) : null, warehouse: warehouse ? output(warehouse) : null, admin: admin ? output(admin) : null, setupStep: tenant.company.setupStep || 0, setupCompleted: Boolean(tenant.company.setupCompleted) } }); }
        if (method === 'PUT') { const data = await body(req), step = value(data.step, 'Setup step', 1), now = new Date(); if (step > 5) throw invalid('Invalid setup step'); if (step === 1) { const email = required(data.email, 'Email').toLowerCase(); await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { companyName: required(data.companyName, 'Company name'), description: String(data.description || ''), contactPerson: required(data.contactPerson, 'Contact person'), email, phone: validatePhone(data.phone, 'Company phone'), address: String(data.address || ''), website: String(data.website || ''), logoUrl: String(data.logoUrl || ''), setupStep: Math.max(1, tenant.company.setupStep || 0), updatedAt: now } }); }
            if (step === 2) await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { brand: { name: required(data.brandName, 'Brand name'), details: String(data.brandDetails || ''), logoUrl: String(data.brandLogoUrl || '') }, setupStep: Math.max(2, tenant.company.setupStep || 0), updatedAt: now } });
            if (step === 3) { const main = { franchiseCode: String(data.franchiseCode || 'HQ-001'), name: required(data.name, 'Main franchise name'), ownerName: required(data.ownerName, 'Franchise manager'), phone: validatePhone(data.phone, 'HQ phone'), email: String(data.email || ''), address: String(data.address || ''), city: String(data.city || ''), state: String(data.state || ''), status: 'ACTIVE', isHeadOffice: true, updatedAt: now }; await franchises.updateOne({ isHeadOffice: true }, { $set: main, $setOnInsert: { createdAt: now } }, { upsert: true }); await ensureFranchiseInventory(db, (await franchises.findOne({ isHeadOffice: true }))._id); await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { setupStep: Math.max(3, tenant.company.setupStep || 0), updatedAt: now } }); }
            if (step === 4) { const location = { name: required(data.name, 'Inventory location name'), address: String(data.address || ''), responsiblePerson: required(data.responsiblePerson, 'Person responsible'), phone: validatePhone(data.phone, 'Warehouse phone'), email: String(data.email || ''), isMain: true, updatedAt: now }; await db.collection('inventory_locations').updateOne({ isMain: true }, { $set: location, $setOnInsert: { createdAt: now } }, { upsert: true }); await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { setupStep: Math.max(4, tenant.company.setupStep || 0), updatedAt: now } }); }
            if (step === 5) { const main = await franchises.findOne({ isHeadOffice: true }); if (!main) throw invalid('Complete the main franchise step first'); const email = required(data.email, 'Administrator email').toLowerCase(); const user = { name: required(data.name, 'Administrator name'), email, phone: validatePhone(data.phone, 'Admin phone'), role: 'COMPANY_ADMIN', branchId: main._id, status: 'ACTIVE', updatedAt: now }; if (data.password) user.passwordHash = await passwordHash(required(data.password, 'Password')); const existing = await db.collection('users').findOne({ role: 'COMPANY_ADMIN' }); if (!existing && !user.passwordHash) throw invalid('Administrator password is required'); await db.collection('users').updateOne(existing ? { _id: existing._id } : { email }, { $set: user, $setOnInsert: { createdAt: now } }, { upsert: true }); await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { setupStep: 5, setupCompleted: true, setupCompletedAt: now, updatedAt: now } }); }
            return response(res, 200, { success: true, message: step === 5 ? 'Company setup completed.' : `Step ${step} saved.` }); }
    }
    if (resource === 'profile') { const control = getControlDatabase(); if (method === 'GET') return response(res, 200, { success: true, data: { ...publicUser(tenant.actor, tenant.session.role), phone: tenant.actor.phone || tenant.company.phone || '', avatarUrl: tenant.actor.avatarUrl || '' } }); const data = await body(req); if (id === 'change-password' && method === 'POST') { if (!await passwordMatches(required(data.currentPassword, 'Current password'), tenant.session.role === 'COMPANY' ? tenant.company.passwordHash : tenant.actor.passwordHash)) return response(res, 400, { success: false, message: 'Current password is incorrect' }); const hash = await passwordHash(required(data.newPassword, 'New password')); if (String(data.newPassword).length < 6) throw invalid('New password must have at least 6 characters'); const target = tenant.session.role === 'COMPANY' ? control.collection('companies') : db.collection('users'); await target.updateOne({ _id: tenant.session.role === 'COMPANY' ? tenant.company._id : tenant.actor._id }, { $set: { passwordHash: hash, updatedAt: new Date() } }); return response(res, 200, { success: true, message: 'Password changed successfully.' }); } if (method === 'PUT') { const name = required(data.name, 'Name'), email = required(data.email, 'Email').toLowerCase(), phone = validatePhone(data.phone, 'Contact phone'), fields = { name, email, phone, avatarUrl: String(data.avatarUrl || ''), updatedAt: new Date() }; if (tenant.session.role === 'COMPANY') { await control.collection('companies').updateOne({ _id: tenant.company._id }, { $set: { contactPerson: name, email, phone: fields.phone, logoUrl: fields.avatarUrl, updatedAt: fields.updatedAt } }); } else await db.collection('users').updateOne({ _id: tenant.actor._id }, { $set: fields }); return response(res, 200, { success: true, message: 'Profile updated.' }); } }
    if (resource === 'compliance') { await ensureComplianceTasks(db); const tasks = db.collection('compliance_tasks'); if (id === 'summary' && method === 'GET') { const [all, branches] = await Promise.all([tasks.find({}).toArray(), franchises.find({}).toArray()]); const data = branches.map(function (branch) { const entries = all.filter(function (task) { return sameId(task.franchiseId, branch._id); }), done = entries.filter(function (task) { return task.status === 'COMPLETED'; }).length; return { franchiseId: branch._id.toString(), franchiseName: branch.name, completed: done, total: entries.length, percentage: entries.length ? Math.round(done * 100 / entries.length) : 0 }; }); return response(res, 200, { success: true, data }); } if (method === 'GET') { const filter = {}; if (url.searchParams.get('franchiseId')) filter.franchiseId = oid(url.searchParams.get('franchiseId'), 'Franchise ID'); if (url.searchParams.get('status')) filter.status = url.searchParams.get('status').toUpperCase(); const [records, branches] = await Promise.all([tasks.find(filter).sort({ createdAt: -1 }).toArray(), franchises.find({}).toArray()]); return response(res, 200, { success: true, data: records.map(function (task) { const branch = branches.find(function (item) { return sameId(item._id, task.franchiseId); }); return { ...output(task), franchiseName: branch ? branch.name : '', isOverdue: task.status === 'PENDING' && task.dueAt < new Date() }; }) }); } if (id && method === 'PUT' && parts[3] === 'complete') { const task = await tasks.findOne({ _id: oid(id, 'Compliance task ID') }); if (!task) return response(res, 404, { success: false, message: 'Checklist task not found' }); const now = new Date(); await tasks.updateOne({ _id: task._id }, { $set: { status: 'COMPLETED', completedAt: now, completedBy: tenant.actor.name || tenant.actor.contactPerson, completedById: tenant.actor._id, updatedAt: now } }); await db.collection('notifications').insertOne({ type: 'COMPLIANCE_COMPLETED', message: `${task.title} completed for checklist period ${task.periodKey}`, franchiseId: task.franchiseId, createdAt: now, read: false }); return response(res, 200, { success: true, message: 'Checklist item marked complete.' }); } }
    if (resource === 'notifications' && method === 'GET') { await ensureComplianceTasks(db); const pending = await db.collection('compliance_tasks').find({ status: 'PENDING' }).toArray(); const notices = pending.map(function (task) { return { id: `pending-${task._id}`, type: task.frequency + '_CHECKLIST_PENDING', message: `${task.title} is pending for ${task.periodKey}`, franchiseId: task.franchiseId.toString(), createdAt: task.createdAt, read: false }; }); const saved = (await db.collection('notifications').find({}).sort({ createdAt: -1 }).limit(30).toArray()).map(output); return response(res, 200, { success: true, data: notices.concat(saved) }); }
    if (resource === 'franchises') {
        if (method === 'GET' && !id) { const filter = {}; if (url.searchParams.get('status')) filter.status = url.searchParams.get('status').toUpperCase(); if (url.searchParams.get('search')) filter.$or = ['name', 'franchiseCode', 'city'].map(function (field) { return { [field]: { $regex: url.searchParams.get('search'), $options: 'i' } }; }); return response(res, 200, { success: true, data: (await franchises.find(filter).toArray()).map(output) }); }
        if (method === 'GET') { const item = await franchises.findOne(identifier(id, 'franchiseCode')); if (!item) return response(res, 404, { success: false, message: 'Franchise not found' }); return response(res, 200, { success: true, data: { ...output(item), inventory: await inventoryDetails(await inventory.find({ franchiseId: item._id }).toArray(), db), orders: (await orders.find({ franchiseId: item._id }).toArray()).map(output) } }); }
        const data = await body(req);
        if (method === 'POST') { const now = new Date(); const item = { franchiseCode: String(data.franchiseCode || data.franchise_code || generated('FR')), name: required(data.name, 'Franchise name'), ownerName: required(data.ownerName || data.owner_name, 'Owner name'), phone: validatePhone(data.phone, 'Franchise phone'), email: String(data.email || ''), address: String(data.address || ''), city: String(data.city || ''), state: String(data.state || ''), status: String(data.status || 'ACTIVE').toUpperCase(), createdAt: now, updatedAt: now }; const result = await franchises.insertOne(item); return response(res, 201, { success: true, data: output({ ...item, _id: result.insertedId }) }); }
        const old = await franchises.findOne(identifier(id, 'franchiseCode')); if (!old) return response(res, 404, { success: false, message: 'Franchise not found' });
        if (method === 'PUT') { const change = { name: data.name === undefined ? old.name : required(data.name, 'Franchise name'), ownerName: data.ownerName === undefined && data.owner_name === undefined ? old.ownerName : required(data.ownerName || data.owner_name, 'Owner name'), phone: data.phone === undefined ? old.phone : validatePhone(data.phone, 'Franchise phone'), email: data.email === undefined ? old.email : String(data.email), address: data.address === undefined ? old.address : String(data.address), city: data.city === undefined ? old.city : String(data.city), state: data.state === undefined ? old.state : String(data.state), status: String(data.status || old.status).toUpperCase(), updatedAt: new Date() }; await franchises.updateOne({ _id: old._id }, { $set: change }); return response(res, 200, { success: true, data: output({ ...old, ...change }) }); }
        if (method === 'DELETE') { if (await orders.countDocuments({ franchiseId: old._id })) { await franchises.updateOne({ _id: old._id }, { $set: { status: 'INACTIVE', updatedAt: new Date() } }); return response(res, 200, { success: true, message: 'Franchise deactivated to preserve order history' }); } await franchises.deleteOne({ _id: old._id }); await inventory.deleteMany({ franchiseId: old._id }); return response(res, 200, { success: true }); }
    }
    if (resource === 'products') {
        if (method === 'GET' && !id) { const filter = {}; if (url.searchParams.get('status')) filter.status = url.searchParams.get('status').toUpperCase(); if (url.searchParams.get('search')) filter.$or = ['name', 'productCode', 'category'].map(function (field) { return { [field]: { $regex: url.searchParams.get('search'), $options: 'i' } }; }); return response(res, 200, { success: true, data: (await products.find(filter).toArray()).map(output) }); }
        if (method === 'GET') { const item = await products.findOne(identifier(id, 'productCode')); return item ? response(res, 200, { success: true, data: output(item) }) : response(res, 404, { success: false, message: 'Product not found' }); }
        const data = await body(req);
        if (method === 'POST') { const now = new Date(), item = { productCode: String(data.productCode || data.product_code || generated('PR')), name: required(data.name, 'Product name'), category: required(data.category, 'Category'), description: String(data.description || ''), price: value(data.price, 'price', 0), costPrice: value(data.costPrice === undefined ? data.cost_price || 0 : data.costPrice, 'cost price', 0), reorderLevel: value(data.reorderLevel === undefined ? data.reorder_level || 0 : data.reorderLevel, 'reorder level', 0), status: String(data.status || 'ACTIVE').toUpperCase(), createdAt: now, updatedAt: now }; const result = await products.insertOne(item); const activeFranchises = await franchises.find({ status: 'ACTIVE' }).toArray(); if (activeFranchises.length) await inventory.bulkWrite(activeFranchises.map(function (franchise) { return { insertOne: { document: { franchiseId: franchise._id, productId: result.insertedId, quantity: 0, reservedQuantity: 0, updatedAt: now } } }; })); return response(res, 201, { success: true, data: output({ ...item, _id: result.insertedId }) }); }
        const old = await products.findOne(identifier(id, 'productCode')); if (!old) return response(res, 404, { success: false, message: 'Product not found' });
        if (method === 'PUT') { const change = { name: data.name === undefined ? old.name : required(data.name, 'Product name'), category: data.category === undefined ? old.category : required(data.category, 'Category'), description: data.description === undefined ? old.description : String(data.description), price: data.price === undefined ? old.price : value(data.price, 'price', 0), costPrice: data.costPrice === undefined && data.cost_price === undefined ? old.costPrice : value(data.costPrice === undefined ? data.cost_price : data.costPrice, 'cost price', 0), reorderLevel: data.reorderLevel === undefined && data.reorder_level === undefined ? old.reorderLevel : value(data.reorderLevel === undefined ? data.reorder_level : data.reorderLevel, 'reorder level', 0), status: String(data.status || old.status).toUpperCase(), updatedAt: new Date() }; await products.updateOne({ _id: old._id }, { $set: change }); return response(res, 200, { success: true, data: output({ ...old, ...change }) }); }
        if (method === 'DELETE') { await products.updateOne({ _id: old._id }, { $set: { status: 'INACTIVE', updatedAt: new Date() } }); return response(res, 200, { success: true }); }
    }
    if (resource === 'inventory') {
        if (method === 'GET') { const requestedFranchiseId = id === 'franchise' ? oid(parts[3], 'franchise ID') : null; const franchise = requestedFranchiseId ? await franchises.findOne({ _id: idFilter(requestedFranchiseId) }) : null; if (requestedFranchiseId && !franchise) return response(res, 404, { success: false, message: 'Franchise not found' }); if (franchise) await ensureFranchiseInventory(db, franchise._id); const filter = franchise ? { franchiseId: idFilter(franchise._id) } : {}; return response(res, 200, { success: true, data: await inventoryDetails(await inventory.find(filter).toArray(), db) }); }
        const data = await body(req);
        if (method === 'PUT') { const quantity = value(data.quantity, 'quantity', 0); const result = await inventory.updateOne({ _id: oid(id, 'inventory ID') }, { $set: { quantity, updatedAt: new Date() } }); if (!result.matchedCount) return response(res, 404, { success: false, message: 'Inventory record not found' }); return response(res, 200, { success: true }); }
        const requestedFranchiseId = oid(data.franchiseId || data.franchise_id, 'franchise ID'), requestedProductId = oid(data.productId || data.product_id, 'product ID'), quantity = value(data.quantity, 'quantity', 0);
        const franchise = await franchises.findOne({ _id: idFilter(requestedFranchiseId) }), product = await products.findOne({ _id: idFilter(requestedProductId) });
        if (!franchise) throw invalid('Franchise not found'); if (!product) throw invalid('Product not found'); const franchiseId = franchise._id, productId = product._id;
        if (method === 'POST' && (id === 'stock-in' || id === 'stock-out')) { if (!quantity) throw invalid('Quantity must be greater than zero'); const filter = { franchiseId: idFilter(franchiseId), productId: idFilter(productId) }; if (id === 'stock-out') filter.quantity = { $gte: quantity }; const result = await inventory.updateOne(filter, { $inc: { quantity: id === 'stock-out' ? -quantity : quantity }, $set: { updatedAt: new Date() }, $setOnInsert: { franchiseId, productId, reservedQuantity: 0 } }, { upsert: id === 'stock-in' }); if (!result.modifiedCount && id === 'stock-out') throw invalid('Insufficient inventory'); return response(res, 200, { success: true, data: output(await inventory.findOne({ franchiseId: idFilter(franchiseId), productId: idFilter(productId) })) }); }
        if (method === 'POST') { await inventory.updateOne({ franchiseId: idFilter(franchiseId), productId: idFilter(productId) }, { $set: { quantity, reservedQuantity: value(data.reservedQuantity || 0, 'reserved quantity', 0), updatedAt: new Date() } }, { upsert: true }); return response(res, 201, { success: true }); }
    }
    if (resource === 'smart-tips') {
        const smartTips = db.collection('smart_tips');
        if (method === 'GET' && !id) {
            const franchiseId = url.searchParams.get('franchiseId');
            const filter = franchiseId ? { status: 'ACTIVE', appliedFranchiseIds: { $in: idValues(oid(franchiseId, 'franchise ID')) } } : {};
            const [tips, allProducts, allFranchises] = await Promise.all([smartTips.find(filter).sort({ createdAt: -1 }).toArray(), products.find({}).toArray(), franchises.find({}).toArray()]);
            const data = tips.map(function (tip) { return { ...output(tip), products: tip.productIds.map(function (productId) { const product = allProducts.find(function (item) { return sameId(item._id, productId); }); return product ? { id: product._id.toString(), name: product.name, productCode: product.productCode } : null; }).filter(Boolean), franchises: (tip.appliedFranchiseIds || []).map(function (franchiseId) { const franchise = allFranchises.find(function (item) { return sameId(item._id, franchiseId); }); return franchise ? { id: franchise._id.toString(), name: franchise.name } : null; }).filter(Boolean) }; });
            return response(res, 200, { success: true, data });
        }
        if (method === 'POST' && !id) {
            const data = await body(req), tipType = required(data.tipType, 'Tip type').toUpperCase();
            if (!['OFFER', 'DISCOUNT', 'COMBO'].includes(tipType)) throw invalid('Tip type must be Offer, Discount, or Combo');
            if (!Array.isArray(data.productIds) || !data.productIds.length) throw invalid('Select at least one inventory product');
            const productIds = data.productIds.map(function (productId) { return oid(productId, 'product ID'); });
            if (new Set(productIds.map(String)).size !== productIds.length) throw invalid('A product can be selected only once');
            if (tipType === 'COMBO' && productIds.length < 2) throw invalid('A combo needs at least two products');
            const [selectedProducts, stockedProducts] = await Promise.all([products.find({ $or: productIds.map(function (productId) { return { _id: idFilter(productId), status: 'ACTIVE' }; }) }).toArray(), inventory.find({ $or: productIds.map(function (productId) { return { productId: idFilter(productId), quantity: { $gt: 0 } }; }) }).toArray()]);
            if (selectedProducts.length !== productIds.length || productIds.some(function (productId) { return !stockedProducts.some(function (record) { return sameId(record.productId, productId); }); })) throw invalid('Every selected product must be active and available in inventory');
            const actualProductIds = productIds.map(function (productId) { return selectedProducts.find(function (product) { return sameId(product._id, productId); })._id; });
            const now = new Date(), tip = { title: required(data.title, 'Tip title'), description: String(data.description || ''), tipType, productIds: actualProductIds, offerText: tipType === 'OFFER' ? required(data.offerText, 'Offer details') : '', discountPercent: tipType === 'DISCOUNT' ? value(data.discountPercent, 'Discount percentage', 0.01) : 0, comboPrice: tipType === 'COMBO' ? value(data.comboPrice, 'Combo price', 0) : 0, status: 'ACTIVE', appliedFranchiseIds: [], createdAt: now, updatedAt: now };
            if (tip.discountPercent > 100) throw invalid('Discount percentage cannot exceed 100');
            const result = await smartTips.insertOne(tip);
            return response(res, 201, { success: true, data: output({ ...tip, _id: result.insertedId }), message: 'Smart Tip saved. Apply it to one or more franchises.' });
        }
        const existing = await smartTips.findOne({ _id: oid(id, 'Smart Tip ID') });
        if (!existing) return response(res, 404, { success: false, message: 'Smart Tip not found' });
        if (method === 'PUT' && parts[3] === 'apply') {
            const data = await body(req);
            if (!Array.isArray(data.franchiseIds) || !data.franchiseIds.length) throw invalid('Select at least one franchise');
            const franchiseIds = data.franchiseIds.map(function (franchiseId) { return oid(franchiseId, 'franchise ID'); });
            const chosenFranchises = await franchises.find({ $or: franchiseIds.map(function (franchiseId) { return { _id: idFilter(franchiseId), status: 'ACTIVE' }; }) }).toArray();
            if (chosenFranchises.length !== franchiseIds.length) throw invalid('One or more selected franchises are unavailable');
            await smartTips.updateOne({ _id: existing._id }, { $addToSet: { appliedFranchiseIds: { $each: chosenFranchises.map(function (franchise) { return franchise._id; }) } }, $set: { updatedAt: new Date() } });
            return response(res, 200, { success: true, message: 'Smart Tip applied to the selected franchises.' });
        }
    }
    if (resource === 'orders') {
        if (method === 'GET' && !id) { const filter = {}; if (url.searchParams.get('status')) filter.status = url.searchParams.get('status').toUpperCase(); if (url.searchParams.get('search')) filter.$or = [{ orderNumber: { $regex: url.searchParams.get('search'), $options: 'i' } }, { customerName: { $regex: url.searchParams.get('search'), $options: 'i' } }]; const [records, allFranchises] = await Promise.all([orders.find(filter).sort({ orderDate: -1 }).toArray(), franchises.find({}).toArray()]); return response(res, 200, { success: true, data: orderDetails(records, allFranchises) }); }
        if (method === 'POST') { const data = await body(req), session = getClient().startSession(); let order; try { await session.withTransaction(async function () { order = await createOrder(data, db, session); }); } catch (error) { if (!/Transaction numbers are only allowed|does not support transactions/i.test(error.message)) throw error; order = await createOrder(data, db); } finally { await session.endSession(); } return response(res, 201, { success: true, data: output(order) }); }
        const old = await orders.findOne(identifier(id, 'orderNumber')); if (!old) return response(res, 404, { success: false, message: 'Order not found' }); if (method === 'GET') return response(res, 200, { success: true, data: orderDetails([old], await franchises.find({}).toArray())[0] });
        const data = await body(req); if (method === 'PUT' && parts[3] === 'status') { const newStatus = required(data.status, 'Status').toUpperCase(); if (newStatus === 'CANCELLED' && old.status !== 'CANCELLED' && old.sourceId && old.destinationId && Array.isArray(old.items)) { for (const item of old.items) { await db.collection('inventory').updateOne({ franchiseId: idFilter(old.sourceId), productId: idFilter(item.productId) }, { $inc: { quantity: item.quantity }, $set: { updatedAt: new Date() } }); await db.collection('inventory').updateOne({ franchiseId: idFilter(old.destinationId), productId: idFilter(item.productId) }, { $inc: { quantity: -item.quantity }, $set: { updatedAt: new Date() } }); } } await orders.updateOne({ _id: old._id }, { $set: { status: newStatus, updatedAt: new Date() } }); return response(res, 200, { success: true }); } if (method === 'PUT') { await orders.updateOne({ _id: old._id }, { $set: { customerName: data.customerName === undefined ? old.customerName : required(data.customerName, 'Customer name'), customerPhone: data.customerPhone === undefined ? old.customerPhone : String(data.customerPhone), updatedAt: new Date() } }); return response(res, 200, { success: true }); } if (method === 'DELETE') { await orders.deleteOne({ _id: old._id }); return response(res, 200, { success: true }); }
    }
    if (resource === 'dashboard' && method === 'GET') { const [f, p, i, o] = await Promise.all([franchises.find({}).toArray(), products.find({ status: 'ACTIVE' }).toArray(), inventory.find({}).toArray(), orders.find({}).sort({ orderDate: -1 }).toArray()]); const stockHealth = i.map(function (stock) { const product = p.find(function (item) { return sameId(item._id, stock.productId); }); return product ? { name: product.name, productCode: product.productCode, currentStock: Number(stock.quantity || 0), reorderLevel: Number(product.reorderLevel || 0) } : null; }).filter(Boolean); const low = stockHealth.filter(function (stock) { return stock.currentStock <= stock.reorderLevel; }); const healthy = stockHealth.length - low.length; const totalTracked = stockHealth.length; const summary = { healthy, low: low.length, total: totalTracked, healthyPercent: totalTracked ? Math.round(healthy * 100 / totalTracked) : 0, lowPercent: totalTracked ? Math.round(low.length * 100 / totalTracked) : 0 }; return response(res, 200, { success: true, data: { totalFranchises: f.length, activeFranchises: f.filter(function (x) { return x.status === 'ACTIVE'; }).length, totalProducts: p.length, lowStockProducts: low.length, totalInventory: i.reduce(function (sum, x) { return sum + Number(x.quantity || 0); }, 0), totalOrders: o.length, pendingOrders: o.filter(function (x) { return x.status === 'PENDING'; }).length, completedOrders: o.filter(function (x) { return ['COMPLETED', 'DELIVERED'].includes(x.status); }).length, totalSales: o.reduce(function (sum, x) { return sum + Number(x.total || 0); }, 0), stockHealth: stockHealth.map(function (stock) { return { name: stock.name, product_code: stock.productCode, current_stock: stock.currentStock, reorder_level: stock.reorderLevel }; }), stockHealthSummary: summary, recentOrders: o.slice(0, 5).map(function (ord) { return orderDetails([ord], f)[0]; }) } }); }
    return response(res, 404, { success: false, message: 'API route not found' });
}
async function serve(req, res, pathname) {
    const removedRedirects = ['/compliance.html', '/smart-tips.html', '/analytics.html', '/company/compliance', '/company/smart-tips', '/company/analytics', 'compliance.html', 'smart-tips.html', 'analytics.html'];
    if (removedRedirects.includes(pathname)) {
        res.writeHead(302, { Location: '/company/dashboard' });
        return res.end();
    }
    const aliases = {
        '/login/admin': 'admin-login.html',
        '/login/company': 'login.html',
        '/admin/dashboard': 'admin-dashboard.html',
        '/admin/company-requests': 'admin-companies.html',
        '/admin/companies': 'admin-companies.html',
        '/admin/settings': 'admin-settings.html',
        '/company/dashboard': 'dashboard.html',
        '/company/franchises': 'franchises.html',
        '/company/orders': 'orders.html',
        '/company/orderform': 'orderform.html',
        '/company/inventory': 'inventory.html',
        '/company/settings': 'settings.html'
    };
    const page = aliases[pathname] || pathname.replace(/^\//, '') || 'index.html';
    const companyPages = ['dashboard.html', 'franchises.html', 'inventory.html', 'orders.html', 'orderform.html', 'company-setup.html', 'settings.html'];
    if (companyPages.includes(page)) {
        try {
            const tenant = await requireCompany(req);
            if (tenant.company.setupCompleted === false && page !== 'company-setup.html') {
                res.writeHead(302, { Location: '/company-setup.html' });
                return res.end();
            }
        } catch (_) {
            res.writeHead(302, { Location: '/login.html' });
            return res.end();
        }
    }
    if (page.startsWith('admin-') && page !== 'admin-login.html') {
        try {
            await requireAdmin(req);
        } catch (_) {
            res.writeHead(302, { Location: '/admin-login.html' });
            return res.end();
        }
    }
    const effectivePath = aliases[pathname] ? `/${page}` : pathname;
    let target = path.resolve(root, effectivePath === '/' ? 'index.html' : `.${effectivePath}`);
    if (!target.startsWith(root)) return response(res, 403, { success: false, message: 'Forbidden' });
    if (!path.extname(target)) target += '.html';
    fs.stat(target, function (error, info) {
        if (error || !info.isFile()) return response(res, 404, { success: false, message: 'File not found' });
        res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
        fs.createReadStream(target).pipe(res);
    });
}
const server = http.createServer(async function (req, res) { if (req.method === 'OPTIONS') return response(res, 204, {}); const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else await serve(req, res, url.pathname); } catch (error) { if (error.code === 11000) return response(res, 409, { success: false, message: 'That email or code is already registered' }); console.error(error.message); response(res, error.status || 500, { success: false, message: error.status ? error.message : 'An unexpected server error occurred' }); } });
connectDatabase().then(function () { server.listen(port, function () { console.log(`Server running on http://localhost:${port}`); }); }).catch(function (error) { console.error('MongoDB connection failed:', error.message); process.exitCode = 1; });
