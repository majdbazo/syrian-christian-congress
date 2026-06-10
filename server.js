require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./src/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
}));

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

let sessionStore;
if (process.env.DATABASE_URL) {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    conString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    createTableIfMissing: true,
  });
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'scc-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts' });

app.use('/api/register', formLimiter);
app.use('/api/contact', formLimiter);
app.use('/api/admin/login', loginLimiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Page routes — no-cache so browsers always get the latest HTML
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
};
app.get('/', noCache, (req, res) => res.render('pages/index'));
app.get('/events.html', noCache, (req, res) => res.render('pages/events'));
app.get('/register.html', noCache, (req, res) => res.render('pages/register'));
app.get('/contact.html', noCache, (req, res) => res.render('pages/contact'));
app.get('/members.html', noCache, (req, res) => res.render('pages/members'));
app.get('/communities.html', noCache, (req, res) => res.render('pages/communities'));

initDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  });
