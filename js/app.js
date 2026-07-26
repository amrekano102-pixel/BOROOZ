/* ====== STATE ====== */
const state = {
  currentUser: null,
  currentPage: 'feed',
  currentPostId: null,
  editPostId: null,
  nextId: 1,
  uploadedImages: [],
  editingImages: [],
  circles: null,
  bookingCircleId: null,
  adminId: null,
  settings: null,
};

const DEFAULT_CIRCLE_PRICES = { day: 50, week: 200, month: 500 };

/* ====== STORAGE ====== */
async function loadData() {
  try {
    await openDB();
    await migrateFromLocalStorage();
    const all = await loadAllData();
    window._users = all.users || [];
    window._posts = all.posts || [];
    state.circles = all.circles;
    state.settings = all.settings;
    state.reports = all.reports || [];
    // Find admin
    const adminUser = all.users.find(u => u.role === 'admin');
    if (adminUser) state.adminId = adminUser.id;
    // Restore session
    try {
      const session = JSON.parse(sessionStorage.getItem('borooz_session'));
      if (session) {
        const user = all.users.find(u => u.id === session.id);
        if (user) state.currentUser = user;
      }
    } catch (e) { /* ignore */ }
  } catch (e) {
    console.warn('DB load failed, trying localStorage fallback:', e);
    try {
      const raw = localStorage.getItem('borooz_data');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.users) window._users = data.users;
      if (data.posts) window._posts = data.posts;
      if (data.nextId) state.nextId = data.nextId;
      if (data.session) state.currentUser = data.session;
      if (data.circles) state.circles = data.circles;
      if (data.adminId) state.adminId = data.adminId;
      if (data.settings) state.settings = data.settings;
    } catch (e2) { /* ignore */ }
  }
}

async function saveData() {
  try {
    // Save users
    if (window._users) {
      for (const u of window._users) await saveUser(u);
    }
    // Save posts + contacts
    if (window._posts) {
      for (const p of window._posts) await saveService(p);
    }
    // Save circles
    if (state.circles) await saveCircles(state.circles);
    // Save settings
    if (state.settings) await saveSettingsToDB(state.settings);
    // Save session separately (not in localStorage)
    if (state.currentUser) {
      sessionStorage.setItem('borooz_session', JSON.stringify({ id: state.currentUser.id }));
    } else {
      sessionStorage.removeItem('borooz_session');
    }
  } catch (e) {
    console.warn('DB save failed, fallback to localStorage:', e);
    localStorage.setItem('borooz_data', JSON.stringify({
      users: window._users || [],
      posts: window._posts || [],
      nextId: state.nextId,
      session: state.currentUser,
      circles: state.circles,
      adminId: state.adminId,
      settings: state.settings,
    }));
  }
}

/* ====== HELPERS ====== */
function uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function generateUserId(email) {
  if (email === ADMIN_EMAIL) return 1;
  const users = getUsers();
  const maxId = users.reduce((max, u) => {
    const num = parseInt(u.id);
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  return maxId < 1000000 ? 1000000 : maxId + 1;
}

function getUsers() {
  if (!window._users) window._users = [];
  return window._users;
}

function getPosts() {
  if (!window._posts) window._posts = [];
  return window._posts;
}

function getUserById(id) {
  return getUsers().find(u => u.id === id) || null;
}

function getPostById(id) {
  return getPosts().find(p => p.id === id) || null;
}

function getInitials(name) {
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
}

function sanitizeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getCurrencySymbol(code) {
  const symbols = { SAR: 'ر.س', EGP: 'ج.م', SYP: 'ل.س', USD: '$' };
  return symbols[code] || 'ج.م';
}
function getVerifiedBadge(user) {
  if (!user || !user.verified) return '';
  const svgCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  let html = `<span class="verified-badge" title="حساب موثق">${svgCheck}</span>`;
  if (user.merchant) html = `<span class="merchant-label">تاجر</span>` + html;
  return html;
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 7) return `منذ ${days} يوم`;
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ====== TOAST ====== */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ====== NAVIGATION ====== */
function showPage(pageId, data) {
  document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');
  state.currentPage = pageId;

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageId === 'feed') { renderCircles(); renderFeed(); }
  if (pageId === 'admin') { renderAdmin(); }
  if (pageId === 'explore') renderExplore();
  if (pageId === 'my-posts') renderMyPosts();
  if (pageId === 'profile') renderProfile();
  if (pageId === 'support') renderSupport();
  if (pageId === 'scammers') renderScammers();
  if (pageId === 'about') renderAbout();
  if (pageId === 'detail' && data) loadPostDetail(data);
  if (pageId === 'edit' && data) loadEditForm(data);
}

function navigate(page, data) {
  if (page === 'admin') {
    history.replaceState(null, '', '#admin');
  } else {
    history.replaceState(null, '', window.location.pathname);
  }
  showPage(page, data);
}

/* ====== AUTH ====== */
function renderAuth() {
  document.getElementById('page-auth').classList.add('active');
  document.getElementById('app').classList.add('hidden');
  showToast('الرجاء تسجيل الدخول للمتابعة', 'info');
}

function renderApp() {
  document.getElementById('page-auth').classList.remove('active');
  document.getElementById('app').classList.remove('hidden');
  const user = state.currentUser;
  document.getElementById('header-auth-buttons').classList.toggle('hidden', !!user);
  document.querySelector('.profile-dropdown').classList.toggle('hidden', !user);
  document.getElementById('btn-create-post').classList.toggle('hidden', !user);
  // Show admin link only for admin email
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) {
    adminLink.style.display = (user && user.email === ADMIN_EMAIL) ? '' : 'none';
  }
  if (user) {
    document.getElementById('header-name').textContent = user.name;
    document.getElementById('header-avatar').textContent = getInitials(user.name);
    applySettings();
    if (isAdmin()) updateAdminBadge();
  }
  showPage('feed');
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const users = getUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    showToast('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
    return;
  }
  if (user.blocked) {
    showToast('تم حظر حسابك. يرجى التواصل مع الإدارة', 'error');
    return;
  }
  state.currentUser = user;
  saveData();
  renderApp();
  if (state._pendingAdminRedirect) {
    state._pendingAdminRedirect = false;
    navigate('admin');
  }
  showToast(`مرحباً بعودتك، ${user.name}!`, 'success');
}

function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const confirm = document.getElementById('reg-confirm').value.trim();

  if (password !== confirm) {
    showToast('كلمة المرور غير متطابقة', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
    return;
  }
  const users = getUsers();
  if (users.find(u => u.email === email)) {
    showToast('البريد الإلكتروني مستخدم بالفعل', 'error');
    return;
  }

  const newUser = {
    id: String(generateUserId(email)),
    name,
    email,
    phone,
    password,
    role: 'user',
    whatsapp: '',
    telegram: '',
    blocked: false,
    verified: false,
    merchant: false,
    createdAt: Date.now(),
  };
  users.push(newUser);
  window._users = users;
  state.currentUser = newUser;
  saveData();
  addNotification('user', `مستخدم جديد: ${name} (${email}) - ID: ${newUser.id}`);
  renderApp();
  if (state._pendingAdminRedirect) {
    state._pendingAdminRedirect = false;
    navigate('admin');
  }
  showToast(`مرحباً ${name}! تم إنشاء الحساب بنجاح`, 'success');
}

function handleLogout() {
  state.currentUser = null;
  state.adminId = null;
  adminUnlocked = false;
  saveData();
  document.getElementById('header-auth-buttons').classList.remove('hidden');
  document.querySelector('.profile-dropdown').classList.add('hidden');
  document.getElementById('btn-create-post').classList.add('hidden');
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = 'none';
  renderAuth();
  showToast('تم تسجيل الخروج بنجاح', 'info');
}

/* ====== POSTS ====== */

// Generate a placeholder image based on title
function generatePlaceholder(title, index = 0) {
  const colors = [
    ['#0a0800', '#1a1500', '#FFD700'],
    ['#0a0800', '#141000', '#FFF1A8'],
    ['#0d0a00', '#1a1500', '#FFD700'],
    ['#0a0800', '#121000', '#FFF1A8'],
    ['#0d0a00', '#141000', '#FFD700'],
  ];
  const c = colors[index % colors.length];
  const safeTitle = title.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c[0]}"/>
      <stop offset="100%" style="stop-color:${c[1]}"/>
    </linearGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <text x="400" y="280" font-family="Arial" font-size="32" fill="${c[2]}" text-anchor="middle" font-weight="bold">${safeTitle}</text>
    <text x="400" y="330" font-family="Arial" font-size="16" fill="${c[2]}" opacity="0.6" text-anchor="middle">borooz</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function createPost(data) {
  const posts = getPosts();
  const images = state.uploadedImages.length > 0
    ? state.uploadedImages.map((f, i) => f.data || generatePlaceholder(data.title, i))
    : [generatePlaceholder(data.title, 0)];
  const post = {
    id: uuid(),
    ...data,
    images,
    userId: state.currentUser.id,
    createdAt: Date.now(),
  };
  posts.unshift(post);
  window._posts = posts;
  state.uploadedImages = [];
  saveData();
  return post;
}

function updatePost(id, data) {
  const posts = getPosts();
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const images = state.editingImages.length > 0
    ? state.editingImages
    : posts[idx].images;
  posts[idx] = { ...posts[idx], ...data, images };
  window._posts = posts;
  state.editingImages = [];
  saveData();
  return posts[idx];
}

function deletePost(id) {
  let posts = getPosts();
  posts = posts.filter(p => p.id !== id);
  window._posts = posts;
  deleteServiceRecord(id);
  saveData();
}

/* ====== RENDER FEED ====== */
function renderFeed(container) {
  if (!container) container = document.getElementById('feed-container');
  if (!container) return;
  const posts = getPosts();
  const filter = document.querySelector('.filter-btn.active');
  const filterVal = filter ? filter.dataset.filter : 'all';

  // Only show approved posts in feed
  let filtered = [...posts].filter(p => p.approved !== false);
  if (filterVal === 'negotiable') filtered = filtered.filter(p => p.negotiable);
  if (filterVal === 'fixed') filtered = filtered.filter(p => !p.negotiable);

  // Category filter (shared with explore)
  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => (p.category || 'حسابات') === activeCategory);
  }

  const searchInput = document.getElementById('search-input');
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(searchQuery) ||
      p.desc.toLowerCase().includes(searchQuery) ||
      (p.category || '').includes(searchQuery)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <h3>لا توجد خدمات حالياً</h3>
        <p>${searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'كن أول من يضيف خدمة!'}</p>
      </div>`;
    return;
  }

  let adCounter = 0;
  container.innerHTML = filtered.map((post, idx) => {
    adCounter++;
    let adHtml = '';
    if (adCounter % 5 === 0) {
      adHtml = `<div class="ad-infeed" data-ad="native"></div>`;
    }
    const user = getUserById(post.userId);
    const userName = user ? user.name : 'مستخدم';
    const initial = getInitials(userName);
    const verifiedBadge = getVerifiedBadge(user);
    const imgSrc = post.images && post.images[0] ? post.images[0] : generatePlaceholder(post.title, 0);
    const hasContact = post.whatsapp || post.telegram || post.phone;
    const contactId = `contact-${post.id}`;
    return `
    <div class="post-card" data-id="${post.id}">
      <div class="post-card-image" onclick="event.stopPropagation();navigate('detail','${post.id}')">
        <img src="${imgSrc}" alt="${post.title}" loading="lazy" onerror="this.style.display='none'">
        ${post.category ? `<span class="post-card-category">${post.category}</span>` : ''}
      </div>
      <div class="post-card-body">
        <h3 class="post-card-title">${post.title}</h3>
        <p class="post-card-desc">${post.desc}</p>
      </div>
      <div class="post-card-meta">
        <div class="post-card-provider">
          <div class="avatar">${initial}</div>
          <span class="provider-name">${userName}${verifiedBadge}</span>
          ${post.mediation ? '<span class="mediation-badge-sm">وساطة</span>' : ''}
        </div>
        <div class="post-card-price">
          <span class="price-value">${post.price}</span>
          <span style="color:var(--gold);font-size:13px;font-weight:700">${getCurrencySymbol(post.currency || 'EGP')}</span>
          <span class="${post.negotiable ? 'price-negotiable' : 'price-fixed'}">
            ${post.negotiable ? 'قابل للتفاوض' : 'سعر ثابت'}
          </span>
        </div>
      </div>
      <div class="post-card-actions">
        <button class="btn btn-gold card-btn-detail" onclick="event.stopPropagation();navigate('detail','${post.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          عرض التفاصيل
        </button>
        ${hasContact ? `
        <button class="btn btn-outline-gold card-btn-contact" onclick="event.stopPropagation();toggleContact('${contactId}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          تواصل الآن
        </button>
        <div class="card-contact-expand" id="${contactId}">
          ${post.whatsapp ? `<a href="https://wa.me/${post.whatsapp.replace(/[^0-9]/g,'')}" target="_blank" class="btn btn-whatsapp btn-sm" onclick="event.stopPropagation()">واتساب</a>` : ''}
          ${post.telegram ? `<a href="https://t.me/${post.telegram.replace(/^@/,'')}" target="_blank" class="btn btn-telegram btn-sm" onclick="event.stopPropagation()">تيليجرام</a>` : ''}
          ${post.phone ? `<a href="tel:${post.phone}" class="btn btn-phone btn-sm" onclick="event.stopPropagation()">اتصال</a>` : ''}
        </div>` : `
        <button class="btn btn-outline-gold card-btn-contact disabled" disabled>تواصل الآن</button>`}
      </div>
    </div>${adHtml}`;
  }).join('');

  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.post-card-actions, .post-card-image a, .post-card-image img')) return;
      navigate('detail', this.dataset.id);
    });
  });
}

/* ====== EXPLORE ====== */
let activeCategory = 'all';
function renderExplore() {
  const container = document.getElementById('explore-container');
  if (!container) return;
  const posts = getPosts();
  const searchInputExplore = document.getElementById('search-input');
  const searchQuery = searchInputExplore ? searchInputExplore.value.trim().toLowerCase() : '';
  let filtered = [...posts].filter(p => p.approved !== false);
  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => (p.category || 'حسابات') === activeCategory);
  }
  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(searchQuery) ||
      p.desc.toLowerCase().includes(searchQuery) ||
      (p.category || '').includes(searchQuery)
    );
  }
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <h3>لا توجد خدمات</h3>
        <p>${searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد خدمات متاحة'}</p>
      </div>`;
    return;
  }
  container.innerHTML = filtered.map(post => {
    const user = getUserById(post.userId);
    const userName = user ? user.name : 'مستخدم';
    const initial = getInitials(userName);
    const verifiedBadge = getVerifiedBadge(user);
    const imgSrc = post.images && post.images[0] ? post.images[0] : generatePlaceholder(post.title, 0);
    const hasContact = post.whatsapp || post.telegram || post.phone;
    const contactId = `contact-${post.id}`;
    return `
    <div class="post-card" data-id="${post.id}">
      <div class="post-card-image" onclick="event.stopPropagation();navigate('detail','${post.id}')">
        <img src="${imgSrc}" alt="${post.title}" loading="lazy" onerror="this.style.display='none'">
        ${post.category ? `<span class="post-card-category">${post.category}</span>` : ''}
      </div>
      <div class="post-card-body">
        <h3 class="post-card-title">${post.title}</h3>
        <p class="post-card-desc">${post.desc}</p>
      </div>
      <div class="post-card-meta">
        <div class="post-card-provider">
          <div class="avatar">${initial}</div>
          <span class="provider-name">${userName}${verifiedBadge}</span>
          ${post.mediation ? '<span class="mediation-badge-sm">وساطة</span>' : ''}
        </div>
        <div class="post-card-price">
          <span class="price-value">${post.price}</span>
          <span style="color:var(--gold);font-size:13px;font-weight:700">${getCurrencySymbol(post.currency || 'EGP')}</span>
          <span class="${post.negotiable ? 'price-negotiable' : 'price-fixed'}">
            ${post.negotiable ? 'قابل للتفاوض' : 'سعر ثابت'}
          </span>
        </div>
      </div>
      <div class="post-card-actions">
        <button class="btn btn-gold card-btn-detail" onclick="event.stopPropagation();navigate('detail','${post.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          عرض التفاصيل
        </button>
        ${hasContact ? `
        <button class="btn btn-outline-gold card-btn-contact" onclick="event.stopPropagation();toggleContact('${contactId}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          تواصل الآن
        </button>
        <div class="card-contact-expand" id="${contactId}">
          ${post.whatsapp ? `<a href="https://wa.me/${post.whatsapp.replace(/[^0-9]/g,'')}" target="_blank" class="btn btn-whatsapp btn-sm" onclick="event.stopPropagation()">واتساب</a>` : ''}
          ${post.telegram ? `<a href="https://t.me/${post.telegram.replace(/^@/,'')}" target="_blank" class="btn btn-telegram btn-sm" onclick="event.stopPropagation()">تيليجرام</a>` : ''}
          ${post.phone ? `<a href="tel:${post.phone}" class="btn btn-phone btn-sm" onclick="event.stopPropagation()">اتصال</a>` : ''}
        </div>` : `
        <button class="btn btn-outline-gold card-btn-contact disabled" disabled>تواصل الآن</button>`}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.post-card-actions, .post-card-image a, .post-card-image img')) return;
      navigate('detail', this.dataset.id);
    });
  });
}

/* ====== CARD CONTACT TOGGLE ====== */
function toggleContact(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.card-contact-expand.open').forEach(e => e.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}

/* ====== POST DETAIL ====== */
function loadPostDetail(postId) {
  const container = document.getElementById('detail-container');
  const post = getPostById(postId);
  if (!post) {
    container.innerHTML = '<div class="empty-state"><h3>الخدمة غير موجودة</h3></div>';
    return;
  }
    const user = getUserById(post.userId);
    const userName = user ? user.name : 'مستخدم';
    const initial = getInitials(userName);
    const verifiedBadge = getVerifiedBadge(user);

  let galleryHtml = '';
  if (post.images && post.images.length > 0) {
    galleryHtml = `<div class="detail-gallery">${post.images.map((img, i) =>
      `<img src="${img}" alt="${post.title} - ${i+1}" loading="lazy" onerror="this.style.display='none'">`
    ).join('')}</div>`;
  }

  container.innerHTML = `
    <div class="detail-container-inner">
      <a href="#" class="detail-back" onclick="showPage('feed'); return false;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        العودة إلى الرئيسية
      </a>
      <div class="detail-card">
        ${galleryHtml}
        <div class="detail-body">
          <div class="detail-header">
            <div>
              <h1 class="detail-title">${post.title}</h1>
              ${post.category ? `<span class="detail-category">${post.category}</span>` : ''}
            </div>
            <div class="detail-price-box">
              <div class="detail-price">${post.price} <small>${getCurrencySymbol(post.currency || 'EGP')}</small></div>
              <span class="detail-negotiable ${post.negotiable ? 'yes' : 'no'}">
                ${post.negotiable ? 'قابل للتفاوض' : 'سعر ثابت'}
              </span>
            </div>
          </div>

          <div class="detail-desc">${post.desc}</div>

          <div class="detail-provider">
            <div class="avatar" style="width:48px;height:48px;font-size:18px">${initial}</div>
            <div class="detail-provider-info">
              <h4>${userName}${verifiedBadge}</h4>
              <p>${user ? (user.phone || '') : ''}</p>
            </div>
          </div>

          <h3 class="detail-contact-title">وسائل التواصل</h3>
          <div class="detail-contact-grid">
            ${post.whatsapp ? `
              <a href="https://wa.me/${post.whatsapp.replace(/[^0-9]/g,'')}" target="_blank" class="contact-btn whatsapp">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                واتساب: ${post.whatsapp}
              </a>` : ''}
            ${post.telegram ? `
              <a href="https://t.me/${post.telegram.replace(/^@/,'')}" target="_blank" class="contact-btn telegram">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                تيليجرام: ${post.telegram}
              </a>` : ''}
            ${post.phone ? `
              <a href="tel:${post.phone}" class="contact-btn phone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                هاتف: ${post.phone}
              </a>` : ''}
            ${post.email ? `
              <a href="mailto:${post.email}" class="contact-btn email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                بريد: ${post.email}
              </a>` : ''}
          </div>

          ${state.currentUser && state.currentUser.id === post.userId ? `
            <div style="display:flex;gap:10px;margin-top:24px;padding-top:20px;border-top:1px solid var(--border-color)">
              <button class="btn btn-gold" onclick="navigate('edit','${post.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                تعديل
              </button>
              <button class="btn btn-danger" onclick="handleDeletePost('${post.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                حذف
              </button>
            </div>` : ''}
        </div>
      </div>
    </div>`;
}

/* ====== SUPPORT ====== */
function renderSupport() {
  const container = document.getElementById('support-container');
  if (!container) return;
  const s = getSettings();
  const adUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // replaceable
  container.innerHTML = `
    <div class="support-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="support-card">
        <div class="support-card-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <h3>محافظ إلكترونية</h3>
        <p>ادعم الموقع عبر التحويل لأي محفظة إلكترونية</p>
        <div class="support-phone-box">
          ${s.supportPhone ? `<span dir="ltr">${s.supportPhone}</span>` : '<span style="color:var(--text-muted)">لم يتم تحديد رقم المحفظة بعد</span>'}
        </div>
      </div>
      <div class="support-card">
        <div class="support-card-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <h3>باينانس (Binance)</h3>
        <p>ادعم الموقع عبر USDT (باينانس) إلى المعرف التالي</p>
        <div class="support-phone-box" style="font-size:13px">
          ${s.supportBinance ? `<span dir="ltr">${s.supportBinance}</span>` : '<span style="color:var(--text-muted)">لم يتم تحديد معرف بايننس بعد</span>'}
        </div>
      </div>
      <div class="support-card">
        <div class="support-card-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </div>
        <h3>مشاهدة إعلان</h3>
        <p>ادعم الموقع بمشاهدة إعلان قصير — لا تكلفك شيئاً</p>
        <a href="${adUrl}" target="_blank" class="btn btn-gold">مشاهدة الإعلان</a>
      </div>
    </div>`;
}

/* ====== SCAMMERS ====== */
function renderScammers() {
  const container = document.getElementById('scammers-container');
  if (!container) return;
  const s = getSettings();
  const scammers = s.scammers || [];
  if (scammers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <h3>لا يوجد نصابين</h3>
        <p>لم يتم الإبلاغ عن أي رقم حتى الآن</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="scammers-list">
      ${scammers.map((item, i) => `
        <div class="scammer-card">
          <div class="scammer-num">${i + 1}</div>
          <div class="scammer-info">
            <div class="scammer-phone" dir="ltr">${item.phone}</div>
            ${item.reason ? `<div class="scammer-reason">${item.reason}</div>` : ''}
          </div>
          <div class="scammer-date">${item.addedAt ? new Date(item.addedAt).toLocaleDateString('ar-SA') : ''}</div>
        </div>
      `).join('')}
    </div>`;
}

/* ====== ABOUT ====== */
function renderAbout() {
  const container = document.getElementById('about-container');
  if (!container) return;
  const s = getSettings();
  const aboutContent = s.aboutPage || '<p>منصة borooz هي منصة رائدة تهدف إلى ربط مقدمي الخدمات بالعملاء بأسلوب احترافي وموثوق.</p>';
  container.innerHTML = `
      <div style="max-width:700px;margin:0 auto">
        <div style="text-align:center;margin-bottom:30px">
          <div style="font-size:32px;font-weight:900;color:var(--gold);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px"><span class="borooz-glow">BOROOZ</span></div>
          <p style="color:var(--text-secondary);font-size:14px">منصة خدمات موثوقة</p>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:16px;padding:24px;line-height:1.9;color:var(--text-secondary);font-size:15px">
          ${aboutContent}
        </div>
        <div style="margin-top:30px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center">
          ${s.whatsapp ? `<a href="https://wa.me/${s.whatsapp}" target="_blank" class="btn btn-gold" style="display:inline-flex;gap:8px;align-items:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.522 5.857L.057 23.476l5.8-1.85A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.97 0-3.81-.528-5.39-1.447l-.384-.228-3.97 1.263 1.27-3.87-.25-.396A9.788 9.788 0 0 1 2.18 12c0-5.418 4.402-9.82 9.82-9.82S21.82 6.582 21.82 12s-4.402 9.82-9.82 9.82z"/></svg>
            واتساب
          </a>` : ''}
          ${s.telegram ? `<a href="https://t.me/${s.telegram.replace('@','')}" target="_blank" class="btn btn-gold" style="display:inline-flex;gap:8px;align-items:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            تيليجرام
          </a>` : ''}
        </div>
      </div>`;
}

/* ====== MY POSTS ====== */
function renderMyPosts() {
  const container = document.getElementById('my-posts-container');
  if (!container) return;
  const posts = getPosts().filter(p => p.userId === state.currentUser.id);
  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <h3>لم تنشر أي خدمة بعد</h3>
        <p>ابدأ بنشر أول خدمة لك الآن!</p>
      </div>`;
    return;
  }
  container.innerHTML = posts.map(post => {
    const imgSrc = post.images && post.images[0] ? post.images[0] : generatePlaceholder(post.title, 0);
    const statusLabel = post.approved === false
      ? '<span class="badge warn" style="font-size:11px">بانتظار المراجعة</span>'
      : '<span class="badge success" style="font-size:11px">منشور</span>';
    return `
    <div class="post-card" data-id="${post.id}">
      <div class="post-card-image">
        <img src="${imgSrc}" alt="${post.title}" loading="lazy" onerror="this.style.display='none'">
        ${post.category ? `<span class="post-card-category">${post.category}</span>` : ''}
      </div>
      <div class="post-card-body">
        <h3 class="post-card-title">${post.title}</h3>
        <div style="margin-bottom:8px">${statusLabel}</div>
        <p class="post-card-desc">${post.desc}</p>
      </div>
      <div class="post-card-meta">
        <div class="post-card-price">
          <span class="price-value">${post.price}</span>
          <span style="color:var(--gold);font-size:13px;font-weight:700">${getCurrencySymbol(post.currency || 'EGP')}</span>
          <span class="${post.negotiable ? 'price-negotiable' : 'price-fixed'}">
            ${post.negotiable ? 'قابل للتفاوض' : 'سعر ثابت'}
          </span>
        </div>
        <span style="font-size:12px;color:var(--text-muted)">${formatDate(post.createdAt)}</span>
      </div>
      <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border-color)">
        <button class="btn btn-gold btn-sm" style="flex:1" onclick="navigate('edit','${post.id}')">تعديل</button>
        <button class="btn btn-danger btn-sm" style="flex:1" onclick="handleDeletePost('${post.id}')">حذف</button>
      </div>
    </div>`;
  }).join('');
}

/* ====== PROFILE ====== */
function renderProfile() {
  const user = state.currentUser;
  if (!user) return;
  document.getElementById('profile-avatar').textContent = getInitials(user.name);
  document.getElementById('profile-name').innerHTML = user.name + getVerifiedBadge(user);
  document.getElementById('profile-email').textContent = user.email;
  document.getElementById('profile-phone').textContent = user.phone || '';
  document.getElementById('profile-post-count').textContent = getPosts().filter(p => p.userId === user.id).length;
  document.getElementById('profile-whatsapp').value = user.whatsapp || '';
  document.getElementById('profile-telegram').value = user.telegram || '';
  document.getElementById('profile-phone-input').value = user.phone || '';
  document.getElementById('profile-email-input').value = user.email || '';
  const verifiedEl = document.getElementById('profile-verified-badge');
  if (verifiedEl) {
    if (user.verified) {
      verifiedEl.innerHTML = `<span class="badge gold" style="margin-top:8px;display:inline-flex;align-items:center;gap:4px">${user.merchant ? '🏷️ تاجر موثق' : '✅ حساب موثق'}</span>`;
    } else {
      verifiedEl.innerHTML = '';
    }
  }
  const requestEl = document.getElementById('profile-verify-request');
  if (requestEl) {
    if (user.verified) {
      requestEl.innerHTML = '';
    } else {
      requestEl.innerHTML = `<button class="btn btn-gold" id="btn-request-verify" style="width:100%;font-size:13px">📩 طلب توثيق الحساب</button>`;
      document.getElementById('btn-request-verify').addEventListener('click', function() {
        addNotification('verify_request', `طلب توثيق حساب: ${user.name} (${user.email}) - ID: ${user.id}`);
        showToast('تم إرسال طلب التوثيق — سيتم مراجعته من الإدارة', 'success');
        this.disabled = true;
        this.textContent = '✅ تم الإرسال';
      });
    }
  }
}

/* ====== CREATE POST FORM ====== */
function resetCreateForm() {
  document.getElementById('create-post-form').reset();
  state.uploadedImages = [];
  document.getElementById('image-preview').innerHTML = '';
  const cur = getSettings().defaultCurrency || 'EGP';
  document.getElementById('post-currency').value = cur;
  document.getElementById('post-currency-label').textContent = getCurrencySymbol(cur);
}

function handleImageUpload(input, previewId, store) {
  const files = input.files;
  if (!files.length) return;
  const preview = document.getElementById(previewId);
  Array.from(files).forEach((file, idx) => {
    if (store.length >= 5) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      store.push({ file, data: e.target.result });
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `<img src="${e.target.result}" alt="صورة ${store.length}"><button type="button" class="remove-img" data-idx="${store.length - 1}">×</button>`;
      item.querySelector('.remove-img').addEventListener('click', function() {
        const i = parseInt(this.dataset.idx);
        store.splice(i, 1);
        renderImagePreviews(previewId, store);
      });
      preview.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderImagePreviews(previewId, store) {
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';
  store.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `<img src="${img.data}" alt="صورة ${idx+1}"><button type="button" class="remove-img" data-idx="${idx}">×</button>`;
    item.querySelector('.remove-img').addEventListener('click', function() {
      store.splice(parseInt(this.dataset.idx), 1);
      renderImagePreviews(previewId, store);
    });
    preview.appendChild(item);
  });
}

function handleCreatePost(e) {
  e.preventDefault();
  const title = document.getElementById('post-title').value.trim();
  const desc = document.getElementById('post-desc').value.trim();
  const price = document.getElementById('post-price').value.trim();
  const negotiable = document.getElementById('post-negotiable').checked;
  const category = document.getElementById('post-category').value;
  const currency = document.getElementById('post-currency').value;
  const mediation = document.getElementById('post-mediation').checked;
  const whatsapp = document.getElementById('post-whatsapp').value.trim();
  const telegram = document.getElementById('post-telegram').value.trim();
  const phone = document.getElementById('post-phone').value.trim();
  const email = document.getElementById('post-email').value.trim();

  if (!title || !desc || !price || !category) {
    showToast('يرجى ملء جميع الحقول المطلوبة (بما في ذلك التصنيف)', 'error');
    return;
  }

  const postData = { title, desc, price: Number(price), negotiable, category, currency, mediation, approved: false, whatsapp, telegram, phone, email };
  createPost(postData);
  addNotification('post', `طلب نشر خدمة جديد: "${title}" - السعر: ${price} ${getCurrencySymbol(currency)} - من: ${state.currentUser.name} (ID: ${state.currentUser.id})`);
  resetCreateForm();
  showPage('feed');
  showToast('تم نشر الخدمة! سيتم مراجعتها من قبل الإدارة', 'success');
}

/* ====== EDIT POST ====== */
function loadEditForm(postId) {
  const post = getPostById(postId);
  if (!post || (post.userId !== state.currentUser.id && !isAdmin())) {
    showToast('لا يمكنك تعديل هذه الخدمة', 'error');
    showPage('feed');
    return;
  }
  state.editPostId = postId;
  state.editingImages = [...(post.images || [])];
  document.getElementById('edit-title').value = post.title;
  document.getElementById('edit-desc').value = post.desc;
  document.getElementById('edit-price').value = post.price;
  document.getElementById('edit-negotiable').checked = post.negotiable;
  document.getElementById('edit-negotiable-label').textContent = post.negotiable ? 'قابل للتفاوض' : 'سعر ثابت';
  document.getElementById('edit-currency').value = post.currency || 'EGP';
  document.getElementById('edit-currency-label').textContent = getCurrencySymbol(post.currency || 'EGP');
  document.getElementById('edit-mediation').checked = post.mediation || false;
  document.getElementById('edit-mediation-warning').style.display = post.mediation ? 'none' : 'block';

  const catSelect = document.getElementById('edit-category');
  catSelect.innerHTML = '';
  ['حسابات','شحن العاب','شحن باقات','تصميم','برمجة'].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === post.category) opt.selected = true;
    catSelect.appendChild(opt);
  });
}

function handleEditPost(e) {
  e.preventDefault();
  const id = state.editPostId;
  if (!id) return;
  const title = document.getElementById('edit-title').value.trim();
  const desc = document.getElementById('edit-desc').value.trim();
  const price = document.getElementById('edit-price').value.trim();
  const negotiable = document.getElementById('edit-negotiable').checked;
  const category = document.getElementById('edit-category').value;
  const currency = document.getElementById('edit-currency').value;
  const mediation = document.getElementById('edit-mediation').checked;

  if (!title || !desc || !price) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
    return;
  }
  const result = updatePost(id, { title, desc, price: Number(price), negotiable, category, currency, mediation });
  if (result) {
    showToast('تم تحديث الخدمة بنجاح', 'success');
    navigate('detail', id);
  }
}

function handleDeletePost(postId) {
  if (!confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return;
  const post = getPostById(postId);
  if (!post || (post.userId !== state.currentUser.id && !isAdmin())) {
    showToast('لا يمكنك حذف هذه الخدمة', 'error');
    return;
  }
  deletePost(postId);
  showToast('تم حذف الخدمة', 'info');
  if (state.currentPage === 'detail') showPage('feed');
  else { renderMyPosts(); renderFeed(); }
}

/* ====== CIRCLES ====== */
function getCircles() {
  if (state.circles) return state.circles;
  state.circles = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1,
    prices: { ...DEFAULT_CIRCLE_PRICES },
    booked: false,
    bookedBy: null,
    bookedAt: null,
    bookedUntil: null,
    adImage: null,
    contactLink: '',
  }));
  return state.circles;
}

function renderCircles() {
  const grid = document.getElementById('circles-grid');
  if (!grid) return;
  const circles = getCircles();
  grid.innerHTML = circles.map(c => {
    if (c.booked && c.adImage) {
      return `<div class="circle-item booked" data-id="${c.id}" title="دائرة ${c.id} - محجوزة">
        <img src="${c.adImage}" alt="إعلان" class="circle-ad-image">
      </div>`;
    }
    return `<div class="circle-item" data-id="${c.id}" title="دائرة ${c.id} - متاحة">
      <div class="circle-available-badge">متاحة</div>
      <div class="circle-empty-state">
        <span class="circle-number">${c.id}</span>
        <span class="circle-label">دائرة</span>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.circle-item').forEach(el => {
    el.addEventListener('click', function() {
      const id = parseInt(this.dataset.id);
      const circles = getCircles();
      const c = circles.find(x => x.id === id);
      if (c && c.booked) {
        openCircleDetail(c);
        return;
      }
      openBookingModal(id);
    });
  });
}

/* ====== BOOKING MODAL ====== */
function openBookingModal(circleId) {
  if (!state.currentUser) {
    showToast('الرجاء تسجيل الدخول أولاً', 'error');
    return;
  }
  const circles = getCircles();
  const c = circles.find(x => x.id === circleId);
  if (!c) return;
  state.bookingCircleId = circleId;
  document.getElementById('modal-title').textContent = `حجز الدائرة رقم ${circleId}`;
  document.getElementById('modal-desc').textContent = 'اختر مدة الحجز وسعر الدائرة الإعلانية';
  document.getElementById('modal-preview').innerHTML = '';
  document.getElementById('modal-contact').value = '';

  const pricingHtml = Object.entries(c.prices).map(([duration, price]) => {
    const labels = { day: 'يوم', week: 'أسبوع', month: 'شهر' };
    return `<div class="pricing-option" data-duration="${duration}" data-price="${price}">
      <span class="duration">${labels[duration]}</span>
      <span class="price">${price} <small>${getCurrencySymbol(getSettings().defaultCurrency || 'EGP')}</small></span>
    </div>`;
  }).join('');
  document.getElementById('modal-pricing').innerHTML = pricingHtml;

  document.querySelectorAll('.pricing-option').forEach(el => {
    el.addEventListener('click', function() {
      document.querySelectorAll('.pricing-option').forEach(o => o.classList.remove('selected'));
      this.classList.add('selected');
    });
  });
  // Select first option
  const first = document.querySelector('.pricing-option');
  if (first) first.classList.add('selected');

  document.getElementById('booking-modal').classList.add('active');
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('active');
  document.getElementById('modal-contact').value = '';
  document.getElementById('modal-image').value = '';
  document.getElementById('modal-preview').innerHTML = '';
  state.bookingCircleId = null;
}

/* ====== CIRCLE DETAIL ====== */
function openCircleDetail(circle) {
  document.getElementById('circle-detail-title').textContent = `الدائرة الإعلانية رقم ${circle.id}`;
  const imgDiv = document.getElementById('circle-detail-image');
  imgDiv.innerHTML = circle.adImage
    ? `<img src="${circle.adImage}" alt="شعار" style="width:100%;max-height:200px;object-fit:contain;border-radius:12px;background:var(--bg-surface)">`
    : '<div style="padding:40px;color:var(--text-muted)">لا توجد صورة</div>';
  const daysMap = { day: 'يوم', week: 'أسبوع', month: 'شهر' };
  document.getElementById('circle-detail-info').innerHTML = `
    <div style="margin-bottom:6px"><strong>المدة:</strong> ${daysMap[circle.durationType] || 'غير محدد'}</div>
    <div><strong>تاريخ الحجز:</strong> ${new Date(circle.bookedAt).toLocaleDateString('ar-SA')}</div>
    <div><strong>تاريخ الانتهاء:</strong> ${new Date(circle.bookedUntil).toLocaleDateString('ar-SA')}</div>
  `;
  const contactDiv = document.getElementById('circle-detail-contact');
  if (isAdmin()) {
    if (circle.contactLink) {
      contactDiv.innerHTML = `
        <div style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:12px;padding:16px">
          <p style="color:var(--gold);font-size:13px;font-weight:700;margin-bottom:8px">📞 رقم التواصل (للإدارة فقط)</p>
          <a href="${circle.contactLink}" target="_blank" class="btn btn-gold" style="display:inline-flex;gap:8px;align-items:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            التواصل مع الحاجز
          </a>
        </div>`;
    } else {
      contactDiv.innerHTML = '<span style="color:var(--text-muted);font-size:13px">لا يوجد رابط تواصل</span>';
    }
  } else {
    contactDiv.innerHTML = '<span style="color:var(--text-muted);font-size:13px">الرقم مخفي — للتواصل مع صاحب الدائرة يرجى التواصل مع الإدارة</span>';
  }
  document.getElementById('circle-detail-modal').classList.add('active');
}
function closeCircleDetail() {
  document.getElementById('circle-detail-modal').classList.remove('active');
}

function confirmBooking() {
  if (!state.currentUser) {
    showToast('الرجاء تسجيل الدخول أولاً', 'error');
    return;
  }
  const circleId = state.bookingCircleId;
  if (!circleId) return;
  const selected = document.querySelector('.pricing-option.selected');
  if (!selected) {
    showToast('الرجاء اختيار مدة الحجز', 'error');
    return;
  }
  const duration = selected.dataset.duration;
  const price = parseInt(selected.dataset.price);
  const contactLink = document.getElementById('modal-contact').value.trim();
  if (!contactLink) {
    showToast('الرجاء إدخال رقم التواصل', 'error');
    return;
  }
  const fileInput = document.getElementById('modal-image');
  let adImage = null;
  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      adImage = e.target.result;
      finalizeBooking(circleId, duration, price, adImage, contactLink);
    };
    reader.onerror = function() {
      showToast('حدث خطأ أثناء قراءة الصورة', 'error');
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    finalizeBooking(circleId, duration, price, adImage, contactLink);
  }
}

function finalizeBooking(circleId, duration, price, adImage, contactLink) {
  const circles = getCircles();
  const c = circles.find(x => x.id === circleId);
  if (!c) return;
  const daysMap = { day: 1, week: 7, month: 30 };
  c.booked = true;
  c.bookedBy = state.currentUser.id;
  c.bookedAt = Date.now();
  c.bookedUntil = Date.now() + daysMap[duration] * 86400000;
  c.adImage = adImage;
  c.contactLink = contactLink || '';
  c.durationType = duration;
  state.circles = circles;
  saveData();
  closeBookingModal();
  renderCircles();
  if (state.currentPage === 'admin') renderAdminCirclesPanel();
  showToast(`تم حجز الدائرة ${circleId} بنجاح لمدة ${duration === 'day' ? 'يوم' : duration === 'week' ? 'أسبوع' : 'شهر'}`, 'success');
}

/* ====== PUBLIC BROWSING ====== */
const ADMIN_EMAIL = 'amrekano102@gmail.com';

function isAdmin() {
  return state.currentUser && state.currentUser.email === ADMIN_EMAIL;
}

function ensureAdmin() {
  state.adminId = null;
}

/* ====== SETTINGS ====== */
function getSettings() {
  if (!state.settings) {
    state.settings = {
      siteName: 'borooz',
      logo: null,
      primaryColor: '#FFD700',
      secondaryColor: '#FFF1A8',
      bgColor: '#0A0A0A',
      whatsapp: '',
      telegram: '',
      email: 'info@borooz.com',
      aboutPage: '<p>منصة borooz هي منصة رائدة تهدف إلى ربط مقدمي الخدمات بالعملاء بأسلوب احترافي وموثوق.</p>',
      termsPage: '<p>باستخدامك للمنصة، فإنك توافق على الشروط والأحكام التالية...</p>',
      privacyPage: '<p>نحن نهتم بخصوصيتك ونعمل على حماية بياناتك الشخصية...</p>',
      scammers: [],
      mediationEnabled: false,
      mediationAdminName: 'إدارة الموقع',
      defaultCurrency: 'EGP',
      supportPhone: '',
      supportBinance: '',
      currencyName: { SAR: 'ر.س', EGP: 'ج.م', SYP: 'ل.س', USD: '$' },
    };
  }
  return state.settings;
}

function saveSettings() {
  state.settings = getSettings();
  saveData();
}

/* ====== FULL ADMIN RENDER ====== */
const ADMIN_PASSWORD = '1992007';
let adminUnlocked = false;

function getNotifications() {
  if (!state.notifications) state.notifications = [];
  return state.notifications;
}
function addNotification(type, message) {
  const n = getNotifications();
  n.unshift({ id: Date.now(), type, message, read: false, createdAt: Date.now() });
  if (n.length > 100) n.length = 100;
  saveData();
  updateAdminBadge();
}
function markNotificationsRead() {
  getNotifications().forEach(n => n.read = true);
  saveData();
  updateAdminBadge();
}
function updateAdminBadge() {
  const unread = getNotifications().filter(n => !n.read).length;
  const badge = document.getElementById('admin-badge');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? '' : 'none';
  }
  const navBadge = document.getElementById('admin-nav-badge');
  if (navBadge) {
    navBadge.textContent = unread;
    navBadge.style.display = unread > 0 ? '' : 'none';
  }
}

function renderAdmin() {
  const lockEl = document.getElementById('admin-lock');
  const wrapperEl = document.getElementById('admin-wrapper');
  const errorEl = document.getElementById('admin-lock-error');
  if (!lockEl || !wrapperEl) return;

  if (!state.currentUser || !isAdmin()) {
    lockEl.style.display = '';
    wrapperEl.style.display = 'none';
    if (errorEl) errorEl.textContent = '❌ هذا الحساب غير مخول للدخول إلى لوحة الإدارة';
    return;
  }

  // Admin is logged in — open panel directly
  adminUnlocked = true;
  lockEl.style.display = 'none';
  wrapperEl.style.display = '';
  renderAdminStats();
  updateAdminBadge();
  renderAdminUsers();
  renderAdminServices();
  renderAdminCirclesPanel();
  renderAdminScammers();
  renderAdminSettings();
}

/* ====== ADMIN STATS ====== */
function renderAdminStats() {
  const grid = document.getElementById('admin-stats-grid');
  if (!grid) return;
  const users = getUsers();
  const posts = getPosts();
  const circles = getCircles();
  const bookings = circles.filter(c => c.booked).length;
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
      <div class="stat-card-info"><h3>${users.length}</h3><p>إجمالي المستخدمين</p></div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon green"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
      <div class="stat-card-info"><h3>${posts.length}</h3><p>خدمة منشورة</p></div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon blue"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div>
      <div class="stat-card-info"><h3>${bookings}/7</h3><p>دوائر محجوزة</p></div>
    </div>
    <div class="stat-card">
      <div class="stat-card-icon purple"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10M18 20V4M6 20v-6"/></svg></div>
      <div class="stat-card-info"><h3>${posts.reduce((s, p) => s + (p.views || 0), 0)}</h3><p>إجمالي المشاهدات</p></div>
    </div>`;
}

/* ====== ADMIN NOTIFICATIONS ====== */
function renderAdminNotifications() {
  const container = document.getElementById('admin-notifications-container');
  if (!container) return;
  const notifications = getNotifications();
  if (notifications.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <h3>لا توجد إشعارات</h3>
        <p>لم يسجل أي مستخدم جديد أو يطلب نشر خدمة بعد</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <p style="color:var(--text-secondary);font-size:14px">جميع الإشعارات (${notifications.length})</p>
      <button class="btn btn-gold" id="btn-clear-notifications" style="font-size:12px;padding:6px 12px">مسح الكل</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>النوع</th>
          <th>التفاصيل</th>
          <th>الوقت</th>
        </tr></thead>
        <tbody>        ${notifications.map(n => {
          let icon, label, badgeClass;
          if (n.type === 'user') {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>';
            label = 'مستخدم جديد';
            badgeClass = 'green';
          } else if (n.type === 'verify_request') {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
            label = 'طلب توثيق';
            badgeClass = 'gold';
          } else {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3498db" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            label = 'طلب نشر';
            badgeClass = 'blue';
          }
          return `<tr style="${!n.read ? 'background:rgba(255,215,0,0.05)' : ''}">
            <td><span class="badge ${badgeClass}">${icon} ${label}</span></td>
            <td style="font-size:13px;max-width:400px;word-break:break-word">${n.message}</td>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${formatDate(n.createdAt)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-clear-notifications').addEventListener('click', function() {
    state.notifications = [];
    saveData();
    renderAdminNotifications();
    updateAdminBadge();
    showToast('تم مسح جميع الإشعارات', 'success');
  });
}

/* ====== ADMIN USERS ====== */
function renderAdminUsers() {
  const container = document.getElementById('admin-users-container');
  if (!container) return;
  const users = getUsers();
  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>لا يوجد مستخدمين</h3></div>';
    return;
  }
  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>ID</th>
          <th>المستخدم</th>
          <th>البريد</th>
          <th>الهاتف</th>
          <th>التوثيق</th>
          <th>التاريخ</th>
          <th>الحالة</th>
          <th>إجراءات</th>
        </tr></thead>
        <tbody>${users.map(u => {
          const isBlocked = u.blocked;
          const isAdminUser = u.email === ADMIN_EMAIL;
          const isVerified = u.verified;
          const isMerchant = u.merchant;
          return `<tr>
            <td><span style="font-family:monospace;font-weight:700;color:${isAdminUser ? 'var(--gold)' : 'var(--text-secondary)'}">${u.id}</span></td>
            <td><div class="user-badge"><div class="avatar">${getInitials(u.name)}</div> ${u.name} ${getVerifiedBadge(u)} ${isAdminUser ? '<span class="badge gold">مدير</span>' : ''}</div></td>
            <td><span class="user-email">${u.email}</span></td>
            <td>${u.phone || '-'}</td>
            <td style="white-space:nowrap">
              ${!isAdminUser ? `
                <button class="btn-icon ${isVerified ? 'success' : ''}" onclick="adminToggleVerify('${u.id}')" title="${isVerified ? 'إلغاء التوثيق' : 'توثيق الحساب'}">
                  ${isVerified ? '✅ موثق' : '☐ توثيق'}
                </button>
                <button class="btn-icon ${isMerchant ? 'success' : ''}" onclick="adminToggleMerchant('${u.id}')" title="${isMerchant ? 'إلغاء صفة تاجر' : 'جعله تاجر'}" style="margin-top:4px">
                  ${isMerchant ? '🏷️ تاجر' : '☐ تاجر'}
                </button>
              ` : '<span style="color:var(--text-muted);font-size:12px">-</span>'}
            </td>
            <td style="font-size:12px">${formatDate(u.createdAt)}</td>
            <td><span class="badge ${isBlocked ? 'red' : 'green'}">${isBlocked ? 'محظور' : 'نشط'}</span></td>
            <td class="actions-cell">
              ${!isAdminUser ? `
                <button class="btn-icon ${isBlocked ? 'success' : 'danger'}" onclick="adminToggleBlock('${u.id}')">${isBlocked ? 'إلغاء الحظر' : 'حظر'}</button>
                <button class="btn-icon danger" onclick="adminDeleteUser('${u.id}')">حذف</button>` : '<span style="color:var(--text-muted);font-size:12px">-</span>'}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

function adminToggleBlock(userId) {
  if (!isAdmin()) return;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.blocked = !user.blocked;
  window._users = users;
  saveData();
  renderAdminUsers();
  showToast(user.blocked ? `تم حظر ${user.name}` : `تم إلغاء حظر ${user.name}`, 'success');
}
function adminToggleVerify(userId) {
  if (!isAdmin()) return;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.verified = !user.verified;
  if (!user.verified) user.merchant = false;
  window._users = users;
  saveData();
  renderAdminUsers();
  showToast(user.verified ? `تم توثيق حساب ${user.name}` : `تم إلغاء توثيق ${user.name}`, 'success');
}
function adminToggleMerchant(userId) {
  if (!isAdmin()) return;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.merchant = !user.merchant;
  if (user.merchant && !user.verified) user.verified = true;
  window._users = users;
  saveData();
  renderAdminUsers();
  showToast(user.merchant ? `تم جعل ${user.name} تاجر` : `تم إلغاء صفة تاجر لـ ${user.name}`, 'success');
}

function adminDeleteUser(userId) {
  if (!isAdmin()) return;
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ سيتم حذف جميع خدماته أيضاً.')) return;
  let users = getUsers();
  let posts = getPosts();
  const userPosts = posts.filter(p => p.userId === userId);
  users = users.filter(u => u.id !== userId);
  posts = posts.filter(p => p.userId !== userId);
  window._users = users;
  window._posts = posts;
  // Delete from database
  db.delete('users', userId).catch(e => console.warn('DB delete user failed:', e));
  userPosts.forEach(p => deleteServiceRecord(p.id).catch(e => console.warn('DB delete service failed:', e)));
  if (state.currentUser && state.currentUser.id === userId) {
    handleLogout();
    return;
  }
  saveData();
  renderAdminUsers();
  renderAdminStats();
  showToast('تم حذف المستخدم', 'info');
}

/* ====== ADMIN SERVICES ====== */
function renderAdminServices() {
  const container = document.getElementById('admin-services-container');
  if (!container) return;
  const f = adminServicesFilter;
  let posts = getPosts();
  if (f === 'pending') posts = posts.filter(p => p.approved === false);
  if (f === 'approved') posts = posts.filter(p => p.approved !== false);
  if (posts.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>لا توجد خدمات منشورة</h3></div>';
    return;
  }
  container.innerHTML = `
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm ${f === 'all' ? 'btn-gold' : 'btn-outline-gold'}" onclick="adminFilterServices('all')">الكل</button>
      <button class="btn btn-sm ${f === 'pending' ? 'btn-gold' : 'btn-outline-gold'}" onclick="adminFilterServices('pending')">قيد المراجعة</button>
      <button class="btn btn-sm ${f === 'approved' ? 'btn-gold' : 'btn-outline-gold'}" onclick="adminFilterServices('approved')">مقبولة</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>الخدمة</th>
          <th>مقدم الخدمة</th>
          <th>السعر</th>
          <th>الحالة</th>
          <th>تاريخ النشر</th>
          <th>مشاهدات</th>
          <th>إجراءات</th>
        </tr></thead>
        <tbody>${posts.map(p => {
          const user = getUserById(p.userId);
          const statusLabel = p.approved === false ? '<span class="badge warn">قيد المراجعة</span>' : '<span class="badge success">مقبولة</span>';
          return `<tr>
            <td>${p.title.length > 30 ? p.title.slice(0, 30) + '...' : p.title}</td>
            <td>${user ? user.name : 'مستخدم محذوف'}</td>
            <td><span class="badge gold">${p.price} ${getCurrencySymbol(p.currency || 'EGP')}</span></td>
            <td>${statusLabel}</td>
            <td>${formatDate(p.createdAt)}</td>
            <td>${p.views || 0}</td>
            <td class="actions-cell">
              <button class="btn-icon info" onclick="navigate('detail','${p.id}')">عرض</button>
              <button class="btn-icon gold" onclick="adminEditService('${p.id}')">تعديل</button>
              ${p.approved === false ? `<button class="btn-icon success" onclick="adminApprovePost('${p.id}')">قبول</button>` : ''}
              <button class="btn-icon danger" onclick="adminDeleteService('${p.id}')">حذف</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

let adminServicesFilter = 'all';
function adminFilterServices(filter) {
  adminServicesFilter = filter;
  renderAdminServices();
}
function adminApprovePost(postId) {
  if (!isAdmin()) return;
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  post.approved = true;
  window._posts = posts;
  saveData();
  renderAdminServices();
  renderAdminStats();
  showToast('تم قبول الخدمة ونشرها في الموقع', 'success');
}
function adminEditService(postId) {
  const post = getPostById(postId);
  if (!post) return;
  navigate('edit', postId);
}

function adminDeleteService(postId) {
  if (!isAdmin()) return;
  if (!confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return;
  deletePost(postId);
  renderAdminServices();
  renderAdminStats();
  showToast('تم حذف الخدمة', 'info');
}

/* ====== ADMIN CIRCLES PANEL ====== */
function renderAdminCirclesPanel() {
  const container = document.getElementById('admin-circles-container');
  if (!container) return;
  const circles = getCircles();
  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <p style="color:var(--text-secondary);font-size:14px">تحكم في أسعار وحجوزات الدوائر الإعلانية السبع</p>
      <span style="font-size:13px;color:var(--text-muted)">المحجوزة: <strong style="color:var(--gold)">${circles.filter(c => c.booked).length}</strong> / 7</span>
    </div>
    <div class="admin-circles-grid">
      ${circles.map(c => {
        const bookedInfo = c.booked ? `<div class="admin-circle-dates">
          <span>تاريخ الحجز: ${new Date(c.bookedAt || Date.now()).toLocaleDateString('ar-SA')}</span>
          <span>تاريخ الانتهاء: ${new Date(c.bookedUntil).toLocaleDateString('ar-SA')}</span>
          <span>مقدم الخدمة: ${c.bookedBy ? (getUserById(c.bookedBy)?.name || 'غير معروف') : 'غير معروف'}</span>
        </div>` : '';
        const isExpired = c.bookedUntil && Date.now() > c.bookedUntil;
        const statusClass = isExpired ? 'expired' : (c.booked ? 'booked-status' : 'free');
        const statusText = isExpired ? 'منتهية' : (c.booked ? 'محجوزة' : 'متاحة');
        return `<div class="admin-circle-card">
          <div class="admin-circle-num">${c.id}</div>
          <div class="circle-status ${statusClass}">${statusText}</div>
          ${bookedInfo}
          ${isExpired ? `<button class="btn-icon success" onclick="adminReleaseCircle(${c.id})" style="margin-bottom:10px">تحرير الدائرة</button>` : ''}
          ${c.booked && !isExpired ? `<button class="btn-icon danger" onclick="adminReleaseCircle(${c.id})" style="margin-bottom:10px">إنهاء الحجز</button>` : ''}
          <div class="admin-price-inputs">
            <div class="admin-price-row">
              <label>يوم</label>
              <input type="number" class="admin-price-input" data-id="${c.id}" data-duration="day" value="${c.prices.day}" min="1">
              <span>${getCurrencySymbol(getSettings().defaultCurrency || 'EGP')}</span>
            </div>
            <div class="admin-price-row">
              <label>أسبوع</label>
              <input type="number" class="admin-price-input" data-id="${c.id}" data-duration="week" value="${c.prices.week}" min="1">
              <span>${getCurrencySymbol(getSettings().defaultCurrency || 'EGP')}</span>
            </div>
            <div class="admin-price-row">
              <label>شهر</label>
              <input type="number" class="admin-price-input" data-id="${c.id}" data-duration="month" value="${c.prices.month}" min="1">
              <span>${getCurrencySymbol(getSettings().defaultCurrency || 'EGP')}</span>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="admin-save-all">
      <button class="btn btn-gold btn-lg" id="btn-admin-save">حفظ جميع الأسعار</button>
    </div>`;
  document.getElementById('btn-admin-save').addEventListener('click', function() {
    const inputs = document.querySelectorAll('.admin-price-input');
    const circles = getCircles();
    inputs.forEach(inp => {
      const id = parseInt(inp.dataset.id);
      const duration = inp.dataset.duration;
      const val = parseInt(inp.value);
      if (val > 0) {
        const c = circles.find(x => x.id === id);
        if (c) c.prices[duration] = val;
      }
    });
    state.circles = circles;
    saveData();
    renderAdminCirclesPanel();
    renderCircles();
    showToast('تم حفظ الأسعار بنجاح', 'success');
  });
}

function adminReleaseCircle(circleId) {
  if (!isAdmin()) return;
  if (!confirm('هل أنت متأكد من تحرير هذه الدائرة؟')) return;
  const circles = getCircles();
  const c = circles.find(x => x.id === circleId);
  if (!c) return;
  c.booked = false;
  c.bookedBy = null;
  c.bookedUntil = null;
  c.adImage = null;
  c.contactLink = '';
  c.bookedAt = null;
  state.circles = circles;
  saveData();
  renderAdminCirclesPanel();
  renderCircles();
  showToast(`تم تحرير الدائرة ${circleId}`, 'success');
}

/* ====== ADMIN SCAMMERS ====== */
function renderAdminScammers() {
  const container = document.getElementById('admin-scammers-container');
  if (!container) return;
  const s = getSettings();
  const scammers = s.scammers || [];
  container.innerHTML = `
    <div style="margin-bottom:16px">
      <p style="color:var(--text-secondary);font-size:14px">أضف أو احذف أرقام النصابين التي يتم الإبلاغ عنها</p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      <input type="text" id="scammer-phone-input" placeholder="رقم الجوال" dir="ltr" style="flex:2;min-width:180px;padding:12px 16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:#fff;font-size:14px">
      <input type="text" id="scammer-reason-input" placeholder="سبب الإبلاغ (اختياري)" style="flex:3;min-width:200px;padding:12px 16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:#fff;font-size:14px">
      <button class="btn btn-gold" id="btn-add-scammer">إضافة</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>#</th>
          <th>الرقم</th>
          <th>سبب الإبلاغ</th>
          <th>تاريخ الإضافة</th>
          <th>إجراءات</th>
        </tr></thead>
        <tbody>${scammers.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">لا يوجد أرقام</td></tr>' : scammers.map((item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td dir="ltr">${item.phone}</td>
            <td>${item.reason || '-'}</td>
            <td>${item.addedAt ? new Date(item.addedAt).toLocaleDateString('ar-SA') : '-'}</td>
            <td><button class="btn-icon danger" onclick="adminRemoveScammer(${i})">حذف</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-add-scammer').addEventListener('click', function() {
    const phone = document.getElementById('scammer-phone-input').value.trim();
    if (!phone) { showToast('الرجاء إدخال رقم الجوال', 'error'); return; }
    const s2 = getSettings();
    if (!s2.scammers) s2.scammers = [];
    s2.scammers.push({ phone, reason: document.getElementById('scammer-reason-input').value.trim(), addedAt: Date.now() });
    state.settings = s2;
    saveSettings();
    renderAdminScammers();
    document.getElementById('scammer-phone-input').value = '';
    document.getElementById('scammer-reason-input').value = '';
    showToast('تم إضافة الرقم بنجاح', 'success');
  });
}
function adminRemoveScammer(index) {
  if (!isAdmin()) return;
  if (!confirm('هل أنت متأكد من حذف هذا الرقم؟')) return;
  const s = getSettings();
  if (!s.scammers) s.scammers = [];
  s.scammers.splice(index, 1);
  state.settings = s;
  saveSettings();
  renderAdminScammers();
  showToast('تم حذف الرقم', 'success');
}

/* ====== ADMIN SETTINGS ====== */
function renderAdminSettings() {
  const container = document.getElementById('admin-settings-container');
  if (!container) return;
  const s = getSettings();
  container.innerHTML = `
    <div class="admin-settings-form">
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> معلومات الموقع</h3>
        <p>الاسم والشعار الأساسي للموقع</p>
        <div class="form-group">
          <label>اسم الموقع</label>
          <input type="text" id="set-site-name" value="${s.siteName || 'borooz'}">
        </div>
        <div class="form-group">
          <label>رابط الشعار (URL) — اترك فارغاً للشعار الافتراضي</label>
          <input type="text" id="set-logo" value="${s.logo || ''}" placeholder="https://example.com/logo.png">
        </div>
      </div>
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> الألوان</h3>
        <p>قم بتخصيص ألوان المظهر الرئيسية</p>
        <div class="form-group">
          <label>اللون الذهبي الأساسي</label>
          <div class="settings-color-row">
            <input type="color" id="set-primary-color" value="${s.primaryColor || '#FFD700'}">
            <span class="color-label" id="primary-color-label">${s.primaryColor || '#FFD700'}</span>
          </div>
        </div>
        <div class="form-group">
          <label>اللون الذهبي الفاتح</label>
          <div class="settings-color-row">
            <input type="color" id="set-secondary-color" value="${s.secondaryColor || '#FFF1A8'}">
            <span class="color-label" id="secondary-color-label">${s.secondaryColor || '#FFF1A8'}</span>
          </div>
        </div>
        <div class="form-group">
          <label>لون الخلفية</label>
          <div class="settings-color-row">
            <input type="color" id="set-bg-color" value="${s.bgColor || '#0A0A0A'}">
            <span class="color-label" id="bg-color-label">${s.bgColor || '#0A0A0A'}</span>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> وسائل التواصل</h3>
        <p>روابط ووسائل التواصل الخاصة بالموقع</p>
        <div class="form-group">
          <label>رقم واتساب (مع مفتاح الدولة)</label>
          <input type="text" id="set-whatsapp" value="${s.whatsapp || ''}" placeholder="9665XXXXXXXX">
        </div>
        <div class="form-group">
          <label>معرف تيليجرام</label>
          <input type="text" id="set-telegram" value="${s.telegram || ''}" placeholder="@username">
        </div>
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" id="set-email" value="${s.email || ''}" placeholder="info@borooz.com">
        </div>
      </div>
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg> العملة الافتراضية</h3>
        <p>العملة التي تظهر افتراضياً عند إنشاء خدمة جديدة</p>
        <div class="form-group">
          <label>العملة</label>
          <select id="set-default-currency" class="currency-select">
            <option value="EGP" ${s.defaultCurrency === 'EGP' ? 'selected' : ''}>🇪🇬 جنيه مصري</option>
            <option value="SAR" ${s.defaultCurrency === 'SAR' ? 'selected' : ''}>🇸🇦 ريال سعودي</option>
            <option value="SYP" ${s.defaultCurrency === 'SYP' ? 'selected' : ''}>🇸🇾 ليرة سورية</option>
            <option value="USD" ${s.defaultCurrency === 'USD' ? 'selected' : ''}>🇺🇸 دولار أمريكي</option>
          </select>
        </div>
      </div>
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> الوساطة والدعم</h3>
        <p>إعدادات الوساطة بين مقدم الخدمة والعميل، ودعم الموقع</p>
        <div class="form-group">
          <label class="toggle-row">
            <span>تفعيل خيار الوساطة</span>
            <label class="toggle">
              <input type="checkbox" id="set-mediation" ${s.mediationEnabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </label>
        </div>
        <div class="form-group">
          <label>اسم جهة الوساطة (الذي يظهر للمستخدم)</label>
          <input type="text" id="set-mediation-name" value="${s.mediationAdminName || 'إدارة الموقع'}">
        </div>
        <div class="form-group">
          <label>رقم المحفظة الإلكترونية (USDT/تحويل)</label>
          <input type="text" id="set-support-phone" value="${s.supportPhone || ''}" placeholder="رقم المحفظة أو الحساب" dir="ltr">
        </div>
        <div class="form-group">
          <label>معرف باينانس (Binance ID / Pay ID)</label>
          <input type="text" id="set-support-binance" value="${s.supportBinance || ''}" placeholder="معرف بايننس أو الإيميل" dir="ltr">
        </div>
      </div>
      <div class="settings-section">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> الصفحات الثابتة</h3>
        <p>محتوى صفحات الموقع (يدعم HTML)</p>
        <div class="form-group">
          <label>صفحة عن الموقع</label>
          <textarea id="set-about" rows="4">${s.aboutPage || ''}</textarea>
        </div>
        <div class="form-group">
          <label>صفحة الشروط والأحكام</label>
          <textarea id="set-terms" rows="4">${s.termsPage || ''}</textarea>
        </div>
        <div class="form-group">
          <label>صفحة الخصوصية</label>
          <textarea id="set-privacy" rows="4">${s.privacyPage || ''}</textarea>
        </div>
      </div>
      <div style="text-align:center;padding:10px 0 30px">
        <button class="btn btn-gold btn-lg" id="btn-save-settings">حفظ جميع الإعدادات</button>
      </div>
    </div>`;

  // Color picker live preview
  ['primary-color', 'secondary-color', 'bg-color'].forEach(id => {
    const input = document.getElementById(`set-${id}`);
    if (input) {
      input.addEventListener('input', function() {
        const label = document.getElementById(`${id}-label`);
        if (label) label.textContent = this.value;
      });
    }
  });

  document.getElementById('btn-save-settings').addEventListener('click', function() {
    const s = getSettings();
    s.siteName = document.getElementById('set-site-name').value.trim();
    s.logo = document.getElementById('set-logo').value.trim() || null;
    s.primaryColor = document.getElementById('set-primary-color').value;
    s.secondaryColor = document.getElementById('set-secondary-color').value;
    s.bgColor = document.getElementById('set-bg-color').value;
    s.whatsapp = document.getElementById('set-whatsapp').value.trim();
    s.telegram = document.getElementById('set-telegram').value.trim();
    s.email = document.getElementById('set-email').value.trim();
    s.aboutPage = document.getElementById('set-about').value.trim();
    s.termsPage = document.getElementById('set-terms').value.trim();
    s.privacyPage = document.getElementById('set-privacy').value.trim();
    s.mediationEnabled = document.getElementById('set-mediation').checked;
    s.mediationAdminName = document.getElementById('set-mediation-name').value.trim() || 'إدارة الموقع';
    s.supportPhone = document.getElementById('set-support-phone').value.trim();
    s.supportBinance = document.getElementById('set-support-binance').value.trim();
    s.defaultCurrency = document.getElementById('set-default-currency').value;
    state.settings = s;
    saveSettings();
    applySettings();
    showToast('تم حفظ الإعدادات بنجاح', 'success');
  });
}

function applySettings() {
  const s = getSettings();
  if (!s) return;
  const root = document.documentElement;
  const primary = s.primaryColor || '#FFD700';
  const secondary = s.secondaryColor || '#FFF1A8';
  const bg = s.bgColor || '#0A0A0A';
  root.style.setProperty('--gold', primary);
  root.style.setProperty('--gold-light', secondary);
  root.style.setProperty('--bg-primary', bg);
  root.style.setProperty('--gold-dark', adjustColor(primary, -30));
  root.style.setProperty('--gold-gradient', `linear-gradient(135deg, ${primary} 0%, ${secondary} 50%, ${primary} 100%)`);
  root.style.setProperty('--gold-gradient-soft', `linear-gradient(135deg, ${primary}22 0%, ${secondary}14 100%)`);
  root.style.setProperty('--gold-glow', `0 0 30px ${primary}4D`);
}

function adjustColor(hex, amount) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const num = parseInt(hex, 16);
  let r = Math.min(255, Math.max(0, (num >> 16) + amount));
  let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  let b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

/* ====== INIT ====== */
async function init() {
  await loadData();

  // Auth switching
  document.getElementById('show-register').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('auth-login').classList.add('hidden');
    document.getElementById('auth-register').classList.remove('hidden');
  });
  document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('auth-login').classList.remove('hidden');
    document.getElementById('auth-register').classList.add('hidden');
  });

  // Auth forms
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', e => {
    e.preventDefault();
    handleLogout();
  });

  // Public auth buttons
  document.getElementById('btn-header-login').addEventListener('click', () => {
    document.getElementById('page-auth').classList.add('active');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-login').classList.remove('hidden');
    document.getElementById('auth-register').classList.add('hidden');
  });
  document.getElementById('btn-header-register').addEventListener('click', () => {
    document.getElementById('page-auth').classList.add('active');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-login').classList.add('hidden');
    document.getElementById('auth-register').classList.remove('hidden');
  });

  // Sidebar / Header navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.dataset.page;
      if (page === 'create' && !state.currentUser) {
        showToast('الرجاء تسجيل الدخول أولاً', 'error');
        return;
      }
      if (page === 'my-posts' && !state.currentUser) {
        showToast('الرجاء تسجيل الدخول أولاً', 'error');
        return;
      }
      if (page === 'profile' && !state.currentUser) {
        showToast('الرجاء تسجيل الدخول أولاً', 'error');
        return;
      }
      if (page === 'create') resetCreateForm();
      navigate(page);
      closeSidebar();
      closeDropdown();
    });
  });

  // Create post button
  document.getElementById('btn-create-post').addEventListener('click', () => {
    if (!state.currentUser) {
      showToast('الرجاء تسجيل الدخول أولاً', 'error');
      return;
    }
    resetCreateForm();
    navigate('create');
  });

  // Search with debounce
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (state.currentPage === 'feed') renderFeed();
      else if (state.currentPage === 'explore') renderExplore();
    }, 300);
  });

  // Category filter
  document.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      activeCategory = this.dataset.cat;
      if (state.currentPage === 'explore') renderExplore();
      else if (state.currentPage === 'feed') renderFeed();
    });
  });
  // Sync category filter bar active state when switching pages
  function syncCategoryBar() {
    document.querySelectorAll('.cat-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === activeCategory);
    });
  }
  // Override showPage to sync category bar
  const _origShowPage = showPage;
  showPage = function(pageId, data) {
    _origShowPage(pageId, data);
    if (pageId === 'feed' || pageId === 'explore') syncCategoryBar();
  };

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderFeed();
    });
  });

  // Create post form
  document.getElementById('create-post-form').addEventListener('submit', handleCreatePost);

  // File upload
  const fileInput = document.getElementById('post-images');
  const uploadArea = document.getElementById('file-upload-area');
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', function() {
    handleImageUpload(this, 'image-preview', state.uploadedImages);
  });
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.style.borderColor = '#FFD700';
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '';
  });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer.files.length) {
      handleImageUpload({ files: e.dataTransfer.files }, 'image-preview', state.uploadedImages);
    }
  });

  // Negotiable toggle
  document.getElementById('post-negotiable').addEventListener('change', function() {
    document.getElementById('negotiable-label').textContent = this.checked ? 'قابل للتفاوض' : 'سعر ثابت';
  });
  document.getElementById('edit-negotiable').addEventListener('change', function() {
    document.getElementById('edit-negotiable-label').textContent = this.checked ? 'قابل للتفاوض' : 'سعر ثابت';
  });

  // Currency selector label update
  document.getElementById('post-currency').addEventListener('change', function() {
    const symbols = { SAR: 'ر.س', EGP: 'ج.م', SYP: 'ل.س', USD: '$' };
    document.getElementById('post-currency-label').textContent = symbols[this.value] || 'ج.م';
  });
  document.getElementById('edit-currency').addEventListener('change', function() {
    const symbols = { SAR: 'ر.س', EGP: 'ج.م', SYP: 'ل.س', USD: '$' };
    document.getElementById('edit-currency-label').textContent = symbols[this.value] || 'ج.م';
  });

  // Mediation warning toggles
  document.getElementById('post-mediation').addEventListener('change', function() {
    document.getElementById('post-mediation-warning').style.display = this.checked ? 'none' : 'block';
    document.getElementById('post-mediation-hint').style.display = this.checked ? 'block' : 'none';
  });
  document.getElementById('edit-mediation').addEventListener('change', function() {
    document.getElementById('edit-mediation-warning').style.display = this.checked ? 'none' : 'block';
  });

  // Edit form
  document.getElementById('edit-post-form').addEventListener('submit', handleEditPost);
  document.getElementById('edit-cancel').addEventListener('click', () => {
    if (state.editPostId) navigate('detail', state.editPostId);
    else navigate('feed');
  });

  // Profile form
  document.getElementById('profile-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const users = getUsers();
    const user = users.find(u => u.id === state.currentUser.id);
    if (user) {
      user.whatsapp = document.getElementById('profile-whatsapp').value.trim();
      user.telegram = document.getElementById('profile-telegram').value.trim();
      user.phone = document.getElementById('profile-phone-input').value.trim();
      user.email = document.getElementById('profile-email-input').value.trim();
      window._users = users;
      state.currentUser = user;
      saveData();
      renderProfile();
      showToast('تم تحديث البيانات بنجاح', 'success');
    }
  });

  // Profile dropdown
  document.getElementById('profile-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('active');
  });
  document.addEventListener('click', () => closeDropdown());

  // Menu toggle (sidebar)
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
  }

  function closeDropdown() {
    document.getElementById('dropdown-menu')?.classList.remove('active');
  }

  // Admin tab switching
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      const panel = document.querySelector(`.admin-panel[data-panel="${this.dataset.tab}"]`);
      if (panel) panel.classList.add('active');
      if (this.dataset.tab === 'stats') renderAdminStats();
      if (this.dataset.tab === 'notifications') { renderAdminNotifications(); markNotificationsRead(); }
      if (this.dataset.tab === 'users') renderAdminUsers();
      if (this.dataset.tab === 'services') renderAdminServices();
      if (this.dataset.tab === 'circles') renderAdminCirclesPanel();
      if (this.dataset.tab === 'scammers') renderAdminScammers();
      if (this.dataset.tab === 'settings') renderAdminSettings();
    });
  });

  // Modal
  document.getElementById('btn-confirm-booking').addEventListener('click', confirmBooking);
  document.getElementById('btn-cancel-booking').addEventListener('click', closeBookingModal);
  document.getElementById('modal-close').addEventListener('click', closeBookingModal);
  document.getElementById('booking-modal').addEventListener('click', function(e) {
    if (e.target === this) closeBookingModal();
  });

  // Circle detail modal
  document.getElementById('circle-detail-close').addEventListener('click', closeCircleDetail);
  document.getElementById('circle-detail-close-btn').addEventListener('click', closeCircleDetail);
  document.getElementById('circle-detail-modal').addEventListener('click', function(e) {
    if (e.target === this) closeCircleDetail();
  });

  // Modal image upload
  const modalFileInput = document.getElementById('modal-image');
  const modalUploadArea = document.getElementById('modal-upload-area');
  modalUploadArea.addEventListener('click', () => modalFileInput.click());
  modalFileInput.addEventListener('change', function() {
    const preview = document.getElementById('modal-preview');
    preview.innerHTML = '';
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        preview.innerHTML = `<div class="preview-item"><img src="${e.target.result}" alt="شعار"></div>`;
      };
      reader.readAsDataURL(this.files[0]);
    }
  });

  // Close contact toggles on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.card-btn-contact') && !e.target.closest('.card-contact-expand')) {
      document.querySelectorAll('.card-contact-expand.open').forEach(el => el.classList.remove('open'));
    }
  });

  // Apply saved settings if any
  if (state.settings) applySettings();

  // PWA install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('btn-install-app');
    if (btn) btn.classList.remove('hidden');
  });
  document.getElementById('btn-install-app').addEventListener('click', async function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      deferredPrompt = null;
      this.classList.add('hidden');
    }
  });

  // Handle hash-based navigation on initial load
  const hash = location.hash.replace('#', '');
  if (hash === 'admin') {
    if (state.currentUser && state.currentUser.email === ADMIN_EMAIL) {
      renderApp();
      setTimeout(() => navigate('admin'), 100);
    } else if (state.currentUser) {
      renderApp();
      showToast('هذا الحساب غير مخول للدخول إلى لوحة الإدارة', 'error');
    } else {
      // Not logged in — show auth page, after login redirect to admin
      document.getElementById('page-auth').classList.add('active');
      document.getElementById('app').classList.add('hidden');
      state._pendingAdminRedirect = true;
    }
    return;
  }

  // Render initial view - allow public browsing
  if (state.currentUser) {
    renderApp();
  } else {
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('header-auth-buttons').classList.remove('hidden');
    document.querySelector('.profile-dropdown').classList.add('hidden');
    document.getElementById('btn-create-post').classList.add('hidden');
    showPage('feed');
  }
}

// Handle hash changes (e.g., user manually types #admin)
window.addEventListener('hashchange', function() {
  const hash = location.hash.replace('#', '');
  if (hash === 'admin') {
    navigate('admin');
  }
});

document.addEventListener('DOMContentLoaded', init);
