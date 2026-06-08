const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../src/db');

const IMAGES_DIR = path.join(__dirname, '../public/images');

// ── Auth middleware ────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
};

// ── Multer for image upload ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|gif|webp|svg)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── POST /api/admin/login ──────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'scc-admin-2026';

  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    req.session.loginTime = Date.now();
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// ── POST /api/admin/logout ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── GET /api/admin/check ───────────────────────────────────────────────────
router.get('/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// All routes below require admin auth
router.use(requireAdmin);

// ── GET /api/admin/stats ───────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    const images = fs.readdirSync(IMAGES_DIR).filter(f =>
      /\.(jpe?g|png|gif|webp|svg)$/i.test(f) && f !== '.gitkeep'
    );
    stats.total_images = images.length;
    res.json({ success: true, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// ── Events CRUD ────────────────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const events = await db.getEvents();
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const ev = await db.createEvent(req.body);
    res.json({ success: true, event: ev });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const ev = await db.updateEvent(parseInt(req.params.id), req.body);
    res.json({ success: true, event: ev });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await db.deleteEvent(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Registrations ──────────────────────────────────────────────────────────
router.get('/registrations', async (req, res) => {
  try {
    const regs = await db.getRegistrations();
    res.json({ success: true, registrations: regs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/registrations/:id', async (req, res) => {
  try {
    await db.deleteRegistration(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Messages ───────────────────────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  try {
    const msgs = await db.getMessages();
    res.json({ success: true, messages: msgs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await db.deleteMessage(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Settings ───────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const updated = await db.saveSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Member stats ───────────────────────────────────────────────────────────
router.get('/members', async (req, res) => {
  try {
    const data = await db.getMembersByCountry();
    const total = data.reduce((sum, r) => sum + r.count, 0);
    res.json({ success: true, total, byCountry: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Images ─────────────────────────────────────────────────────────────────
router.get('/images', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR)
      .filter(f => /\.(jpe?g|png|gif|webp|svg)$/i.test(f) && f !== '.gitkeep')
      .map(f => {
        const stat = fs.statSync(path.join(IMAGES_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json({ success: true, images: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/images/upload', upload.array('images', 20), (req, res) => {
  const uploaded = req.files.map(f => f.filename);
  res.json({ success: true, uploaded });
});

router.delete('/images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

module.exports = router;
