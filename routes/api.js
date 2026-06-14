const express = require('express');
const router = express.Router();
const { db } = require('../src/db');
const { sendRegistrationNotification, sendContactNotification } = require('../src/mailer');

const safe = (str) => (typeof str === 'string' ? str.trim().slice(0, 2000) : '');

const formatICSDate = (date) =>
  new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

// GET /api/events
router.get('/events', async (req, res) => {
  try {
    const events = await db.getEvents();
    res.json({ success: true, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

// POST /api/register
router.post('/register', async (req, res) => {
  const { first_name, last_name, email, address, country, state, denomination, about_yourself } = req.body;

  if (!first_name || !last_name || !email || !country || !state)
    return res.status(400).json({ success: false, error: 'Required fields missing' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, error: 'Invalid email address' });

  try {
    const reg = {
      first_name: safe(first_name), last_name: safe(last_name),
      email: safe(email).toLowerCase(), address: safe(address),
      country: safe(country), state: safe(state),
      denomination: safe(denomination), about_yourself: safe(about_yourself),
    };
    await db.addRegistration(reg);
    sendRegistrationNotification(reg).catch(err => console.error('Email notification failed:', err));
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ success: false, error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// POST /api/contact
router.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message)
    return res.status(400).json({ success: false, error: 'Required fields missing' });

  try {
    const contact = {
      name: safe(name), email: safe(email).toLowerCase(),
      subject: safe(subject), message: safe(message),
    };
    await db.addContact(contact);
    sendContactNotification(contact).catch(err => console.error('Contact notification failed:', err));
    res.json({ success: true, message: 'Message received' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// POST /api/newsletter
router.post('/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  try {
    await db.addNewsletterSubscriber(safe(email).toLowerCase());
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ success: false, error: 'Already subscribed' });
    console.error(err);
    res.status(500).json({ success: false, error: 'Subscription failed' });
  }
});

// GET /api/settings  — public (returns only social links)
router.get('/settings', async (req, res) => {
  try {
    const s = await db.getSettings();
    res.json({ success: true, facebook_url: s.facebook_url, x_url: s.x_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

// GET /api/members  — public member stats by country
router.get('/members', async (req, res) => {
  try {
    const data = await db.getMembersByCountry();
    const total = data.reduce((sum, r) => sum + r.count, 0);
    res.json({ success: true, total, byCountry: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to load member data' });
  }
});

// GET /api/calendar.ics
router.get('/calendar.ics', async (req, res) => {
  try {
    const events = await db.getEvents();
    const upcoming = events.filter(e => e.event_type === 'upcoming');

    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//Syrian Christian Congress//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Syrian Christian Congress Events',
      'X-WR-TIMEZONE:UTC',
    ];

    for (const ev of upcoming) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:scc-event-${ev.id}@syriancc.org`);
      lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
      lines.push(`DTSTART:${formatICSDate(ev.event_date)}`);
      if (ev.end_date) lines.push(`DTEND:${formatICSDate(ev.end_date)}`);
      lines.push(`SUMMARY:${ev.title_en}`);
      if (ev.description_en)
        lines.push(`DESCRIPTION:${ev.description_en.replace(/\n/g, '\\n').slice(0, 500)}`);
      if (ev.location) lines.push(`LOCATION:${ev.location}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="scc-events.ics"');
    res.send(lines.join('\r\n'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate calendar');
  }
});

// GET /api/wp-news — proxy WordPress posts with 5-min cache
let _wpCache = null;
let _wpCacheTs = 0;
const WP_TTL = 5 * 60 * 1000;
const WP_API = 'https://syrianchristiancongress.org/wp-json/wp/v2/posts?per_page=20&_embed&orderby=date&order=desc';

router.get('/wp-news', async (req, res) => {
  try {
    if (_wpCache && Date.now() - _wpCacheTs < WP_TTL) {
      return res.json({ success: true, articles: _wpCache });
    }
    const r = await fetch(WP_API);
    if (!r.ok) throw new Error(`WordPress API returned ${r.status}`);
    const posts = await r.json();
    const articles = posts.map(p => ({
      id: `wp-${p.id}`,
      title_en: p.title?.rendered || '',
      excerpt: (p.excerpt?.rendered || '').replace(/<[^>]+>/g, '').trim(),
      date: p.date,
      link: p.link,
      image_url: p._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      source: 'wordpress',
    }));
    _wpCache = articles;
    _wpCacheTs = Date.now();
    res.json({ success: true, articles });
  } catch (err) {
    console.error('WP fetch error:', err.message);
    res.status(502).json({ success: false, error: 'Could not fetch WordPress articles' });
  }
});

// GET /api/news — published articles
router.get('/news', async (req, res) => {
  try {
    const articles = await db.getNewsArticles(true);
    res.json({ success: true, articles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch articles' });
  }
});

// GET /api/news/:slug — single published article
router.get('/news/:slug', async (req, res) => {
  try {
    const article = await db.getNewsArticleBySlug(req.params.slug);
    if (!article || article.status !== 'published')
      return res.status(404).json({ success: false, error: 'Article not found' });
    res.json({ success: true, article });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch article' });
  }
});

module.exports = router;
