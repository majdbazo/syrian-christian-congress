const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../src/db');

const IMAGES_DIR = path.join(__dirname, '../public/images');
const NEWS_IMAGES_DIR = path.join(__dirname, '../public/images/news');
if (!fs.existsSync(NEWS_IMAGES_DIR)) fs.mkdirSync(NEWS_IMAGES_DIR, { recursive: true });

// Cloudinary (optional — supports CLOUDINARY_URL or individual vars)
let cloudinary = null;
try {
  const hasUrl = !!process.env.CLOUDINARY_URL;
  const hasVars = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
  if (hasUrl || hasVars) {
    cloudinary = require('cloudinary').v2;
    if (hasVars) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
    // CLOUDINARY_URL is picked up automatically by the SDK when set
  }
} catch (e) { console.warn('Cloudinary unavailable:', e.message); }

async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'scc-news', resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

function generateSlug(title) {
  const base = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `article-${suffix}`;
}

// ── Auth middleware ────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
};

// ── Multer for news image upload (memory) ─────────────────────────────────
const newsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

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

// ── Newsletter subscribers ─────────────────────────────────────────────────
router.get('/newsletter', async (req, res) => {
  try {
    const subscribers = await db.getNewsletterSubscribers();
    res.json({ success: true, subscribers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/newsletter/:id', async (req, res) => {
  try {
    await db.deleteNewsletterSubscriber(parseInt(req.params.id));
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

// ── News Articles CRUD ────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  try {
    const articles = await db.getNewsArticles();
    res.json({ success: true, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/news/upload-image', newsUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image provided' });
    let url;
    if (cloudinary) {
      const result = await uploadToCloudinary(req.file.buffer);
      url = result.secure_url;
    } else {
      const filename = Date.now() + '_' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      fs.writeFileSync(path.join(NEWS_IMAGES_DIR, filename), req.file.buffer);
      url = '/images/news/' + filename;
    }
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/news', newsUpload.single('image'), async (req, res) => {
  try {
    const { title_en, title_ar, body_en, body_ar, status } = req.body;
    if (!title_en?.trim()) return res.status(400).json({ success: false, error: 'Title (English) is required' });

    let image_url = null, image_public_id = null;
    if (req.file) {
      if (cloudinary) {
        const result = await uploadToCloudinary(req.file.buffer);
        image_url = result.secure_url;
        image_public_id = result.public_id;
      } else {
        const fname = Date.now() + '_' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        fs.writeFileSync(path.join(NEWS_IMAGES_DIR, fname), req.file.buffer);
        image_url = '/images/news/' + fname;
      }
    }

    const article = await db.createNewsArticle({
      title_en: title_en.trim(),
      title_ar: (title_ar || '').trim(),
      body_en: body_en || '',
      body_ar: body_ar || '',
      image_url,
      image_public_id,
      slug: generateSlug(title_en.trim()),
      status: status || 'draft',
    });
    res.json({ success: true, article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/news/:id', newsUpload.single('image'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title_en, title_ar, body_en, body_ar, status, remove_image } = req.body;
    if (!title_en?.trim()) return res.status(400).json({ success: false, error: 'Title (English) is required' });

    const existing = await db.getNewsArticleById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Article not found' });

    let image_url = existing.image_url;
    let image_public_id = existing.image_public_id;

    if (remove_image === '1') {
      if (image_public_id && cloudinary) {
        try { await cloudinary.uploader.destroy(image_public_id); } catch (_) {}
      }
      image_url = null;
      image_public_id = null;
    } else if (req.file) {
      if (image_public_id && cloudinary) {
        try { await cloudinary.uploader.destroy(image_public_id); } catch (_) {}
      }
      if (cloudinary) {
        const result = await uploadToCloudinary(req.file.buffer);
        image_url = result.secure_url;
        image_public_id = result.public_id;
      } else {
        const fname = Date.now() + '_' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        fs.writeFileSync(path.join(NEWS_IMAGES_DIR, fname), req.file.buffer);
        image_url = '/images/news/' + fname;
        image_public_id = null;
      }
    }

    const article = await db.updateNewsArticle(id, {
      title_en: title_en.trim(),
      title_ar: (title_ar || '').trim(),
      body_en: body_en || '',
      body_ar: body_ar || '',
      image_url,
      image_public_id,
      slug: existing.slug,
      status: status || 'draft',
    });
    res.json({ success: true, article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/news/:id', async (req, res) => {
  try {
    const article = await db.deleteNewsArticle(parseInt(req.params.id));
    if (article?.image_public_id && cloudinary) {
      try { await cloudinary.uploader.destroy(article.image_public_id); } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
