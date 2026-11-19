import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createServer as createViteServer } from 'vite';
import type {
  ActivityLog,
  AdminOverviewPayload,
  RepairOrder,
  RoleDefinition,
  UserPermissions,
  UserRecord,
  UserStatus,
} from './src/types.ts';
import {
  CHECKLIST_ITEMS,
  DEFAULT_ROLES,
  SHORT_CHECKLIST_LABELS,
} from './src/constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'parc-auto-db.json');
const NEON_CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`parc-auto-djibouti-${__dirname}`).digest('hex');

interface StoredUser extends UserRecord {
  passwordSalt: string;
  passwordHash: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  roles: RoleDefinition[];
  orders: RepairOrder[];
  logs: ActivityLog[];
}

interface AuthedRequest extends Request {
  currentUser?: StoredUser;
}

// --- Password & Token Helpers ---
function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function signToken(userId: string): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): { uid: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeUser(user: StoredUser): UserRecord {
  const { passwordHash: _ph, passwordSalt: _ps, ...safe } = user;
  return safe;
}

function mkChecks(count: number): boolean[] {
  return Array.from({ length: CHECKLIST_ITEMS.length }, (_, i) => i < count);
}

// --- Initial Seed Data (Admin account only, zero sample orders/users) ---
function createSeedDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const sahalPw = hashPassword('protocole2026');
  const adminRole = DEFAULT_ROLES.find((r) => r.id === 'admin')!;

  const users: StoredUser[] = [
    {
      id: 'user-sahal',
      username: 'sahal',
      email: 'sahalhoch@gmail.com',
      fullName: 'Sahal',
      department: 'Direction du Parc Auto Protocole',
      roleId: 'admin',
      status: 'approved',
      permissions: { ...adminRole.permissions },
      createdAt: now,
      validatedAt: now,
      validatedBy: 'Système',
      passwordSalt: sahalPw.salt,
      passwordHash: sahalPw.hash,
    },
  ];

  return {
    users,
    roles: DEFAULT_ROLES.map((r) => ({ ...r, permissions: { ...r.permissions } })),
    orders: [],
    logs: [],
  };
}

// --- Storage Abstraction (Neon PostgreSQL when DATABASE_URL is set, JSON file fallback otherwise) ---
let pgPool: Pool | null = null;
if (NEON_CONNECTION_STRING) {
  pgPool = new Pool({
    connectionString: NEON_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 15000,
  });
  pgPool.on('error', (err) => {
    console.error('Neon PostgreSQL pool error:', err);
  });
}

function loadJsonDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed.users || !parsed.roles || !parsed.orders || !parsed.logs) {
      throw new Error('Corrupt DB shape');
    }
    return parsed;
  } catch {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
}

let db: DatabaseSchema = pgPool
  ? { users: [], roles: [], orders: [], logs: [] }
  : loadJsonDatabase();

let neonReadyPromise: Promise<void> | null = null;

async function ensureNeonReady(): Promise<void> {
  if (!pgPool) return;
  if (neonReadyPromise) return neonReadyPromise;

  neonReadyPromise = (async () => {
    const schemaSql = fs.readFileSync(path.resolve(__dirname, 'neon_schema.sql'), 'utf8');
    await pgPool.query(schemaSql);

    const { rows: roleCountRows } = await pgPool.query<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM roles',
    );
    const { rows: userCountRows } = await pgPool.query<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM users',
    );

    if (Number(roleCountRows[0]?.cnt || 0) === 0 || Number(userCountRows[0]?.cnt || 0) === 0) {
      const seed = createSeedDatabase();
      for (const r of seed.roles) {
        await pgPool.query(
          `INSERT INTO roles (id, label, description, permissions, is_system)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (id) DO NOTHING`,
          [r.id, r.label, r.description, JSON.stringify(r.permissions), Boolean(r.isSystem)],
        );
      }
      for (const u of seed.users) {
        await pgPool.query(
          `INSERT INTO users (
             id, username, email, full_name, department, role_id, status,
             permissions, password_salt, password_hash, created_at, validated_at, validated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            u.id,
            u.username,
            u.email,
            u.fullName,
            u.department,
            u.roleId,
            u.status,
            JSON.stringify(u.permissions),
            u.passwordSalt,
            u.passwordHash,
            u.createdAt,
            u.validatedAt || null,
            u.validatedBy || null,
          ],
        );
      }
      for (const o of seed.orders) {
        await pgPool.query(
          `INSERT INTO repair_orders (
             id, work_date, marque, modele, immat, vin, km, checks, remarque, tech, ctrl,
             created_by_id, created_by_name, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO NOTHING`,
          [
            o.id,
            o.date,
            o.marque,
            o.modele,
            o.immat,
            o.vin,
            o.km,
            JSON.stringify(o.checks),
            o.remarque,
            o.tech,
            o.ctrl,
            o.createdById,
            o.createdByName,
            o.createdAt,
            o.updatedAt || o.createdAt,
          ],
        );
      }
      await pgPool.query(
        `SELECT setval(pg_get_serial_sequence('repair_orders', 'id'), COALESCE((SELECT MAX(id) FROM repair_orders), 1), true)`,
      );
      for (const l of seed.logs) {
        await pgPool.query(
          `INSERT INTO activity_logs (id, timestamp, actor_id, actor_name, action, target_label, details)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO NOTHING`,
          [l.id, l.timestamp, l.actorId, l.actorName, l.action, l.targetLabel, l.details || null],
        );
      }
    }

    await reloadFromNeon();
  })().catch((err) => {
    neonReadyPromise = null;
    throw err;
  });

  return neonReadyPromise;
}

async function reloadFromNeon(): Promise<void> {
  if (!pgPool) return;
  const [rolesRes, usersRes, ordersRes, logsRes] = await Promise.all([
    pgPool.query<{
      id: string;
      label: string;
      description: string;
      permissions: UserPermissions;
      is_system: boolean;
    }>('SELECT id, label, description, permissions, is_system FROM roles ORDER BY is_system DESC, label ASC'),
    pgPool.query<{
      id: string;
      username: string;
      email: string;
      full_name: string;
      department: string;
      role_id: string;
      status: UserStatus;
      permissions: UserPermissions;
      password_salt: string;
      password_hash: string;
      created_at: Date | string;
      validated_at: Date | string | null;
      validated_by: string | null;
      last_login_at: Date | string | null;
    }>('SELECT * FROM users ORDER BY created_at DESC'),
    pgPool.query<{
      id: number;
      work_date: string;
      marque: string;
      modele: string;
      immat: string;
      vin: string;
      km: number;
      checks: boolean[];
      remarque: string;
      tech: string;
      ctrl: string;
      created_by_id: string;
      created_by_name: string;
      created_at: Date | string;
      updated_by_id: string | null;
      updated_by_name: string | null;
      updated_at: Date | string | null;
    }>(
      `SELECT id, TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date, marque, modele, immat, vin, km,
              checks, remarque, tech, ctrl, created_by_id, created_by_name, created_at,
              updated_by_id, updated_by_name, updated_at
       FROM repair_orders
       ORDER BY work_date DESC, id DESC`,
    ),
    pgPool.query<{
      id: string;
      timestamp: Date | string;
      actor_id: string;
      actor_name: string;
      action: ActivityLog['action'];
      target_label: string;
      details: string | null;
    }>('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 150'),
  ]);

  db = {
    roles: rolesRes.rows.map((r) => ({
      id: r.id,
      label: r.label,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.is_system,
    })),
    users: usersRes.rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.full_name,
      department: u.department,
      roleId: u.role_id,
      status: u.status,
      permissions: u.permissions,
      passwordSalt: u.password_salt,
      passwordHash: u.password_hash,
      createdAt: new Date(u.created_at).toISOString(),
      validatedAt: u.validated_at ? new Date(u.validated_at).toISOString() : undefined,
      validatedBy: u.validated_by || undefined,
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : undefined,
    })),
    orders: ordersRes.rows.map((o) => ({
      id: o.id,
      date: o.work_date,
      marque: o.marque,
      modele: o.modele,
      immat: o.immat,
      vin: o.vin,
      km: o.km,
      checks: Array.isArray(o.checks) ? o.checks : mkChecks(0),
      remarque: o.remarque,
      tech: o.tech,
      ctrl: o.ctrl,
      createdById: o.created_by_id,
      createdByName: o.created_by_name,
      createdAt: new Date(o.created_at).toISOString(),
      updatedById: o.updated_by_id || undefined,
      updatedByName: o.updated_by_name || undefined,
      updatedAt: o.updated_at ? new Date(o.updated_at).toISOString() : undefined,
    })),
    logs: logsRes.rows.map((l) => ({
      id: l.id,
      timestamp: new Date(l.timestamp).toISOString(),
      actorId: l.actor_id,
      actorName: l.actor_name,
      action: l.action,
      targetLabel: l.target_label,
      details: l.details || undefined,
    })),
  };
}

function saveJsonDatabase() {
  if (pgPool) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

async function addLog(
  actorId: string,
  actorName: string,
  action: ActivityLog['action'],
  targetLabel: string,
  details?: string,
) {
  const entry: ActivityLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorId,
    actorName,
    action,
    targetLabel,
    details,
  };
  db.logs = [entry, ...db.logs].slice(0, 150);
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO activity_logs (id, timestamp, actor_id, actor_name, action, target_label, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.id,
        entry.timestamp,
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.targetLabel,
        entry.details || null,
      ],
    );
  }
}

// --- Real-Time SSE Clients ---
const sseClients = new Set<Response>();

function broadcastEvent(event: string, data: Record<string, unknown> = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, at: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// --- Statistics & Recharts Series Builder ---
function formatMonthShortFr(ym: string): string {
  const [yearStr, monthStr] = ym.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function buildAdminOverview(): AdminOverviewPayload {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const monthPrefix = `${y}-${m}`;
  const todayStr = `${y}-${m}-${day}`;

  const totalUsers = db.users.length;
  const pendingUsers = db.users.filter((u) => u.status === 'pending').length;
  const approvedUsers = db.users.filter((u) => u.status === 'approved').length;
  const suspendedOrRejectedUsers = db.users.filter(
    (u) => u.status === 'suspended' || u.status === 'rejected',
  ).length;

  const totalOrders = db.orders.length;
  const ordersThisMonth = db.orders.filter((o) => o.date.startsWith(monthPrefix)).length;
  const ordersToday = db.orders.filter((o) => o.date === todayStr).length;
  const completeOrders = db.orders.filter((o) => o.checks.every(Boolean)).length;
  const incompleteOrders = totalOrders - completeOrders;
  const completionRate =
    totalOrders > 0 ? Math.round((completeOrders / totalOrders) * 100) : 100;

  const brandMap = new Map<string, number>();
  const authorMap = new Map<string, number>();
  const completedByItem = new Array<number>(CHECKLIST_ITEMS.length).fill(0);
  const missingByItem = new Array<number>(CHECKLIST_ITEMS.length).fill(0);
  const monthlyMap = new Map<
    string,
    { totalOrders: number; completeOrders: number; incompleteOrders: number }
  >();

  for (const o of db.orders) {
    const brand = (o.marque || 'Autre').trim();
    brandMap.set(brand, (brandMap.get(brand) || 0) + 1);

    const author = (o.createdByName || 'Système').trim();
    authorMap.set(author, (authorMap.get(author) || 0) + 1);

    const isComplete = o.checks.every(Boolean);
    o.checks.forEach((checked, idx) => {
      if (idx < CHECKLIST_ITEMS.length) {
        if (checked) completedByItem[idx] += 1;
        else missingByItem[idx] += 1;
      }
    });

    const ym = (o.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      const bucket = monthlyMap.get(ym) || {
        totalOrders: 0,
        completeOrders: 0,
        incompleteOrders: 0,
      };
      bucket.totalOrders += 1;
      if (isComplete) bucket.completeOrders += 1;
      else bucket.incompleteOrders += 1;
      monthlyMap.set(ym, bucket);
    }
  }

  const brandBreakdown = Array.from(brandMap.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const authorBreakdown = Array.from(authorMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const checklistGapBreakdown = CHECKLIST_ITEMS.map((label, idx) => ({
    label,
    missingCount: missingByItem[idx],
  }))
    .filter((item) => item.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount)
    .slice(0, 5);

  const repairTypeBreakdown = CHECKLIST_ITEMS.map((label, idx) => {
    const completedCount = completedByItem[idx];
    const pendingCount = missingByItem[idx];
    const rate = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;
    return {
      index: idx + 1,
      label,
      shortLabel: SHORT_CHECKLIST_LABELS[idx] || label,
      completedCount,
      pendingCount,
      rate,
    };
  });

  // Build continuous monthly evolution series across all months present (min 6 months span if possible)
  const existingMonths = Array.from(monthlyMap.keys()).sort();
  let monthlyEvolution: Array<{
    month: string;
    monthLabel: string;
    totalOrders: number;
    completeOrders: number;
    incompleteOrders: number;
  }> = [];

  if (existingMonths.length > 0) {
    const firstYm = existingMonths[0];
    const lastYm = existingMonths[existingMonths.length - 1];
    const [fy, fm] = firstYm.split('-').map(Number);
    const [ly, lm] = lastYm.split('-').map(Number);
    const cursor = new Date(fy, fm - 1, 1);
    const end = new Date(ly, lm - 1, 1);
    while (cursor <= end) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const bucket = monthlyMap.get(ym) || {
        totalOrders: 0,
        completeOrders: 0,
        incompleteOrders: 0,
      };
      monthlyEvolution.push({
        month: ym,
        monthLabel: formatMonthShortFr(ym),
        totalOrders: bucket.totalOrders,
        completeOrders: bucket.completeOrders,
        incompleteOrders: bucket.incompleteOrders,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    monthlyEvolution = [
      {
        month: monthPrefix,
        monthLabel: formatMonthShortFr(monthPrefix),
        totalOrders: 0,
        completeOrders: 0,
        incompleteOrders: 0,
      },
    ];
  }

  return {
    users: db.users.map(sanitizeUser),
    roles: db.roles,
    logs: db.logs.slice(0, 40),
    stats: {
      totalUsers,
      pendingUsers,
      approvedUsers,
      suspendedOrRejectedUsers,
      totalOrders,
      ordersThisMonth,
      ordersToday,
      completeOrders,
      incompleteOrders,
      completionRate,
      brandBreakdown,
      authorBreakdown,
      checklistGapBreakdown,
      repairTypeBreakdown,
      monthlyEvolution,
    },
  };
}

// --- Auth Middleware ---
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const qToken = req.query.token;
  if (typeof qToken === 'string' && qToken.trim()) {
    return qToken.trim();
  }
  return null;
}

async function ensureDbMiddleware(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureNeonReady();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Erreur de connexion à la base de données.' });
  }
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  const verified = verifyToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
    return;
  }
  const user = db.users.find((u) => u.id === verified.uid);
  if (!user) {
    res.status(401).json({ error: 'Compte introuvable.' });
    return;
  }
  req.currentUser = user;
  next();
}

function requireApproved(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = req.currentUser;
  if (!user) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (user.status === 'pending') {
    res.status(403).json({
      code: 'ACCOUNT_PENDING',
      error: 'Votre compte est en attente de validation par un administrateur.',
    });
    return;
  }
  if (user.status === 'rejected') {
    res.status(403).json({
      code: 'ACCOUNT_REJECTED',
      error: 'Votre demande d’inscription a été refusée par l’administration.',
    });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({
      code: 'ACCOUNT_SUSPENDED',
      error: 'Votre compte a été suspendu par un administrateur.',
    });
    return;
  }
  next();
}

function requirePermission(perm: keyof UserPermissions) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = req.currentUser;
    if (!user || !user.permissions[perm]) {
      res.status(403).json({
        error: 'Vous ne disposez pas des droits d’accès nécessaires pour cette opération.',
      });
      return;
    }
    next();
  };
}

// --- Express App Setup ---
async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', ensureDbMiddleware);

  // SSE endpoint for real-time updates (admin dashboard + shared DB)
  app.get('/api/events', requireAuth, (req: AuthedRequest, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ userId: req.currentUser!.id })}\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Public list of selectable roles during registration (non-admin roles)
  app.get('/api/public/roles', (_req: Request, res: Response) => {
    const selectable = db.roles
      .filter((r) => r.id !== 'admin')
      .map((r) => ({ id: r.id, label: r.label, description: r.description }));
    res.json({ roles: selectable });
  });

  // Registration ("Inscription") — creates user in 'pending' status awaiting admin validation
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const fullName = String(body.fullName || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const username = String(body.username || '').trim().toLowerCase();
      const department = String(body.department || '').trim();
      const password = String(body.password || '');
      const requestedRoleId = String(body.roleId || 'technicien').trim();

      if (!fullName || !email || !username || !password) {
        res.status(400).json({
          error: 'Nom complet, identifiant, adresse e-mail et mot de passe sont obligatoires.',
        });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({
          error: 'Le mot de passe doit contenir au moins 6 caractères.',
        });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({
          error: 'Veuillez saisir une adresse e-mail valide.',
        });
        return;
      }
      if (!/^[a-z0-9._-]{3,32}$/i.test(username)) {
        res.status(400).json({
          error: 'L’identifiant doit comporter 3 à 32 caractères (lettres, chiffres, . _ -).',
        });
        return;
      }

      const exists = db.users.some(
        (u) => u.email.toLowerCase() === email || u.username.toLowerCase() === username,
      );
      if (exists) {
        res.status(409).json({
          error: 'Un compte existe déjà avec cet identifiant ou cette adresse e-mail.',
        });
        return;
      }

      const safeRole =
        db.roles.find((r) => r.id === requestedRoleId && r.id !== 'admin') ||
        db.roles.find((r) => r.id === 'technicien') ||
        DEFAULT_ROLES[2];

      const { salt, hash } = hashPassword(password);
      const newUser: StoredUser = {
        id: `user-${crypto.randomUUID().slice(0, 8)}`,
        username,
        email,
        fullName,
        department: department || 'Parc Auto Protocole',
        roleId: safeRole.id,
        status: 'pending',
        permissions: { ...safeRole.permissions, manageUsers: false },
        createdAt: new Date().toISOString(),
        passwordSalt: salt,
        passwordHash: hash,
      };

      if (pgPool) {
        await pgPool.query(
          `INSERT INTO users (
             id, username, email, full_name, department, role_id, status,
             permissions, password_salt, password_hash, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
          [
            newUser.id,
            newUser.username,
            newUser.email,
            newUser.fullName,
            newUser.department,
            newUser.roleId,
            newUser.status,
            JSON.stringify(newUser.permissions),
            newUser.passwordSalt,
            newUser.passwordHash,
            newUser.createdAt,
          ],
        );
      }

      db.users.unshift(newUser);
      await addLog(
        newUser.id,
        newUser.fullName,
        'register',
        newUser.email,
        `Nouvelle inscription en attente (rôle demandé : ${safeRole.label})`,
      );
      saveJsonDatabase();
      broadcastEvent('users_updated', { reason: 'register', userId: newUser.id });

      const token = signToken(newUser.id);
      res.status(201).json({
        token,
        user: sanitizeUser(newUser),
        requiresValidation: true,
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Erreur lors de l’inscription.' });
    }
  });

  // Login ("Connexion")
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const identifier = String(body.identifier || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!identifier || !password) {
        res.status(400).json({ error: 'Identifiant (ou e-mail) et mot de passe requis.' });
        return;
      }

      const user = db.users.find(
        (u) => u.email.toLowerCase() === identifier || u.username.toLowerCase() === identifier,
      );
      if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
        return;
      }

      if (user.status === 'rejected') {
        res.status(403).json({
          code: 'ACCOUNT_REJECTED',
          error: 'Votre demande d’accès a été refusée par l’administrateur.',
        });
        return;
      }
      if (user.status === 'suspended') {
        res.status(403).json({
          code: 'ACCOUNT_SUSPENDED',
          error: 'Votre compte est actuellement suspendu. Contactez l’administrateur.',
        });
        return;
      }

      const token = signToken(user.id);
      if (user.status === 'pending') {
        res.json({
          token,
          user: sanitizeUser(user),
          requiresValidation: true,
        });
        return;
      }

      user.lastLoginAt = new Date().toISOString();
      if (pgPool) {
        await pgPool.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [
          user.lastLoginAt,
          user.id,
        ]);
      }
      await addLog(
        user.id,
        user.fullName,
        'login',
        user.username,
        'Connexion à l’espace de travail',
      );
      saveJsonDatabase();
      broadcastEvent('users_updated', { reason: 'login', userId: user.id });

      res.json({
        token,
        user: sanitizeUser(user),
        requiresValidation: false,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Erreur lors de la connexion.' });
    }
  });

  // Current Authenticated Session Info
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({
      user: sanitizeUser(req.currentUser!),
      roles: db.roles,
    });
  });

  // --- Shared Central Orders Endpoints ---
  app.get(
    '/api/orders',
    requireAuth,
    requireApproved,
    requirePermission('viewOrders'),
    (_req: AuthedRequest, res: Response) => {
      const sorted = [...db.orders].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id,
      );
      res.json({ orders: sorted });
    },
  );

  app.post(
    '/api/orders',
    requireAuth,
    requireApproved,
    requirePermission('createOrders'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const user = req.currentUser!;
        const body = req.body as Record<string, unknown>;
        const marque = String(body.marque || '').trim();
        const modele = String(body.modele || '').trim();
        const immat = String(body.immat || '').trim();
        const vin = String(body.vin || '').trim().toUpperCase();
        const date = String(body.date || '').trim();
        const km = Number(body.km);
        const remarque = String(body.remarque || '').trim();
        const tech = String(body.tech || '').trim();
        const ctrl = String(body.ctrl || '').trim();
        const rawChecks = Array.isArray(body.checks) ? body.checks : [];

        if (!marque || !modele || !immat || !date) {
          res.status(400).json({
            error: 'Marque, modèle, immatriculation et date des travaux sont obligatoires.',
          });
          return;
        }
        if (Number.isNaN(km) || km < 0) {
          res.status(400).json({ error: 'Indiquez un kilométrage valide.' });
          return;
        }

        const checks = Array.from({ length: CHECKLIST_ITEMS.length }, (_, i) =>
          Boolean(rawChecks[i]),
        );
        const now = new Date().toISOString();
        let nextId = db.orders.reduce((max, o) => Math.max(max, o.id), 0) + 1;

        if (pgPool) {
          const inserted = await pgPool.query<{ id: number }>(
            `INSERT INTO repair_orders (
               work_date, marque, modele, immat, vin, km, checks, remarque, tech, ctrl,
               created_by_id, created_by_name, created_at, updated_by_id, updated_by_name, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             RETURNING id`,
            [
              date,
              marque,
              modele,
              immat,
              vin,
              km,
              JSON.stringify(checks),
              remarque,
              tech,
              ctrl,
              user.id,
              user.fullName,
              now,
              user.id,
              user.fullName,
              now,
            ],
          );
          nextId = inserted.rows[0].id;
        }

        const order: RepairOrder = {
          id: nextId,
          date,
          marque,
          modele,
          immat,
          vin,
          km,
          checks,
          remarque,
          tech,
          ctrl,
          createdById: user.id,
          createdByName: user.fullName,
          createdAt: now,
          updatedById: user.id,
          updatedByName: user.fullName,
          updatedAt: now,
        };

        db.orders.unshift(order);
        await addLog(
          user.id,
          user.fullName,
          'order_created',
          `Ordre ${String(order.id).padStart(7, '0')}`,
          `${order.marque} ${order.modele} · Immat. ${order.immat}`,
        );
        saveJsonDatabase();
        broadcastEvent('orders_updated', { reason: 'created', orderId: order.id });

        res.status(201).json({ order });
      } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({ error: 'Erreur lors de la création de l’ordre.' });
      }
    },
  );

  app.put(
    '/api/orders/:id',
    requireAuth,
    requireApproved,
    requirePermission('editOrders'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const user = req.currentUser!;
        const id = Number(req.params.id);
        const idx = db.orders.findIndex((o) => o.id === id);
        if (idx === -1) {
          res.status(404).json({ error: 'Ordre de réparation introuvable.' });
          return;
        }

        const existing = db.orders[idx];
        const body = req.body as Record<string, unknown>;
        const marque = String(body.marque || '').trim();
        const modele = String(body.modele || '').trim();
        const immat = String(body.immat || '').trim();
        const vin = String(body.vin || '').trim().toUpperCase();
        const date = String(body.date || '').trim();
        const km = Number(body.km);
        const remarque = String(body.remarque || '').trim();
        const tech = String(body.tech || '').trim();
        const ctrl = String(body.ctrl || '').trim();
        const rawChecks = Array.isArray(body.checks) ? body.checks : [];

        if (!marque || !modele || !immat || !date) {
          res.status(400).json({
            error: 'Marque, modèle, immatriculation et date des travaux sont obligatoires.',
          });
          return;
        }
        if (Number.isNaN(km) || km < 0) {
          res.status(400).json({ error: 'Indiquez un kilométrage valide.' });
          return;
        }

        const checks = Array.from({ length: CHECKLIST_ITEMS.length }, (_, i) =>
          Boolean(rawChecks[i]),
        );
        const updatedAt = new Date().toISOString();

        if (pgPool) {
          await pgPool.query(
            `UPDATE repair_orders
             SET work_date = $1, marque = $2, modele = $3, immat = $4, vin = $5,
                 km = $6, checks = $7::jsonb, remarque = $8, tech = $9, ctrl = $10,
                 updated_by_id = $11, updated_by_name = $12, updated_at = $13
             WHERE id = $14`,
            [
              date,
              marque,
              modele,
              immat,
              vin,
              km,
              JSON.stringify(checks),
              remarque,
              tech,
              ctrl,
              user.id,
              user.fullName,
              updatedAt,
              id,
            ],
          );
        }

        const updated: RepairOrder = {
          ...existing,
          date,
          marque,
          modele,
          immat,
          vin,
          km,
          checks,
          remarque,
          tech,
          ctrl,
          updatedById: user.id,
          updatedByName: user.fullName,
          updatedAt,
        };

        db.orders[idx] = updated;
        await addLog(
          user.id,
          user.fullName,
          'order_updated',
          `Ordre ${String(updated.id).padStart(7, '0')}`,
          `${updated.marque} ${updated.modele} · Immat. ${updated.immat}`,
        );
        saveJsonDatabase();
        broadcastEvent('orders_updated', { reason: 'updated', orderId: updated.id });

        res.json({ order: updated });
      } catch (err) {
        console.error('Update order error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour de l’ordre.' });
      }
    },
  );

  app.delete(
    '/api/orders/:id',
    requireAuth,
    requireApproved,
    requirePermission('deleteOrders'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const user = req.currentUser!;
        const id = Number(req.params.id);
        const existing = db.orders.find((o) => o.id === id);
        if (!existing) {
          res.status(404).json({ error: 'Ordre de réparation introuvable.' });
          return;
        }

        if (pgPool) {
          await pgPool.query('DELETE FROM repair_orders WHERE id = $1', [id]);
        }

        db.orders = db.orders.filter((o) => o.id !== id);
        await addLog(
          user.id,
          user.fullName,
          'order_deleted',
          `Ordre ${String(id).padStart(7, '0')}`,
          `${existing.marque} ${existing.modele} · Immat. ${existing.immat}`,
        );
        saveJsonDatabase();
        broadcastEvent('orders_updated', { reason: 'deleted', orderId: id });

        res.json({ ok: true });
      } catch (err) {
        console.error('Delete order error:', err);
        res.status(500).json({ error: 'Erreur lors de la suppression.' });
      }
    },
  );

  // --- Admin Dashboard Endpoints ---
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    (_req: AuthedRequest, res: Response) => {
      res.json(buildAdminOverview());
    },
  );

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const actor = req.currentUser!;
        const targetId = req.params.id;
        const target = db.users.find((u) => u.id === targetId);
        if (!target) {
          res.status(404).json({ error: 'Utilisateur introuvable.' });
          return;
        }

        const body = req.body as {
          status?: UserStatus;
          roleId?: string;
          permissions?: Partial<UserPermissions>;
          department?: string;
          fullName?: string;
        };

        if (target.id === actor.id) {
          if (body.status && body.status !== 'approved') {
            res.status(400).json({
              error:
                'Vous ne pouvez pas suspendre ou invalider votre propre compte administrateur.',
            });
            return;
          }
          if (body.permissions && body.permissions.manageUsers === false) {
            res.status(400).json({
              error: 'Vous ne pouvez pas retirer vos propres droits d’administration.',
            });
            return;
          }
        }

        const prevStatus = target.status;

        if (body.fullName && body.fullName.trim()) {
          target.fullName = body.fullName.trim();
        }
        if (typeof body.department === 'string') {
          target.department = body.department.trim() || 'Parc Auto Protocole';
        }

        if (body.roleId) {
          const roleDef = db.roles.find((r) => r.id === body.roleId);
          if (roleDef) {
            target.roleId = roleDef.id;
            if (!body.permissions) {
              target.permissions = { ...roleDef.permissions };
            }
          }
        }

        if (body.permissions) {
          target.permissions = {
            viewOrders: Boolean(
              body.permissions.viewOrders ?? target.permissions.viewOrders,
            ),
            createOrders: Boolean(
              body.permissions.createOrders ?? target.permissions.createOrders,
            ),
            editOrders: Boolean(
              body.permissions.editOrders ?? target.permissions.editOrders,
            ),
            deleteOrders: Boolean(
              body.permissions.deleteOrders ?? target.permissions.deleteOrders,
            ),
            printOrders: Boolean(
              body.permissions.printOrders ?? target.permissions.printOrders,
            ),
            exportData: Boolean(
              body.permissions.exportData ?? target.permissions.exportData,
            ),
            manageUsers: Boolean(
              body.permissions.manageUsers ?? target.permissions.manageUsers,
            ),
          };
        }

        if (
          body.status &&
          ['pending', 'approved', 'rejected', 'suspended'].includes(body.status)
        ) {
          target.status = body.status;
          if (body.status === 'approved') {
            target.validatedAt = new Date().toISOString();
            target.validatedBy = actor.fullName;
          }
        }

        if (pgPool) {
          await pgPool.query(
            `UPDATE users
             SET full_name = $1, department = $2, role_id = $3, status = $4,
                 permissions = $5::jsonb, validated_at = $6, validated_by = $7
             WHERE id = $8`,
            [
              target.fullName,
              target.department,
              target.roleId,
              target.status,
              JSON.stringify(target.permissions),
              target.validatedAt || null,
              target.validatedBy || null,
              target.id,
            ],
          );
        }

        if (body.status && body.status !== prevStatus) {
          const actionMap: Record<UserStatus, ActivityLog['action']> = {
            approved: 'user_approved',
            rejected: 'user_rejected',
            suspended: 'user_suspended',
            pending: 'permissions_updated',
          };
          await addLog(
            actor.id,
            actor.fullName,
            actionMap[body.status],
            target.fullName,
            `Statut mis à jour : ${body.status} (${target.email})`,
          );
        } else {
          await addLog(
            actor.id,
            actor.fullName,
            'permissions_updated',
            target.fullName,
            `Rôle / droits mis à jour (${target.roleId})`,
          );
        }

        saveJsonDatabase();
        broadcastEvent('users_updated', { reason: 'admin_patch', userId: target.id });

        res.json({ user: sanitizeUser(target), overview: buildAdminOverview() });
      } catch (err) {
        console.error('Admin patch user error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour utilisateur.' });
      }
    },
  );

  app.delete(
    '/api/admin/users/:id',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const actor = req.currentUser!;
        const targetId = req.params.id;
        if (targetId === actor.id) {
          res
            .status(400)
            .json({ error: 'Impossible de supprimer votre propre compte connecté.' });
          return;
        }
        const target = db.users.find((u) => u.id === targetId);
        if (!target) {
          res.status(404).json({ error: 'Utilisateur introuvable.' });
          return;
        }

        if (pgPool) {
          // Preserve order attribution while removing user if referenced
          const hasOrders = db.orders.some((o) => o.createdById === targetId);
          if (hasOrders) {
            await pgPool.query(
              'UPDATE repair_orders SET created_by_id = $1 WHERE created_by_id = $2',
              [actor.id, targetId],
            );
          }
          await pgPool.query('DELETE FROM users WHERE id = $1', [targetId]);
        }

        db.users = db.users.filter((u) => u.id !== targetId);
        await addLog(
          actor.id,
          actor.fullName,
          'user_suspended',
          target.fullName,
          `Compte supprimé (${target.email})`,
        );
        saveJsonDatabase();
        broadcastEvent('users_updated', { reason: 'deleted', userId: targetId });

        res.json({ overview: buildAdminOverview() });
      } catch (err) {
        console.error('Admin delete user error:', err);
        res.status(500).json({ error: 'Erreur lors de la suppression du compte.' });
      }
    },
  );

  // Create or update custom role templates
  app.post(
    '/api/admin/roles',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const actor = req.currentUser!;
        const body = req.body as {
          label?: string;
          description?: string;
          permissions?: UserPermissions;
        };
        const label = String(body.label || '').trim();
        if (!label) {
          res.status(400).json({ error: 'Le libellé du rôle est obligatoire.' });
          return;
        }
        const id = label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        if (!id || db.roles.some((r) => r.id === id)) {
          res.status(409).json({ error: 'Un rôle avec cet identifiant existe déjà.' });
          return;
        }

        const role: RoleDefinition = {
          id,
          label,
          description: String(body.description || 'Rôle personnalisé').trim(),
          isSystem: false,
          permissions: {
            viewOrders: Boolean(body.permissions?.viewOrders ?? true),
            createOrders: Boolean(body.permissions?.createOrders),
            editOrders: Boolean(body.permissions?.editOrders),
            deleteOrders: Boolean(body.permissions?.deleteOrders),
            printOrders: Boolean(body.permissions?.printOrders ?? true),
            exportData: Boolean(body.permissions?.exportData),
            manageUsers: Boolean(body.permissions?.manageUsers),
          },
        };

        if (pgPool) {
          await pgPool.query(
            `INSERT INTO roles (id, label, description, permissions, is_system)
             VALUES ($1, $2, $3, $4::jsonb, false)`,
            [role.id, role.label, role.description, JSON.stringify(role.permissions)],
          );
        }

        db.roles.push(role);
        await addLog(
          actor.id,
          actor.fullName,
          'role_updated',
          role.label,
          'Nouveau rôle créé',
        );
        saveJsonDatabase();
        broadcastEvent('roles_updated', { roleId: role.id });

        res.status(201).json({ role, overview: buildAdminOverview() });
      } catch (err) {
        console.error('Create role error:', err);
        res.status(500).json({ error: 'Erreur lors de la création du rôle.' });
      }
    },
  );

  app.put(
    '/api/admin/roles/:id',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const actor = req.currentUser!;
        const roleId = req.params.id;
        const role = db.roles.find((r) => r.id === roleId);
        if (!role) {
          res.status(404).json({ error: 'Rôle introuvable.' });
          return;
        }

        const body = req.body as {
          label?: string;
          description?: string;
          permissions?: UserPermissions;
          syncUsers?: boolean;
        };

        if (body.label && body.label.trim()) {
          role.label = body.label.trim();
        }
        if (typeof body.description === 'string') {
          role.description = body.description.trim();
        }
        if (body.permissions) {
          role.permissions = {
            viewOrders: Boolean(body.permissions.viewOrders),
            createOrders: Boolean(body.permissions.createOrders),
            editOrders: Boolean(body.permissions.editOrders),
            deleteOrders: Boolean(body.permissions.deleteOrders),
            printOrders: Boolean(body.permissions.printOrders),
            exportData: Boolean(body.permissions.exportData),
            manageUsers: role.id === 'admin' ? true : Boolean(body.permissions.manageUsers),
          };
        }

        if (pgPool) {
          await pgPool.query(
            `UPDATE roles SET label = $1, description = $2, permissions = $3::jsonb WHERE id = $4`,
            [role.label, role.description, JSON.stringify(role.permissions), role.id],
          );
          if (body.syncUsers) {
            await pgPool.query(
              `UPDATE users SET permissions = $1::jsonb WHERE role_id = $2`,
              [JSON.stringify(role.permissions), role.id],
            );
          }
        }

        if (body.syncUsers) {
          for (const u of db.users) {
            if (u.roleId === role.id) {
              u.permissions = { ...role.permissions };
            }
          }
        }

        await addLog(
          actor.id,
          actor.fullName,
          'role_updated',
          role.label,
          body.syncUsers
            ? 'Modèle mis à jour et appliqué aux utilisateurs'
            : 'Modèle mis à jour',
        );
        saveJsonDatabase();
        broadcastEvent('roles_updated', { roleId: role.id });
        broadcastEvent('users_updated', { reason: 'role_sync', roleId: role.id });

        res.json({ role, overview: buildAdminOverview() });
      } catch (err) {
        console.error('Update role error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle.' });
      }
    },
  );

  app.delete(
    '/api/admin/roles/:id',
    requireAuth,
    requireApproved,
    requirePermission('manageUsers'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const actor = req.currentUser!;
        const roleId = req.params.id;
        const role = db.roles.find((r) => r.id === roleId);
        if (!role) {
          res.status(404).json({ error: 'Rôle introuvable.' });
          return;
        }
        if (role.isSystem) {
          res.status(400).json({ error: 'Les rôles système ne peuvent pas être supprimés.' });
          return;
        }

        if (pgPool) {
          await pgPool.query('UPDATE users SET role_id = $1 WHERE role_id = $2', [
            'consultant',
            roleId,
          ]);
          await pgPool.query('DELETE FROM roles WHERE id = $1', [roleId]);
        }

        db.roles = db.roles.filter((r) => r.id !== roleId);
        for (const u of db.users) {
          if (u.roleId === roleId) {
            u.roleId = 'consultant';
          }
        }
        await addLog(
          actor.id,
          actor.fullName,
          'role_updated',
          role.label,
          'Rôle personnalisé supprimé',
        );
        saveJsonDatabase();
        broadcastEvent('roles_updated', { roleId });

        res.json({ overview: buildAdminOverview() });
      } catch (err) {
        console.error('Delete role error:', err);
        res.status(500).json({ error: 'Erreur lors de la suppression du rôle.' });
      }
    },
  );

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Parc Auto Protocole server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
