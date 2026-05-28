# Fiyat Master — YapayZekaLab

Tek kaynak satış fiyat belgesi.

- Müşteriye gösterilen text model fiyatları doğrudan satış fiyatı olarak tutulur.
- Public yüzeyde ham sağlayıcı maliyeti, iç fiyat üretim adımları ve gizli muhasebe notları yer almaz.
- TL karşılığı yalnız canlı kur ve kur tamponu ile hesaplanır.

## Satış Parametreleri

| Parametre | Değer | Açıklama |
|---|---:|---|
| `kurBuffer` | 0.03 | Canlı kura eklenen tampon oran |
| `textCarpan` | 3.0 | İç text fiyat preset çarpanı |
| `imageCarpan` | 3.0 | İç görsel fiyat preset çarpanı |
| `videoCarpan` | 3.0 | İç video fiyat preset çarpanı |

## Public Fiyat İlkesi

- Text modelleri: model kartında görünen input/output USD fiyatı satış fiyatıdır.
- Görsel modeller: satış fiyatı görsel endpoint fiyatına göre ayrıca yönetilir.
- Video modeller: saniye ve çözünürlük bazlı satış fiyatı kullanılır.
- Public katalog yalnız satış fiyatını döner.

## Operasyon Notu

- İç sağlayıcı maliyetleri ve fiyat üretim detayları repo dışı operasyon notlarında tutulur.
- Repo current tree ve deploy paketinde iç fiyat üretim detayları taşınmaz.
