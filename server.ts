import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { randomUUID, scryptSync, randomBytes } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("bookmarks.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    tag TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Add googleId column if it doesn't exist
try {
  db.exec("ALTER TABLE users ADD COLUMN googleId TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId)");
} catch (e) {
  // Column already exists, ignore
}

// Helper for passwords
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return key === derivedKey;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Middleware
  const requireAuth = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    const stmt = db.prepare("SELECT userId FROM sessions WHERE token = ?");
    const session = stmt.get(token) as any;
    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }
    req.userId = session.userId;
    next();
  };

  // Auth Routes
  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });
    
    try {
      const id = randomUUID();
      const hashed = hashPassword(password);
      db.prepare("INSERT INTO users (id, username, password) VALUES (?, ?, ?)").run(id, username, hashed);
      
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token, userId) VALUES (?, ?)").run(token, id);
      
      res.json({ token, username });
    } catch (e: any) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "Username already exists" });
      } else {
        res.status(500).json({ error: "Server error" });
      }
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, userId) VALUES (?, ?)").run(token, user.id);
    
    res.json({ token, username });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = req.headers.authorization!.split(" ")[1];
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, (req: any, res) => {
    const user = db.prepare("SELECT username FROM users WHERE id = ?").get(req.userId) as any;
    res.json({ username: user.username });
  });

  // Google OAuth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const appUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    const redirectUri = `${appUrl}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent'
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    const appUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        })
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error('Token error response:', tokenData);
        throw new Error('Failed to get access token');
      }

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userRes.json();

      if (!userData.id) throw new Error('Failed to get user info');

      // Find or create user
      let user = db.prepare("SELECT * FROM users WHERE googleId = ?").get(userData.id) as any;
      
      if (!user) {
        // Check if email already exists as username
        user = db.prepare("SELECT * FROM users WHERE username = ?").get(userData.email) as any;
        if (user) {
          // Link google account to existing user
          db.prepare("UPDATE users SET googleId = ? WHERE id = ?").run(userData.id, user.id);
        } else {
          // Create new user
          const id = randomUUID();
          const username = userData.email;
          const hashed = hashPassword(randomBytes(16).toString('hex')); // Random password
          db.prepare("INSERT INTO users (id, username, password, googleId) VALUES (?, ?, ?, ?)").run(id, username, hashed, userData.id);
          user = { id, username };
        }
      }

      // Create session
      const sessionToken = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token, userId) VALUES (?, ?)").run(sessionToken, user.id);

      // Send success HTML
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  token: '${sessionToken}',
                  username: '${user.username}'
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth error:', error);
      res.status(500).send('Authentication failed. Please check your Google OAuth credentials.');
    }
  });

  // API Routes
  app.get("/api/bookmarks", requireAuth, (req: any, res) => {
    const stmt = db.prepare("SELECT * FROM bookmarks WHERE userId = ? ORDER BY createdAt DESC");
    const bookmarks = stmt.all(req.userId);
    res.json(bookmarks);
  });

  app.post("/api/bookmarks", requireAuth, (req: any, res) => {
    const { url, title, tag } = req.body;
    const id = randomUUID();
    const createdAt = Date.now();
    const userId = req.userId;
    
    const stmt = db.prepare("INSERT INTO bookmarks (id, userId, url, title, tag, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(id, userId, url, title, tag, createdAt);
    
    res.json({ id, url, title, tag, createdAt });
  });

  app.delete("/api/bookmarks/:id", requireAuth, (req: any, res) => {
    const { id } = req.params;
    const userId = req.userId;
    const stmt = db.prepare("DELETE FROM bookmarks WHERE id = ? AND userId = ?");
    stmt.run(id, userId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
