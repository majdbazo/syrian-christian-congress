/* ── State ────────────────────────────────────────────────────────────────── */
let currentLang = localStorage.getItem('scc-lang') || 'en';
let allEvents = [];

/* ── Init ─────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  applyLanguage(currentLang);
  initNav();
  initPage();
});

/* ── Language ─────────────────────────────────────────────────────────────── */
function applyLanguage(lang) {
  if (!translations[lang]) lang = 'en';
  currentLang = lang;
  localStorage.setItem('scc-lang', lang);

  const t = translations[lang];
  const html = document.documentElement;
  html.lang = lang;
  html.dir = t.dir;
  document.body.style.fontFamily = t.font;

  // Update all [data-i18n] elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = deepGet(t, key);
    if (val !== undefined) el.textContent = val;
  });

  // Update all [data-i18n-ph] placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    const val = deepGet(t, key);
    if (val !== undefined) el.placeholder = val;
  });

  // Update language button states
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Rebuild dynamic content that depends on language
  buildDenominationOptions();
  buildCountryOptions();
  if (allEvents.length) renderEvents(allEvents);
}

function deepGet(obj, path) {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

/* ── Navigation ───────────────────────────────────────────────────────────── */
function initNav() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');

  // Scroll: add solid class
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  // Hamburger toggle
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navMenu.classList.toggle('open');
    document.body.classList.toggle('menu-open');
  });

  // Close menu on link click
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      navMenu?.classList.remove('open');
      document.body.classList.remove('menu-open');
    });
  });

  // Language switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
  });

  // Active link highlighting
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active',
      href === path || (path === '/' && href === '/') ||
      (path.includes('events') && href.includes('events')) ||
      (path.includes('register') && href.includes('register')) ||
      (path.includes('contact') && href.includes('contact')) ||
      (path.includes('communities') && href.includes('communities')) ||
      (path.includes('members') && href.includes('members'))
    );
  });
}

/* ── Page router ──────────────────────────────────────────────────────────── */
function initPage() {
  const path = window.location.pathname;

  if (path === '/' || path.includes('index')) {
    initHomePage();
  } else if (path.includes('events')) {
    initEventsPage();
  } else if (path.includes('register')) {
    initRegisterPage();
  } else if (path.includes('contact')) {
    initContactPage();
  } else if (path.includes('communities')) {
    initCommunitiesPage();
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Calendar subscribe buttons
  document.querySelectorAll('.cal-subscribe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = '/api/calendar.ics';
    });
  });
}

/* ── Home page ────────────────────────────────────────────────────────────── */
async function initHomePage() {
  const container = document.getElementById('eventsPreview');
  if (!container) return;

  try {
    const data = await fetchEvents();
    allEvents = data;
    const upcoming = data.filter(e => e.event_type === 'upcoming').slice(0, 3);
    renderEventCards(container, upcoming, true);
  } catch {
    container.innerHTML = '<p class="events-error">Unable to load events.</p>';
  }
}

/* ── Events page ──────────────────────────────────────────────────────────── */
async function initEventsPage() {
  const upcomingContainer = document.getElementById('upcomingEvents');
  const pastContainer = document.getElementById('pastEvents');
  if (!upcomingContainer) return;

  showLoader(upcomingContainer);
  showLoader(pastContainer);

  try {
    const data = await fetchEvents();
    allEvents = data;
    renderEvents(data);
  } catch {
    upcomingContainer.innerHTML = '<p class="events-error">Unable to load events.</p>';
    if (pastContainer) pastContainer.innerHTML = '';
  }
}

function renderEvents(data) {
  const t = translations[currentLang];
  const upcomingContainer = document.getElementById('upcomingEvents');
  const pastContainer = document.getElementById('pastEvents');

  const upcoming = data.filter(e => e.event_type === 'upcoming');
  const past = data.filter(e => e.event_type === 'past');

  if (upcomingContainer) {
    if (upcoming.length === 0) {
      upcomingContainer.innerHTML = `<p class="events-empty">${t.events.no_upcoming}</p>`;
    } else {
      renderEventCards(upcomingContainer, upcoming, false);
    }
  }

  if (pastContainer) {
    if (past.length === 0) {
      pastContainer.innerHTML = `<p class="events-empty">${t.events.no_past}</p>`;
    } else {
      renderEventCards(pastContainer, past, false);
    }
  }
}

async function fetchEvents() {
  const res = await fetch('/api/events');
  if (!res.ok) throw new Error('fetch failed');
  const json = await res.json();
  return json.events || [];
}

function renderEventCards(container, events, isPreview) {
  const t = translations[currentLang];
  const langKey = currentLang === 'ar' ? 'ar' : 'en';

  container.innerHTML = events.map(ev => {
    const title = ev[`title_${langKey}`] || ev.title_en;
    const desc = ev[`description_${langKey}`] || ev.description_en;
    const date = formatEventDate(ev.event_date);
    const endDate = ev.end_date ? formatEventDate(ev.end_date) : null;
    const isPast = ev.event_type === 'past';
    const imgName = ev.image_name || 'event-default.jpg';

    return `
      <div class="event-card ${isPast ? 'past' : ''}">
        <div class="event-card-img">
          <img src="/images/${imgName}" alt="${title}"
               onerror="this.parentElement.classList.add('no-img')">
          ${isPast ? '<div class="event-badge past-badge" data-i18n="events.past">Past</div>' : ''}
        </div>
        <div class="event-card-body">
          <div class="event-meta">
            <span class="event-date">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${date}${endDate && endDate !== date ? ' – ' + endDate : ''}
            </span>
            <span class="event-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${ev.location || ''}
            </span>
          </div>
          <h3 class="event-title">${title}</h3>
          <p class="event-desc">${truncate(desc, isPreview ? 120 : 200)}</p>
          ${!isPast ? `
            <div class="event-actions">
              <a href="/api/calendar.ics" class="btn btn-sm btn-outline" download>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${t.events.add_calendar}
              </a>
            </div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ── Register page ────────────────────────────────────────────────────────── */
function initRegisterPage() {
  buildDenominationOptions();
  buildCountryOptions();

  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = translations[currentLang].register;
    const btn = form.querySelector('[type="submit"]');
    const msgEl = document.getElementById('formMessage');

    clearMessage(msgEl);

    const data = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      email: form.email.value.trim(),
      address: form.address.value.trim(),
      country: form.country.value,
      state: form.state.value.trim(),
      denomination: form.denomination.value,
      about_yourself: form.about_yourself.value.trim(),
    };

    if (!data.first_name || !data.last_name || !data.email) {
      showMessage(msgEl, t.err_required, 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      showMessage(msgEl, t.err_email, 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = t.submitting;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (json.success) {
        form.style.display = 'none';
        const successEl = document.getElementById('registerSuccess');
        if (successEl) {
          successEl.style.display = 'block';
          successEl.querySelector('.success-title').textContent = t.success_title;
          successEl.querySelector('.success-body').textContent = t.success_body;
        }
      } else {
        const msg = res.status === 409 ? t.err_duplicate : t.err_generic;
        showMessage(msgEl, msg, 'error');
        btn.disabled = false;
        btn.textContent = t.submit;
      }
    } catch {
      showMessage(msgEl, t.err_generic, 'error');
      btn.disabled = false;
      btn.textContent = t.submit;
    }
  });
}

function buildDenominationOptions() {
  const sel = document.getElementById('denomination');
  if (!sel) return;
  const t = translations[currentLang];
  sel.innerHTML = `<option value="">${t.register.select_denomination}</option>` +
    t.denominations.map(d => `<option value="${d}">${d}</option>`).join('');
}

function buildCountryOptions() {
  const sel = document.getElementById('country');
  if (!sel) return;
  const t = translations[currentLang];
  sel.innerHTML = `<option value="">${t.register.select_country}</option>` +
    COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

/* ── Contact page ─────────────────────────────────────────────────────────── */
function initContactPage() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = translations[currentLang].contact;
    const btn = form.querySelector('[type="submit"]');
    const msgEl = document.getElementById('contactMessage');

    clearMessage(msgEl);

    const data = {
      name: form.contact_name.value.trim(),
      email: form.contact_email.value.trim(),
      subject: form.contact_subject.value.trim(),
      message: form.contact_message.value.trim(),
    };

    if (!data.name || !data.email || !data.message) {
      showMessage(msgEl, t.err_required, 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = t.submitting;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (json.success) {
        form.style.display = 'none';
        const successEl = document.getElementById('contactSuccess');
        if (successEl) {
          successEl.style.display = 'block';
          successEl.querySelector('.success-title').textContent = t.success_title;
          successEl.querySelector('.success-body').textContent = t.success_body;
        }
      } else {
        showMessage(msgEl, t.err_generic, 'error');
        btn.disabled = false;
        btn.textContent = t.submit;
      }
    } catch {
      showMessage(msgEl, t.err_generic, 'error');
      btn.disabled = false;
      btn.textContent = t.submit;
    }
  });
}

/* ── Communities page ────────────────────────────────────────────────────── */
function initCommunitiesPage() {
  // Scroll-spy for sticky tradition nav
  const sections = document.querySelectorAll('.tradition-section[id]');
  const tradLinks = document.querySelectorAll('.trad-link');
  if (!sections.length || !tradLinks.length) return;

  const spy = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tradLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.trad-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -60% 0px' });

  sections.forEach(s => spy.observe(s));
}

/* ── Utilities ────────────────────────────────────────────────────────────── */
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const locale = currentLang === 'ar' ? 'ar-SA' : 'en-US';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n).trimEnd() + '…' : str;
}

function showLoader(el) {
  if (el) el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
}

function showMessage(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `form-message ${type}`;
  el.style.display = 'block';
}

function clearMessage(el) {
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

/* ── Dynamic social links from settings ──────────────────────────────────── */
(async () => {
  try {
    const res = await fetch('/api/settings').then(r => r.json());
    if (!res.success) return;
    if (res.facebook_url) {
      document.querySelectorAll('a.social-link-fb, a.footer-social-btn.fb, #footerFb').forEach(a => {
        a.href = res.facebook_url;
      });
    }
    if (res.x_url) {
      document.querySelectorAll('a.social-link-x, a.footer-social-btn.x, #footerX').forEach(a => {
        a.href = res.x_url;
      });
    }
  } catch { /* ignore — falls back to hardcoded defaults */ }
})();

/* ── Intersection Observer (fade-in animations) ───────────────────────────── */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

/* ── Newsletter ────────────────────────────────────────────────────────────── */
document.querySelectorAll('.newsletter-form').forEach(form => {
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const input = this.querySelector('input[type="email"]');
    const btn = this.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.textContent = 'Subscribed!';
    btn.disabled = true;
    input.value = '';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 3000);
  });
});
