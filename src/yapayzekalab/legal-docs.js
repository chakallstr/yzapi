export const LEGAL_DOCS = {
  kvkk: {
    title: 'KVKK Aydınlatma Metni',
    body: [
      'YapayZekaLab kapsamında paylaşılan ad, soyad, e-posta, telefon, ödeme ve kullanım kayıtları hizmetin sunulması, hesap güvenliği, ödeme doğrulaması, destek süreçleri ve yasal yükümlülüklerin yerine getirilmesi amacıyla işlenir.',
      'Veriler yalnızca hizmetin işletilmesi için gerekli ölçüde saklanır. API kullanım kayıtları, bakiye hareketleri, güvenlik logları ve duyuru teslim kayıtları operasyonel gereklilik kapsamında tutulabilir.',
      'Kullanıcı verileri hizmet altyapısında ve zorunlu entegrasyonlarda işlenebilir. Ödeme, kimlik doğrulama ve mesajlaşma süreçlerinde ilgili teknik sağlayıcılara sınırlı veri aktarımı yapılabilir.',
      'Veri sorumlusu iletişim bilgileri: YapayZekaLab, e-posta: admin@seslab.com.tr, telefon: 0531 931 07 81. Fiziksel adres, vergi numarası ve MERSİS bilgisi şu an paylaşılmamaktadır.',
      'Kullanıcı, KVKK kapsamındaki başvurularını admin@seslab.com.tr adresine iletebilir. Talepler yürürlükteki mevzuat çerçevesinde değerlendirilir.',
    ],
  },
  sozlesme: {
    title: 'Kullanıcı Sözleşmesi',
    body: [
      'YapayZekaLab hesabını kullanan herkes, hizmeti yalnızca hukuka uygun amaçlarla kullanacağını kabul eder. Kullanıcı, API anahtarını üçüncü kişilerle izinsiz paylaşmamakla ve hesabındaki işlemlerden sorumlu olmakla yükümlüdür.',
      'Hizmet bakiyeli kullanım modeliyle çalışır. Kullanıcı yalnızca hesabındaki bakiye kadar kullanım yapabilir. Sistem, yetersiz bakiye durumunda isteği durdurabilir veya reddedebilir.',
      'YapayZekaLab, kötüye kullanım, güvenlik riski, ters ibraz, sahte ödeme bildirimi, saldırı, spam veya hizmeti istismar eden davranışlarda hesabı askıya alma, API erişimini kesme veya işlemleri iptal etme hakkını saklı tutar.',
      'Kullanıcı, üçüncü taraf yapay zeka sağlayıcılarının yanıtlarından doğan içerik sonuçlarının kendi sorumluluğunda olduğunu kabul eder. YapayZekaLab çıktıların doğruluğu, kesintisizliği veya belirli bir amaca uygunluğu konusunda garanti vermez.',
      'Destek ve resmi bildirim kanalı admin@seslab.com.tr adresidir. Gerektiğinde 0531 931 07 81 numarası üzerinden iletişim kurulabilir.',
    ],
  },
  gizlilik: {
    title: 'Gizlilik Politikası',
    body: [
      'YapayZekaLab, kullanıcıya ait hesap, bakiye, ödeme ve kullanım verilerini hizmeti işletmek için gerekli olduğu sürece korur. Yetkisiz erişime karşı makul teknik ve idari önlemler uygulanır.',
      'API anahtarları, doğrulama belirteçleri ve benzeri hassas bilgiler son kullanıcıya sadece gerekli anlarda gösterilir; sistem içinde korunur ve herkese açık yüzeylerde paylaşılmaz.',
      'Kullanıcı içerikleri ve istek kayıtları güvenlik, faturalama, hata ayıklama ve suistimal önleme amaçlarıyla sınırlı olarak işlenebilir. Yasal zorunluluk olmadıkça üçüncü kişilerle pazarlama amacıyla paylaşılmaz.',
      'WhatsApp, Google oturumu, ödeme ve diğer entegrasyonlarda ilgili sağlayıcının teknik gerektirdiği kadar veri iletimi olabilir. Kullanıcı bu entegrasyonların kendi politikalarına da tabi olduğunu kabul eder.',
      'Gizlilik talepleri ve veri soruları için admin@seslab.com.tr adresi kullanılmalıdır.',
    ],
  },
  mesafeli: {
    title: 'Mesafeli Satış Bilgilendirmesi',
    body: [
      'YapayZekaLab üzerinde yapılan bakiye yüklemeleri dijital hizmet kullanımına yöneliktir. Kullanıcı, satın aldığı bakiyeyi API ve panel içindeki dijital işlemlerde kullanır.',
      'Bakiye yükleme işlemleri banka havalesi, kart, kripto veya aktif edilen diğer yöntemlerle alınabilir. Ödeme onayı tamamlanmadan bakiye tanımlanmaz.',
      'Dijital hizmetlerde bakiye tanımlandıktan ve kullanım başladıktan sonra iade değerlendirmesi, ilgili mevzuat, ödeme kaydı ve kötüye kullanım incelemesine göre yapılır. Sahte bildirim veya ters ibraz durumlarında hesap askıya alınabilir.',
      'Satıcı/hizmet sağlayıcı bilgileri: YapayZekaLab, e-posta admin@seslab.com.tr, telefon 0531 931 07 81. Fiziksel adres, vergi numarası ve MERSİS bilgisi şu an paylaşılmamaktadır.',
      'Kullanıcı, ödeme yaparak dijital hizmete ilişkin ön bilgilendirmeyi okuduğunu ve elektronik ortamda onay verdiğini kabul eder.',
    ],
  },
};

export const LEGAL_DOC_ORDER = ['kvkk', 'sozlesme', 'gizlilik', 'mesafeli'];

export const buildLegalDocsPlainText = () => LEGAL_DOC_ORDER
  .map((key) => {
    const doc = LEGAL_DOCS[key];
    return `${doc.title}\n\n${doc.body.join('\n\n')}`;
  })
  .join('\n\n--------------------\n\n');
