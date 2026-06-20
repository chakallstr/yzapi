/* YapayZekaLab — Turkish strings (SOURCE OF TRUTH for the key set).
 *
 * Convention: keys are `surface.camelCaseName` (e.g. nav.home, login.googleCta,
 * packages.buyWithBalance, common.cancel). Every key here MUST also exist in en.js.
 * Use {var} placeholders for interpolation: t('notif.minutesAgo', { n: 5 }).
 * Do NOT put provider codenames / upstream URLs here (scan:public + noleak contracts).
 */
export const tr = {
  // — common —
  'common.cancel': 'İptal',
  'common.save': 'Kaydet',
  'common.close': 'Kapat',
  'common.loading': 'Yükleniyor…',
  'common.error': 'Bir hata oluştu.',
  'common.retry': 'Tekrar dene',
  'common.send': 'Gönder',
  'common.sending': 'Gönderiliyor…',
  'common.copy': 'Kopyala',
  'common.copied': 'Kopyalandı',
  'common.back': 'Geri',
  'common.all': 'Tümü',

  // — nav (TopBar tab labels) —
  'nav.home': 'Ana Sayfa',
  'nav.models': 'Modeller',
  'nav.packages': 'Paketler',
  'nav.mypackages': 'Paketlerim',
  'nav.aiChat': 'AI Chat',
  'nav.studio': 'Studio',
  'nav.documents': 'Documents',
  'nav.status': 'Durum',
  'nav.support': 'Destek',
  'nav.activity': 'Aktivite',
  'nav.account': 'Hesap',
  'nav.admin': 'Admin',
};
