/* ====== Firebase Config ====== */
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

let _firestore = null;
let _useFirestore = false;

function initFirebase() {
  try {
    if (firebaseConfig.apiKey !== "REPLACE_ME" && typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      _firestore = firebase.firestore();
      _useFirestore = true;
      console.log('Firebase Firestore connected');
    } else {
      console.warn('Firebase not configured, using IndexedDB only');
    }
  } catch (e) {
    console.warn('Firebase init failed, using IndexedDB only:', e);
  }
}

initFirebase();

/* ====== IndexedDB (offline fallback) ====== */
const DB_NAME = 'boroozDB';
const DB_VERSION = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('users')) {
        const s = db.createObjectStore('users', { keyPath: 'id' });
        s.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains('services')) {
        const s = db.createObjectStore('services', { keyPath: 'id' });
        s.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('contacts')) {
        const s = db.createObjectStore('contacts', { keyPath: 'id' });
        s.createIndex('service_id', 'service_id', { unique: true });
      }
      if (!db.objectStoreNames.contains('featured_circles')) {
        const s = db.createObjectStore('featured_circles', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('circle_prices')) {
        db.createObjectStore('circle_prices', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('reports')) {
        const s = db.createObjectStore('reports', { keyPath: 'id' });
        s.createIndex('service_id', 'service_id', { unique: false });
        s.createIndex('reporter_id', 'reporter_id', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const t = db.transaction(storeName, mode);
    return { tx: t, store: t.objectStore(storeName) };
  });
}

const localDB = {
  getAll(storeName) {
    return tx(storeName).then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
    );
  },
  get(storeName, id) {
    return tx(storeName).then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      })
    );
  },
  add(storeName, data) {
    return tx(storeName, 'readwrite').then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.add(data);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
    );
  },
  put(storeName, data) {
    return tx(storeName, 'readwrite').then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.put(data);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
    );
  },
  delete(storeName, id) {
    return tx(storeName, 'readwrite').then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })
    );
  },
  getByIndex(storeName, indexName, value) {
    return openDB().then(db => {
      const t = db.transaction(storeName, 'readonly');
      const index = t.objectStore(storeName).index(indexName);
      return new Promise((resolve, reject) => {
        const r = index.getAll(value);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    });
  },
  clear(storeName) {
    return tx(storeName, 'readwrite').then(({ store }) =>
      new Promise((resolve, reject) => {
        const r = store.clear();
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })
    );
  }
};

/* ====== Unified DB (Firestore + IndexedDB fallback) ====== */
const db = {
  async getAll(storeName) {
    if (_useFirestore) {
      try {
        const snap = await _firestore.collection(storeName).get();
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        // Cache locally
        for (const item of results) {
          await localDB.put(storeName, item).catch(() => {});
        }
        return results;
      } catch (e) {
        console.warn(`Firestore getAll(${storeName}) failed, using local:`, e);
        return localDB.getAll(storeName);
      }
    }
    return localDB.getAll(storeName);
  },

  async get(storeName, id) {
    if (_useFirestore) {
      try {
        const doc = await _firestore.collection(storeName).doc(String(id)).get();
        if (doc.exists) {
          const data = { id: doc.id, ...doc.data() };
          await localDB.put(storeName, data).catch(() => {});
          return data;
        }
        return null;
      } catch (e) {
        console.warn(`Firestore get(${storeName}) failed, using local:`, e);
        return localDB.get(storeName, id);
      }
    }
    return localDB.get(storeName, id);
  },

  async add(storeName, data) {
    const id = data.id ? String(data.id) : undefined;
    if (_useFirestore) {
      try {
        const docRef = id
          ? _firestore.collection(storeName).doc(id)
          : _firestore.collection(storeName).doc();
        await docRef.set(data);
        const savedData = { id: docRef.id, ...data };
        await localDB.put(storeName, savedData).catch(() => {});
        return docRef.id;
      } catch (e) {
        console.warn(`Firestore add(${storeName}) failed, using local:`, e);
        return localDB.add(storeName, data);
      }
    }
    return localDB.add(storeName, data);
  },

  async put(storeName, data) {
    const id = data.id ? String(data.id) : undefined;
    if (_useFirestore) {
      try {
        const docRef = id
          ? _firestore.collection(storeName).doc(id)
          : _firestore.collection(storeName).doc();
        await docRef.set(data, { merge: true });
        const savedData = { id: docRef.id, ...data };
        await localDB.put(storeName, savedData).catch(() => {});
        return docRef.id;
      } catch (e) {
        console.warn(`Firestore put(${storeName}) failed, using local:`, e);
        return localDB.put(storeName, data);
      }
    }
    return localDB.put(storeName, data);
  },

  async delete(storeName, id) {
    if (_useFirestore) {
      try {
        await _firestore.collection(storeName).doc(String(id)).delete();
        await localDB.delete(storeName, id).catch(() => {});
        return;
      } catch (e) {
        console.warn(`Firestore delete(${storeName}) failed, using local:`, e);
        return localDB.delete(storeName, id);
      }
    }
    return localDB.delete(storeName, id);
  },

  async getByIndex(storeName, indexName, value) {
    if (_useFirestore) {
      try {
        const snap = await _firestore.collection(storeName).where(indexName, '==', value).get();
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return results;
      } catch (e) {
        console.warn(`Firestore getByIndex(${storeName}) failed, using local:`, e);
        return localDB.getByIndex(storeName, indexName, value);
      }
    }
    return localDB.getByIndex(storeName, indexName, value);
  },

  async clear(storeName) {
    if (_useFirestore) {
      try {
        const snap = await _firestore.collection(storeName).get();
        const batch = _firestore.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await localDB.clear(storeName).catch(() => {});
        return;
      } catch (e) {
        console.warn(`Firestore clear(${storeName}) failed, using local:`, e);
        return localDB.clear(storeName);
      }
    }
    return localDB.clear(storeName);
  }
};

/* ====== MIGRATION from localStorage ====== */
async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('borooz_data');
    if (!raw) return false;
    const data = JSON.parse(raw);
    let migrated = false;

    if (data.users && data.users.length > 0) {
      const existing = await db.getAll('users');
      if (existing.length === 0) {
        for (const u of data.users) {
          await db.add('users', {
            id: u.id,
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            password: u.password || '',
            role: data.adminId === u.id ? 'admin' : 'user',
            whatsapp: u.whatsapp || '',
            telegram: u.telegram || '',
            blocked: u.blocked || false,
            created_at: u.createdAt || Date.now()
          });
        }
        migrated = true;
      }
    }

    if (data.posts && data.posts.length > 0) {
      const existing = await db.getAll('services');
      if (existing.length === 0) {
        for (const p of data.posts) {
          await db.add('services', {
            id: p.id,
            user_id: p.userId || '',
            title: p.title || '',
            description: p.desc || '',
            price: p.price || 0,
            negotiable: p.negotiable || false,
            images: JSON.stringify(p.images || []),
            image: p.image || '',
            category: p.category || '',
            currency: p.currency || 'EGP',
            mediation: p.mediation || false,
            approved: p.approved,
            views_count: p.views || 0,
            created_at: p.createdAt || Date.now(),
            whatsapp: p.whatsapp || '',
            telegram: p.telegram || '',
            phone: p.phone || '',
            email: p.email || ''
          });
          if (p.contact) {
            await db.add('contacts', {
              id: 'c_' + p.id,
              service_id: p.id,
              whatsapp: p.contact.whatsapp || '',
              telegram: p.contact.telegram || '',
              phone: p.contact.phone || '',
              email: p.contact.email || ''
            });
          }
        }
        migrated = true;
      }
    }

    if (data.circles && data.circles.length > 0) {
      const existing = await db.getAll('featured_circles');
      if (existing.length === 0) {
        for (const c of data.circles) {
          const status = c.booked
            ? (c.bookedUntil && c.bookedUntil < Date.now() ? 'expired' : 'active')
            : 'available';
          await db.add('featured_circles', {
            id: c.id,
            advertiser_name: c.bookedBy || '',
            advertiser_logo: c.adImage || '',
            start_date: c.bookedAt || null,
            end_date: c.bookedUntil || null,
            duration_type: c.durationType || '',
            status: status
          });
        }
        if (data.circles.length > 0) {
          await db.put('circle_prices', {
            id: 1,
            daily_price: data.circles[0].prices?.day || 50,
            weekly_price: data.circles[0].prices?.week || 200,
            monthly_price: data.circles[0].prices?.month || 500
          });
        }
        migrated = true;
      }
    }

    if (data.settings) {
      await db.put('circle_prices', {
        id: 1,
        ...data.settings.circlePrices || {},
        site_settings: data.settings
      });
      migrated = true;
    }

    if (migrated) {
      localStorage.removeItem('borooz_data');
      console.log('Data migrated from localStorage');
    }
    return migrated;
  } catch (e) {
    console.warn('Migration error:', e);
    return false;
  }
}

/* ====== MIGRATION from IndexedDB to Firestore ====== */
async function migrateLocalToFirestore() {
  if (!_useFirestore) return;
  try {
    const users = await localDB.getAll('users');
    for (const u of users) {
      await db.put('users', u);
    }
    const services = await localDB.getAll('services');
    for (const s of services) {
      await db.put('services', s);
    }
    const contacts = await localDB.getAll('contacts');
    for (const c of contacts) {
      await db.put('contacts', c);
    }
    const circles = await localDB.getAll('featured_circles');
    for (const c of circles) {
      await db.put('featured_circles', c);
    }
    const prices = await localDB.get('circle_prices', 1);
    if (prices) {
      await db.put('circle_prices', prices);
    }
    const reports = await localDB.getAll('reports');
    for (const r of reports) {
      await db.put('reports', r);
    }
    console.log('Local data migrated to Firestore');
  } catch (e) {
    console.warn('Local to Firestore migration error:', e);
  }
}

/* ====== LOAD all data into app state ====== */
async function loadAllData() {
  const users = await db.getAll('users');
  const services = await db.getAll('services');
  const contacts = await db.getAll('contacts');
  const circles = await db.getAll('featured_circles');
  const pricesRecord = await db.get('circle_prices', 1);
  const reports = await db.getAll('reports');

  const posts = services.map(s => {
    const c = contacts.find(ct => ct.service_id === s.id);
    let images = [];
    try { images = JSON.parse(s.images || '[]'); } catch(e) { images = s.image ? [s.image] : []; }
    return {
      id: s.id,
      userId: s.user_id,
      title: s.title,
      desc: s.description,
      price: s.price,
      negotiable: s.negotiable,
      images,
      category: s.category || '',
      currency: s.currency || 'EGP',
      mediation: s.mediation || false,
      approved: s.approved,
      whatsapp: s.whatsapp || (c ? c.whatsapp : '') || '',
      telegram: s.telegram || (c ? c.telegram : '') || '',
      phone: s.phone || (c ? c.phone : '') || '',
      email: s.email || (c ? c.email : '') || '',
      views: s.views_count || 0,
      createdAt: s.created_at,
      contact: c ? { whatsapp: c.whatsapp, telegram: c.telegram, phone: c.phone, email: c.email } : null
    };
  });

  const defaultPrices = { day: 50, week: 200, month: 500 };
  const prices = pricesRecord
    ? { day: pricesRecord.daily_price || 50, week: pricesRecord.weekly_price || 200, month: pricesRecord.monthly_price || 500 }
    : defaultPrices;

  const circlesWithPrices = circles.length > 0
    ? circles.map(c => ({
        id: c.id,
        prices: { ...prices },
        booked: c.status === 'active',
        bookedBy: c.advertiser_name || null,
        bookedAt: c.start_date || null,
        bookedUntil: c.end_date || null,
        adImage: c.advertiser_logo || null,
        durationType: c.duration_type || null,
        contactLink: c.contactLink || null
      }))
    : null;

  return {
    users,
    posts,
    circles: circlesWithPrices,
    reports,
    prices,
    settings: pricesRecord?.site_settings || null
  };
}

/* ====== SAVE helpers used by app.js ====== */
async function saveUser(user) {
  const record = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    password: user.password,
    role: user.role || 'user',
    whatsapp: user.whatsapp || '',
    telegram: user.telegram || '',
    blocked: user.blocked || false,
    verified: user.verified || false,
    merchant: user.merchant || false,
    created_at: user.createdAt || user.created_at || Date.now()
  };
  await db.put('users', record);
}

async function saveService(post) {
  const record = {
    id: post.id,
    user_id: post.userId,
    title: post.title,
    description: post.desc || '',
    price: post.price || 0,
    negotiable: post.negotiable || false,
    images: JSON.stringify(post.images || []),
    image: post.image || '',
    category: post.category || '',
    currency: post.currency || 'EGP',
    mediation: post.mediation || false,
    approved: post.approved,
    views_count: post.views || 0,
    created_at: post.createdAt || Date.now(),
    whatsapp: post.whatsapp || '',
    telegram: post.telegram || '',
    phone: post.phone || '',
    email: post.email || ''
  };
  await db.put('services', record);
  if (post.contact) {
    await db.put('contacts', {
      id: 'c_' + post.id,
      service_id: post.id,
      whatsapp: post.contact.whatsapp || '',
      telegram: post.contact.telegram || '',
      phone: post.contact.phone || '',
      email: post.contact.email || ''
    });
  }
}

async function deleteServiceRecord(postId) {
  await db.delete('services', postId);
  await db.delete('contacts', 'c_' + postId);
}

async function saveCircles(circles) {
  for (const c of circles) {
    const status = c.booked
      ? (c.bookedUntil && c.bookedUntil < Date.now() ? 'expired' : 'active')
      : 'available';
    await db.put('featured_circles', {
      id: c.id,
      advertiser_name: c.bookedBy || '',
      advertiser_logo: c.adImage || null,
      start_date: c.bookedAt || null,
      end_date: c.bookedUntil || null,
      duration_type: c.durationType || '',
      status: status,
      contactLink: c.contactLink || null
    });
  }
  if (circles.length > 0 && circles[0].prices) {
    const existing = await db.get('circle_prices', 1);
    await db.put('circle_prices', {
      id: 1,
      daily_price: circles[0].prices.day || 50,
      weekly_price: circles[0].prices.week || 200,
      monthly_price: circles[0].prices.month || 500,
      site_settings: existing?.site_settings || null
    });
  }
}

async function saveSettingsToDB(settings) {
  const existing = await db.get('circle_prices', 1);
  await db.put('circle_prices', {
    id: 1,
    daily_price: existing?.daily_price || 50,
    weekly_price: existing?.weekly_price || 200,
    monthly_price: existing?.monthly_price || 500,
    site_settings: settings
  });
}

async function saveReport(report) {
  await db.add('reports', report);
}

async function saveSession(user) {
}
