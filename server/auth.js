// Sign-in: usernames and passwords, with sessions kept in the database.
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool, tx } from "./db.js";

const COOKIE = "pf_session";
const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const normUsername = (u) => String(u || "").trim().toLowerCase();

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(req, res, value, maxAgeSec) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`);
}

const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role });

async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId]);
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

/** Middleware: puts the signed-in user on req.user (or leaves it undefined). */
export async function loadUser(req, res, next) {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [sha256(token)]);
      if (rows[0]) req.user = rows[0];
    }
    next();
  } catch (e) { next(e); }
}

export function requireUser(req, res, next) {
  if (!req.user) return next(new HttpError(401, "Please sign in."));
  next();
}

// Simple protection against password guessing: 10 failed tries per name per 15 minutes.
const failures = new Map();
function tooManyTries(key) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) return false;
  return f.count >= 10;
}
function noteFailure(key) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + 15 * 60000 });
  else f.count++;
}

export function authRoutes(app, wrap) {
  // Is anyone set up yet, and who is signed in?
  app.get("/api/auth/status", wrap(async (req, res) => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE password_hash IS NOT NULL AND active");
    res.json({ needsSetup: rows[0].n === 0, user: req.user ? publicUser(req.user) : null });
  }));

  // First run only: create the administrator account.
  app.post("/api/auth/setup", wrap(async (req, res) => {
    const { name, username, password } = req.body || {};
    const u = normUsername(username);
    if (!String(name || "").trim() || !u) throw new HttpError(400, "Enter your name and a username.");
    if (String(password || "").length < MIN_PASSWORD) throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
    const hash = await hashPassword(password);
    const user = await tx(async (c) => {
      await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
      const { rows } = await c.query("SELECT count(*)::int AS n FROM users WHERE password_hash IS NOT NULL AND active");
      if (rows[0].n > 0) throw new HttpError(409, "The administrator account already exists. Please sign in.");
      const r = await c.query(
        "INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING *",
        [String(name).trim(), u, hash]);
      return r.rows[0];
    });
    await startSession(req, res, user.id);
    res.status(201).json({ user: publicUser(user) });
  }));

  app.post("/api/auth/login", wrap(async (req, res) => {
    const u = normUsername(req.body?.username);
    const key = `${req.ip}|${u}`;
    if (tooManyTries(key)) throw new HttpError(429, "Too many wrong tries. Wait 15 minutes and try again.");
    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1 AND active", [u]);
    const user = rows[0];
    const ok = user && user.password_hash && (await bcrypt.compare(String(req.body?.password || ""), user.password_hash));
    if (!ok) {
      noteFailure(key);
      throw new HttpError(401, "That username and password don't match.");
    }
    failures.delete(key);
    await startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  }));

  app.post("/api/auth/logout", wrap(async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
    setCookie(req, res, "", 0);
    res.json({ ok: true });
  }));

  app.post("/api/auth/password", requireUser, wrap(async (req, res) => {
    const { current, next: nextPw } = req.body || {};
    if (String(nextPw || "").length < MIN_PASSWORD) throw new HttpError(400, `Use a new password of at least ${MIN_PASSWORD} characters.`);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0]?.password_hash || !(await bcrypt.compare(String(current || ""), rows[0].password_hash))) {
      throw new HttpError(400, "Your current password isn't right.");
    }
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [req.user.id, await hashPassword(nextPw)]);
    // Sign out other devices, keep this one
    await pool.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [req.user.id, sha256(readCookie(req, COOKIE) || "")]);
    res.json({ ok: true });
  }));
}
