/* App.jsx shell strings (TopBar, LoginScreen, WhatsApp OTP, UserMenu,
 * LogoutConfirm, footer, notifications, public-status modal).
 * Shape: { tr: { 'appShell.key': '…' }, en: { 'appShell.key': '…' } }.
 * Every tr key MUST have an en mirror (parity test enforces this). */
export default {
  tr: {
    // Notifications
    'appShell.notif.title': 'Bildirimler',
    'appShell.notif.activeCount': '{n} aktif',
    'appShell.notif.loading': 'Bildirimler yükleniyor…',
    'appShell.notif.empty': 'Aktif admin duyurusu yok.',
    'appShell.notif.footer': 'Admin duyuruları anlık yayınlanır',
    'appShell.notif.fetchError': 'Bildirimler alınamadı ({status})',
    'appShell.notif.fetchErrorGeneric': 'Bildirimler alınamadı.',
    'appShell.notif.timeNew': 'yeni',
    'appShell.notif.timeJustNow': 'az önce',
    'appShell.notif.timeMinAgo': '{n} dk önce',
    'appShell.notif.timeHourAgo': '{n} sa önce',
    'appShell.notif.timeDayAgo': '{n} gün önce',
    'appShell.notif.subAnnouncement': 'Sistem duyurusu · {tip}',
    'appShell.notif.subAnnouncementUntil': 'Sistem duyurusu · {tip} · {end} kadar',

    // LoginScreen
    'appShell.login.title': 'Google ile devam et',
    'appShell.login.subtitle': 'YapayZekaLab hesabın Google oturumu ile açılır; ayrı şifre tutulmaz.',
    'appShell.login.googleBtn': 'Google ile giriş yap',
    'appShell.login.githubBtn': 'GitHub ile giriş yap',
    'appShell.login.hint': 'Hesap oluşturma ve giriş aynı Google akışıyla tamamlanır.',
    'appShell.login.consent': 'Giriş yaparak KVKK Aydınlatma Metni, Gizlilik Politikası, Kullanıcı Sözleşmesi ve Mesafeli Satış koşullarını kabul etmiş sayılırsınız.',
    'appShell.login.legalPrivacy': 'Gizlilik',
    'appShell.login.legalAgreement': 'Kullanıcı Sözleşmesi',
    'appShell.login.legalDistanceSale': 'Mesafeli Satış',

    // WhatsApp OTP
    'appShell.otp.title': 'WhatsApp doğrulaması',
    'appShell.otp.subtitle': 'Google hesabın doğrulandı. Paneli açmadan önce WhatsApp numaranı tek seferlik kodla doğrula.',
    'appShell.otp.sendError': 'Kod gönderilemedi.',
    'appShell.otp.sent': 'WhatsApp doğrulama kodu gönderildi.',
    'appShell.otp.verifyError': 'Kod doğrulanamadı.',
    'appShell.otp.phonePlaceholder': '05xx xxx xx xx',
    'appShell.otp.marketingConsent': 'Kampanya ve duyuru mesajlarını WhatsApp üzerinden almak istiyorum. Bu izin OTP için zorunlu değildir.',
    'appShell.otp.sendBtn': 'WhatsApp kodu gönder',
    'appShell.otp.sentTo': 'Kod gönderilen numara:',
    'appShell.otp.codePlaceholder': '6 haneli kod',
    'appShell.otp.verifying': 'Doğrulanıyor…',
    'appShell.otp.verifyBtn': 'Kodu doğrula',
    'appShell.otp.resendBtn': 'Kodu tekrar gönder',
    'appShell.otp.backToLogin': 'Girişe geri dön',

    // LogoutConfirm
    'appShell.logout.title': 'Çıkış yapılsın mı?',
    'appShell.logout.body': 'Aktif oturumun sonlandırılacak. Bakiyen ve API anahtarların korunur — tekrar giriş yaptığında her şey aynı kalır.',
    'appShell.logout.confirm': 'Çıkış yap',

    // UserMenu
    'appShell.user.fallbackName': 'Hesabım',
    'appShell.user.fallbackEmail': 'oturum aktif',
    'appShell.user.fallbackPlan': 'hesap',
    'appShell.user.itemAccountBalance': 'Hesabım & bakiye',
    'appShell.user.itemKeys': 'API anahtarları',
    'appShell.user.itemUsage': 'Kullanım geçmişi',
    'appShell.user.itemSettings': 'Hesap ayarları',
    'appShell.user.hintRealList': 'gerçek liste',
    'appShell.user.hintRecent': 'son istekler',
    'appShell.user.hintProfileEmail': 'profil, email',
    'appShell.user.logout': 'Çıkış yap',

    // TopBar
    'appShell.topbar.balanceTooltip': 'Ortalama ~{tokens} {model} tokeni eder',
    'appShell.topbar.searchPlaceholder': 'Model ara…',
    'appShell.topbar.login': 'Giriş yap',
    'appShell.topbar.register': 'Kayıt ol',

    // Public status modal
    'appShell.status.caption': 'Sistem durumu · public',
    'appShell.status.allOnline': 'Tüm servisler çevrimiçi',
    'appShell.status.partial': '{ok} / {total} sağlayıcı aktif',
    'appShell.status.toneActive': 'aktif',
    'appShell.status.toneSlow': 'yavaş',
    'appShell.status.toneDown': 'kapalı',
    'appShell.status.autoCheck': 'Otomatik kontrol her 30 saniyede · status.yapayzekalab.org',

    // Legal modal
    'appShell.legal.caption': 'Yasal metin',

    // Floating buttons
    'appShell.float.whatsappAria': 'WhatsApp ile destek al',
    'appShell.float.telegramAria': 'Telegram botunu aç',

    // Footer
    'appShell.footer.allOnline': 'Tüm servisler çevrimiçi',
    'appShell.footer.partial': '{ok}/{total} sağlayıcı',

    // Low-balance banner
    'appShell.banner.emptyTitle': 'Bakiyen bitti.',
    'appShell.banner.emptyBody': 'Yeni API çağrıları',
    'appShell.banner.emptyReturning': ' dönüyor.',
    'appShell.banner.lowTitle': 'Bakiyen düşük:',
    'appShell.banner.lowBody': '${balance} kaldı — ortalama ~{tokens} {model} tokeni eder.',
    'appShell.banner.topUp': 'Bakiye yükle',

    // Telegram link error
    'appShell.telegram.linkError': 'Telegram bağlantısı tamamlanamadı.',

    // Maintenance banner (geçici — yalnızca Claude çalışıyor)
    'appShell.maint.title': 'Bakım çalışması',
    'appShell.maint.body': 'Şu anda yalnızca Claude modelleri çalışıyor. Diğer modeller (GPT, Gemini, o-serisi) geçici olarak bakımdadır.',
  },
  en: {
    // Notifications
    'appShell.notif.title': 'Notifications',
    'appShell.notif.activeCount': '{n} active',
    'appShell.notif.loading': 'Loading notifications…',
    'appShell.notif.empty': 'No active admin announcements.',
    'appShell.notif.footer': 'Admin announcements are published instantly',
    'appShell.notif.fetchError': 'Could not load notifications ({status})',
    'appShell.notif.fetchErrorGeneric': 'Could not load notifications.',
    'appShell.notif.timeNew': 'new',
    'appShell.notif.timeJustNow': 'just now',
    'appShell.notif.timeMinAgo': '{n} min ago',
    'appShell.notif.timeHourAgo': '{n} hr ago',
    'appShell.notif.timeDayAgo': '{n} days ago',
    'appShell.notif.subAnnouncement': 'System announcement · {tip}',
    'appShell.notif.subAnnouncementUntil': 'System announcement · {tip} · until {end}',

    // LoginScreen
    'appShell.login.title': 'Continue with Google',
    'appShell.login.subtitle': 'Your YapayZekaLab account is opened via Google sign-in; no separate password is kept.',
    'appShell.login.googleBtn': 'Sign in with Google',
    'appShell.login.githubBtn': 'Sign in with GitHub',
    'appShell.login.hint': 'Sign-up and sign-in are completed through the same Google flow.',
    'appShell.login.consent': 'By signing in you agree to the KVKK Disclosure, Privacy Policy, User Agreement and Distance Sales terms.',
    'appShell.login.legalPrivacy': 'Privacy',
    'appShell.login.legalAgreement': 'User Agreement',
    'appShell.login.legalDistanceSale': 'Distance Sales',

    // WhatsApp OTP
    'appShell.otp.title': 'WhatsApp verification',
    'appShell.otp.subtitle': 'Your Google account is verified. Before opening the panel, verify your WhatsApp number with a one-time code.',
    'appShell.otp.sendError': 'Could not send code.',
    'appShell.otp.sent': 'WhatsApp verification code sent.',
    'appShell.otp.verifyError': 'Could not verify code.',
    'appShell.otp.phonePlaceholder': '05xx xxx xx xx',
    'appShell.otp.marketingConsent': 'I want to receive campaign and announcement messages via WhatsApp. This consent is not required for OTP.',
    'appShell.otp.sendBtn': 'Send WhatsApp code',
    'appShell.otp.sentTo': 'Code sent to number:',
    'appShell.otp.codePlaceholder': '6-digit code',
    'appShell.otp.verifying': 'Verifying…',
    'appShell.otp.verifyBtn': 'Verify code',
    'appShell.otp.resendBtn': 'Resend code',
    'appShell.otp.backToLogin': 'Back to sign-in',

    // LogoutConfirm
    'appShell.logout.title': 'Sign out?',
    'appShell.logout.body': 'Your active session will end. Your balance and API keys are preserved — everything stays the same when you sign in again.',
    'appShell.logout.confirm': 'Sign out',

    // UserMenu
    'appShell.user.fallbackName': 'My Account',
    'appShell.user.fallbackEmail': 'session active',
    'appShell.user.fallbackPlan': 'account',
    'appShell.user.itemAccountBalance': 'My account & balance',
    'appShell.user.itemKeys': 'API keys',
    'appShell.user.itemUsage': 'Usage history',
    'appShell.user.itemSettings': 'Account settings',
    'appShell.user.hintRealList': 'real list',
    'appShell.user.hintRecent': 'recent requests',
    'appShell.user.hintProfileEmail': 'profile, email',
    'appShell.user.logout': 'Sign out',

    // TopBar
    'appShell.topbar.balanceTooltip': 'Roughly ~{tokens} {model} tokens',
    'appShell.topbar.searchPlaceholder': 'Search models…',
    'appShell.topbar.login': 'Sign in',
    'appShell.topbar.register': 'Sign up',

    // Public status modal
    'appShell.status.caption': 'System status · public',
    'appShell.status.allOnline': 'All services online',
    'appShell.status.partial': '{ok} / {total} providers active',
    'appShell.status.toneActive': 'active',
    'appShell.status.toneSlow': 'slow',
    'appShell.status.toneDown': 'down',
    'appShell.status.autoCheck': 'Auto-checked every 30 seconds · status.yapayzekalab.org',

    // Legal modal
    'appShell.legal.caption': 'Legal text',

    // Floating buttons
    'appShell.float.whatsappAria': 'Get support via WhatsApp',
    'appShell.float.telegramAria': 'Open the Telegram bot',

    // Footer
    'appShell.footer.allOnline': 'All services online',
    'appShell.footer.partial': '{ok}/{total} providers',

    // Low-balance banner
    'appShell.banner.emptyTitle': 'Your balance is empty.',
    'appShell.banner.emptyBody': 'New API calls return',
    'appShell.banner.emptyReturning': '.',
    'appShell.banner.lowTitle': 'Low balance:',
    'appShell.banner.lowBody': '${balance} left — roughly ~{tokens} {model} tokens.',
    'appShell.banner.topUp': 'Add balance',

    // Telegram link error
    'appShell.telegram.linkError': 'Could not complete Telegram connection.',

    // Maintenance banner (temporary — only Claude is working)
    'appShell.maint.title': 'Maintenance',
    'appShell.maint.body': 'Currently only Claude models are working. Other models (GPT, Gemini, o-series) are temporarily under maintenance.',
  },
};
