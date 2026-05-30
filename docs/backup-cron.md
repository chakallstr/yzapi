# Backup & Cron — YapayZekaLab

Yedekleme yerel Mac'te (`/Users/ufuk/yeniapi`) çalışır ve canlı VPS'ten
(`root@91.228.227.88:/opt/turkapiprojesi`) DB + uygulama arşivini çeker. Cron da
bu Mac'in kullanıcı crontab'ında kurulur — **canlı VPS crontab'ında değil**.

## Bileşenler

| Dosya | Görev |
|---|---|
| `_ops/backup-full.sh` | Asıl yedek: repo + canlı DB dump (PGDMP) + canlı app + ops/config. AES-256-CBC şifreler, manifest + SHA256SUMS üretir, `verify-backup.sh` çağırır, ikinci kopyayı VPS'e yazar. |
| `_ops/verify-backup.sh` | Checksum + manifest + her şifreli arşivin çözülüp açılabildiğini doğrular (DB dump'ta PGDMP sihirli baytı). |
| `_ops/backup-cron.sh` | **YENİ** — `backup-full.sh`'ı sırlar dosyasından besleyip cron'dan interaktif-olmadan çalıştıran sarmalayıcı; retention + rotasyon logu. |
| `_ops/backup.secrets.env` | **commit edilmez, chmod 600** — SSH + şifreleme parolaları. |

## Sırlar dosyası (commit edilmez)

`_ops/backup.secrets.env` oluştur, izinleri kilitle:

```bash
# /Users/ufuk/yeniapi/_ops/backup.secrets.env
YENIAPI_CANLI_SSH_PASSWORD=<canli-vps-ssh-parolasi>
BACKUP_ENCRYPTION_PASSWORD=<yedek-sifreleme-parolasi>
# Opsiyonel:
BACKUP_RETENTION_COUNT=14
SKIP_BELGELER_BACKUP=1
```

```bash
chmod 600 /Users/ufuk/yeniapi/_ops/backup.secrets.env
```

> `_ops/` git reposunun dışında (workspace kökü git değil) → sırlar dosyası
> kazara commit edilemez. Yine de 600 izniyle koru.

## Backup komutu (tekrarlanabilir)

```bash
/Users/ufuk/yeniapi/_ops/backup-cron.sh
```

- Çıktı yolu: `/Users/ufuk/yeniapi/_backups/<UTC-timestamp>/` (örn. `20260530T060105Z/`).
  Her klasörde: `*.enc` (4 arşiv), `manifest.json`, `SHA256SUMS`, `backup.log`.
- Rotasyon logu: `/Users/ufuk/yeniapi/_backups/_logs/backup-cron.log` (her satır START/OK/FAIL/PRUNE/DONE).
- Hata görünürlüğü: wrapper başarısızlıkta log'a `FAIL ...` yazar ve non-zero exit verir → cron MAILTO veya log izleme ile yakalanır.

## Cron kurulumu (operatör uygular)

Önerilen zamanlama — her gece 03:00 (yerel Mac saati):

```cron
0 3 * * * /Users/ufuk/yeniapi/_ops/backup-cron.sh >> /Users/ufuk/yeniapi/_backups/_logs/backup-cron.log 2>&1
```

Kurmak için (operatör, onay sonrası):

```bash
# Mevcut crontab'ı önce yedekle
crontab -l > /Users/ufuk/yeniapi/_backups/_logs/crontab.before.$(date -u +%Y%m%dT%H%M%SZ).txt 2>/dev/null || true
# Satırı ekle (mevcut girdileri koruyarak)
( crontab -l 2>/dev/null; echo '0 3 * * * /Users/ufuk/yeniapi/_ops/backup-cron.sh >> /Users/ufuk/yeniapi/_backups/_logs/backup-cron.log 2>&1' ) | crontab -
# Doğrula
crontab -l
```

> macOS notu: cron'un Documents/diske erişebilmesi için `cron` (veya `/usr/sbin/cron`)
> ikilisine **Full Disk Access** vermek gerekebilir (System Settings → Privacy & Security).
> `SKIP_BELGELER_BACKUP=1` ile Belgeler arşivi atlanırsa bu sorun büyük ölçüde önlenir.

## Retention

- Varsayılan: en yeni **14** zaman-damgalı yedek tutulur, eskiler `_backups/` altından silinir.
- Pruning yalnızca `_backups/<timestamp>Z` kalıbına uyan klasörlere uygulanır (guard'lı).
- `BACKUP_RETENTION_COUNT` ile değiştirilebilir.

## Restore prosedürü (özet)

1. Geri yüklenecek yedek klasörünü seç: `_backups/<timestamp>/`.
2. Önce doğrula: `BACKUP_ENCRYPTION_PASSWORD=... _ops/verify-backup.sh _backups/<timestamp>`.
3. DB dump'ı çöz: `openssl enc -d -aes-256-cbc -pbkdf2 -in live-db.dump.enc -out live-db.dump -pass env:BACKUP_ENCRYPTION_PASSWORD`.
4. Hedef DB'ye yükle: `pg_restore --clean --if-exists -d <DATABASE_URL> live-db.dump` (PGDMP custom format).
5. App arşivi gerekirse: `openssl enc -d ... -in live-app.tar.gz.enc | tar -xzf -`.
6. `_ops/restore-guide.sh` adım adım rehber içerir.

> Restore canlı DB'yi değiştirir → yalnızca felaket kurtarma/staging'de, onaylı çalıştır.

## Failure handling

- `backup-cron.sh` herhangi bir adımda non-zero exit → rotasyon log'unda `FAIL` satırı.
- `backup-full.sh` `set -euo pipefail` ile çalışır; eksik komut/SSH/staging hatasında durur.
- `verify-backup.sh` checksum veya çözme hatasında non-zero → bozuk yedek "OK" işaretlenmez
  (`manifest.json` `verification_result` sadece verify geçerse `ok` olur).
