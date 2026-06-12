// Uses PostgreSQL when DATABASE_URL is set, otherwise in-memory for local dev.

const fs = require('fs');
const path = require('path');
const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

const readSettings = () => {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return { contact_email: '', facebook_url: '', x_url: '' }; }
};
const writeSettings = (data) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
};

let pool = null;
let memStore = null;

/* ── Seed data ────────────────────────────────────────────────────────────── */
const seedData = [
  {
    id: 1,
    title_en: 'Syrian Christian Congress — Founding Conference',
    title_ar: 'المؤتمر التأسيسي للمؤتمر المسيحي السوري',
    description_en: 'The founding conference of the Syrian Christian Congress, bringing together Christian communities from Syria and the diaspora to establish a unified civic voice and lay the institutional groundwork for the Congress.',
    description_ar: 'المؤتمر التأسيسي للمؤتمر المسيحي السوري، يجمع المجتمعات المسيحية من سوريا والمهجر لإرساء صوت مدني موحد وأسس مؤسسية للمؤتمر.',
    event_date: '2026-09-15T10:00:00.000Z',
    end_date: '2026-09-16T18:00:00.000Z',
    location: 'Beirut, Lebanon',
    event_type: 'upcoming',
    image_name: 'monastery-hillside.jpg',
  },
  {
    id: 2,
    title_en: 'Diaspora Outreach Forum',
    title_ar: 'منتدى التواصل مع المهجر',
    description_en: 'A forum connecting Syrian Christian diaspora communities across Europe and the Americas to coordinate advocacy efforts and share resources for community building.',
    description_ar: 'منتدى يربط مجتمعات الشتات المسيحي السوري في أوروبا والأمريكيتين لتنسيق جهود المناصرة وتبادل الموارد.',
    event_date: '2026-11-20T14:00:00.000Z',
    end_date: '2026-11-20T18:00:00.000Z',
    location: 'Online — Zoom',
    event_type: 'upcoming',
    image_name: 'church-interior.jpg',
  },
  {
    id: 3,
    title_en: 'Rule of Law & Equal Citizenship Symposium',
    title_ar: 'ندوة سيادة القانون والمواطنة المتساوية',
    description_en: 'A symposium exploring legal and constitutional frameworks for equal citizenship and the protection of religious minorities in a future Syria, with jurists and civic leaders from across the region.',
    description_ar: 'ندوة تستكشف الأطر القانونية والدستورية للمواطنة المتساوية وحماية الأقليات الدينية في سوريا المستقبل.',
    event_date: '2027-02-10T09:00:00.000Z',
    end_date: '2027-02-11T17:00:00.000Z',
    location: 'Washington D.C., USA',
    event_type: 'upcoming',
    image_name: 'church-tower.jpg',
  },
  {
    id: 4,
    title_en: 'Inaugural Meeting of the Organizing Committee',
    title_ar: 'الاجتماع التأسيسي للجنة التنظيمية',
    description_en: 'The first formal meeting of the Syrian Christian Congress organizing committee, establishing the foundational framework, charter, and roadmap for the Congress.',
    description_ar: 'الاجتماع الأول للجنة التنظيمية للمؤتمر المسيحي السوري، يرسي الإطار التأسيسي والنظام الأساسي وخارطة طريق المؤتمر.',
    event_date: '2025-12-10T10:00:00.000Z',
    end_date: '2025-12-10T16:00:00.000Z',
    location: 'Stockholm, Sweden',
    event_type: 'past',
    image_name: 'monastery-courtyard.jpg',
  },
  {
    id: 5,
    title_en: 'Community Consultations — Europe Tour',
    title_ar: 'مشاورات المجتمع — جولة أوروبية',
    description_en: 'A series of community consultations held across major European cities — Stockholm, Berlin, Paris, and London — gathering input from Syrian Christian communities on the Congress mission, structure, and priorities.',
    description_ar: 'سلسلة مشاورات مجتمعية في كبرى المدن الأوروبية لجمع مدخلات من المجتمعات المسيحية السورية حول رسالة المؤتمر وهيكله وأولوياته.',
    event_date: '2026-03-01T10:00:00.000Z',
    end_date: '2026-03-15T18:00:00.000Z',
    location: 'Multiple European Cities',
    event_type: 'past',
    image_name: 'monastery-canyon.jpg',
  },
];

/* ── In-memory store ──────────────────────────────────────────────────────── */
class MemStore {
  constructor() {
    this.events = seedData.map(e => ({ ...e }));
    this.registrations = [];
    this.contacts = [];
    this.newsletter = [];
    this._nextEventId = 6;
    this._nextRegId = 1;
    this._nextContactId = 1;
    this._nextNewsletterId = 1;
  }

  // Events
  async getEvents() { return [...this.events].sort((a, b) => new Date(a.event_date) - new Date(b.event_date)); }
  async createEvent(data) {
    const ev = { id: this._nextEventId++, ...data, created_at: new Date() };
    this.events.push(ev);
    return ev;
  }
  async updateEvent(id, data) {
    const idx = this.events.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Event not found');
    this.events[idx] = { ...this.events[idx], ...data };
    return this.events[idx];
  }
  async deleteEvent(id) { this.events = this.events.filter(e => e.id !== id); }

  // Registrations
  async getRegistrations() { return [...this.registrations].reverse(); }
  async addRegistration(data) {
    const dupe = this.registrations.find(r => r.email === data.email);
    if (dupe) { const err = new Error('duplicate'); err.code = '23505'; throw err; }
    this.registrations.push({ id: this._nextRegId++, ...data, created_at: new Date() });
  }
  async deleteRegistration(id) { this.registrations = this.registrations.filter(r => r.id !== id); }

  // Messages
  async getMessages() { return [...this.contacts].reverse(); }
  async addContact(data) {
    this.contacts.push({ id: this._nextContactId++, ...data, created_at: new Date() });
  }
  async deleteMessage(id) { this.contacts = this.contacts.filter(c => c.id !== id); }

  // Stats
  async getStats() {
    return {
      total_registrations: this.registrations.length,
      upcoming_events: this.events.filter(e => e.event_type === 'upcoming').length,
      past_events: this.events.filter(e => e.event_type === 'past').length,
      total_messages: this.contacts.length,
    };
  }

  // Members by country
  async getMembersByCountry() {
    const counts = {};
    for (const r of this.registrations) {
      const c = r.country || 'Unknown';
      counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Newsletter
  async addNewsletterSubscriber(email) {
    if (this.newsletter.find(s => s.email === email)) {
      const err = new Error('duplicate'); err.code = '23505'; throw err;
    }
    this.newsletter.push({ id: this._nextNewsletterId++, email, created_at: new Date() });
  }
  async getNewsletterSubscribers() { return [...this.newsletter].reverse(); }
  async deleteNewsletterSubscriber(id) { this.newsletter = this.newsletter.filter(s => s.id !== id); }
}

/* ── PostgreSQL helpers ───────────────────────────────────────────────────── */
const pgInit = async (client) => {
  await client.query(`CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL, address TEXT, country VARCHAR(100), state VARCHAR(100),
    denomination VARCHAR(200), about_yourself TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title_en VARCHAR(255) NOT NULL, title_ar VARCHAR(255),
    description_en TEXT, description_ar TEXT,
    event_date TIMESTAMP NOT NULL, end_date TIMESTAMP, location VARCHAR(255),
    event_type VARCHAR(20) DEFAULT 'upcoming', image_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS contact_messages (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, email VARCHAR(255) NOT NULL,
    subject VARCHAR(300), message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const { rows } = await client.query('SELECT COUNT(*) FROM events');
  if (parseInt(rows[0].count) === 0) {
    for (const e of seedData) {
      await client.query(
        `INSERT INTO events (title_en,title_ar,description_en,description_ar,
         event_date,end_date,location,event_type,image_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.title_en,e.title_ar,e.description_en,e.description_ar,
         e.event_date,e.end_date,e.location,e.event_type,e.image_name]
      );
    }
  }
};

/* ── Init ─────────────────────────────────────────────────────────────────── */
const initDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    memStore = new MemStore();
    console.log('Running with in-memory store (no DATABASE_URL set)');
    return;
  }
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try { await pgInit(client); console.log('PostgreSQL initialized'); }
  finally { client.release(); }
};

/* ── Unified DB interface ─────────────────────────────────────────────────── */
const db = {
  // Public
  async getEvents() {
    if (memStore) return memStore.getEvents();
    const { rows } = await pool.query('SELECT * FROM events ORDER BY event_date ASC');
    return rows;
  },
  async addRegistration(data) {
    if (memStore) return memStore.addRegistration(data);
    await pool.query(
      `INSERT INTO registrations (first_name,last_name,email,address,country,state,denomination,about_yourself)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [data.first_name,data.last_name,data.email,data.address,data.country,data.state,data.denomination,data.about_yourself]
    );
  },
  async addContact(data) {
    if (memStore) return memStore.addContact(data);
    await pool.query('INSERT INTO contact_messages (name,email,subject,message) VALUES ($1,$2,$3,$4)',
      [data.name,data.email,data.subject,data.message]);
  },

  // Admin – Events
  async createEvent(data) {
    if (memStore) return memStore.createEvent(data);
    const { rows } = await pool.query(
      `INSERT INTO events (title_en,title_ar,description_en,description_ar,
       event_date,end_date,location,event_type,image_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [data.title_en,data.title_ar,data.description_en,data.description_ar,
       data.event_date,data.end_date,data.location,data.event_type,data.image_name]
    );
    return rows[0];
  },
  async updateEvent(id, data) {
    if (memStore) return memStore.updateEvent(id, data);
    const { rows } = await pool.query(
      `UPDATE events SET title_en=$1,title_ar=$2,description_en=$3,description_ar=$4,
       event_date=$5,end_date=$6,location=$7,event_type=$8,image_name=$9
       WHERE id=$10 RETURNING *`,
      [data.title_en,data.title_ar,data.description_en,data.description_ar,
       data.event_date,data.end_date,data.location,data.event_type,data.image_name,id]
    );
    return rows[0];
  },
  async deleteEvent(id) {
    if (memStore) return memStore.deleteEvent(id);
    await pool.query('DELETE FROM events WHERE id=$1', [id]);
  },

  // Admin – Registrations
  async getRegistrations() {
    if (memStore) return memStore.getRegistrations();
    const { rows } = await pool.query('SELECT * FROM registrations ORDER BY created_at DESC');
    return rows;
  },
  async deleteRegistration(id) {
    if (memStore) return memStore.deleteRegistration(id);
    await pool.query('DELETE FROM registrations WHERE id=$1', [id]);
  },

  // Admin – Messages
  async getMessages() {
    if (memStore) return memStore.getMessages();
    const { rows } = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    return rows;
  },
  async deleteMessage(id) {
    if (memStore) return memStore.deleteMessage(id);
    await pool.query('DELETE FROM contact_messages WHERE id=$1', [id]);
  },

  // Admin – Stats
  async getStats() {
    if (memStore) return memStore.getStats();
    const [reg, upcoming, past, msg] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM registrations'),
      pool.query("SELECT COUNT(*) FROM events WHERE event_type='upcoming'"),
      pool.query("SELECT COUNT(*) FROM events WHERE event_type='past'"),
      pool.query('SELECT COUNT(*) FROM contact_messages'),
    ]);
    return {
      total_registrations: parseInt(reg.rows[0].count),
      upcoming_events: parseInt(upcoming.rows[0].count),
      past_events: parseInt(past.rows[0].count),
      total_messages: parseInt(msg.rows[0].count),
    };
  },

  // Members by country
  async getMembersByCountry() {
    if (memStore) return memStore.getMembersByCountry();
    const { rows } = await pool.query(
      `SELECT country, COUNT(*)::int AS count FROM registrations
       WHERE country IS NOT NULL AND country <> ''
       GROUP BY country ORDER BY count DESC`
    );
    return rows;
  },

  // Newsletter
  async addNewsletterSubscriber(email) {
    if (memStore) return memStore.addNewsletterSubscriber(email);
    await pool.query('INSERT INTO newsletter_subscribers (email) VALUES ($1)', [email]);
  },
  async getNewsletterSubscribers() {
    if (memStore) return memStore.getNewsletterSubscribers();
    const { rows } = await pool.query('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC');
    return rows;
  },
  async deleteNewsletterSubscriber(id) {
    if (memStore) return memStore.deleteNewsletterSubscriber(id);
    await pool.query('DELETE FROM newsletter_subscribers WHERE id=$1', [id]);
  },

  // Settings (file-based, same for both modes)
  async getSettings() { return readSettings(); },
  async saveSettings(data) {
    const current = readSettings();
    const updated = {
      contact_email: typeof data.contact_email === 'string' ? data.contact_email.trim() : current.contact_email,
      facebook_url: typeof data.facebook_url === 'string' ? data.facebook_url.trim() : current.facebook_url,
      x_url: typeof data.x_url === 'string' ? data.x_url.trim() : current.x_url,
    };
    writeSettings(updated);
    return updated;
  },
};

module.exports = { db, initDatabase };
