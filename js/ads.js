/* ====== PropellerAds Integration ======
   سجل في https://propellerads.com وخذ أكواد الزونز الخاصة بك
   ثم استبدل القيم تحت
========================================= */
const ADS_CONFIG = {
  // استبدل الرابط برابط الزون بتاعك من PropellerAds
  popunderUrl: '//pl12345678.highcpmgate.com/xxxx/xxxx/xxxx.js',
  nativeUrl:   '//pl12345678.highcpmgate.com/xxxx/xxxx/xxxx.js',
  bannerUrl:   '//pl12345678.highcpmgate.com/xxxx/xxxx/xxxx.js',
  enabled: true,
};

/* ====== POPUNDER ====== */
function loadPopunder() {
  if (!ADS_CONFIG.enabled || !ADS_CONFIG.popunderUrl) return;
  const s = document.createElement('script');
  s.setAttribute('data-cfasync', 'false');
  s.src = ADS_CONFIG.popunderUrl;
  s.async = true;
  document.body.appendChild(s);
}

/* ====== NATIVE ADS (في التغذية) ====== */
function loadNativeAds() {
  if (!ADS_CONFIG.enabled || !ADS_CONFIG.nativeUrl) return;
  const s = document.createElement('script');
  s.setAttribute('data-cfasync', 'false');
  s.src = ADS_CONFIG.nativeUrl;
  s.async = true;
  document.body.appendChild(s);
}

/* ====== BANNER ADS ====== */
function loadBanner() {
  if (!ADS_CONFIG.enabled || !ADS_CONFIG.bannerUrl) return;
  const container = document.getElementById('ad-banner');
  if (!container) return;
  const s = document.createElement('script');
  s.setAttribute('data-cfasync', 'false');
  s.src = ADS_CONFIG.bannerUrl;
  s.async = true;
  container.appendChild(s);
}

/* ====== تشغيل كل الإعلانات ====== */
function initAds() {
  if (!ADS_CONFIG.enabled) return;
  loadPopunder();
  loadNativeAds();
  loadBanner();
}

// تشغيل تلقائي بعد تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAds);
} else {
  initAds();
}