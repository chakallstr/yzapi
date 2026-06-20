# Live State Snapshot Runbook

Bu runbook canli veriyi salt-okunur okumak, MD ledger uretmek ve tam DB dump'i sifreli lokal saklamak icindir.

## Komutlar

```bash
npm run snapshot:live-state -- --dry-run
npm run snapshot:live-state -- --dry-run --allow-incomplete
npm run snapshot:live-state -- --once
```

## Guvenlik

- Raw DB dump repo icine yazilmaz.
- Dump stdout uzerinden remote `pg_dump` -> local `openssl` pipe edilir.
- Sifre macOS Keychain'de tutulur:
  - service: `yzapi-live-snapshot`
  - account: `db-dump`
- Snapshot kok dizini: `/Users/ufuk/.local/share/yzapi-live-snapshots`
- Retention: son 7 snapshot.

## Dataless MD kapisi

`compressed,dataless` iCloud dosyasi varsa default calisma `incomplete` sonucuyla durur. Dosyalari indirip tekrar calistir veya yalniz rapor amacli `--allow-incomplete` kullan.

## Dogrulama

Encrypted dump liste kontrolu:

```bash
PASS="$(security find-generic-password -w -s yzapi-live-snapshot -a db-dump)"
YZAPI_LIVE_SNAPSHOT_PASSPHRASE="$PASS" \
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:YZAPI_LIVE_SNAPSHOT_PASSPHRASE \
  -in live-db.dump.openssl | pg_restore -l
```

Canli deploy bu runbook'un parcasi degildir. Deploy gerekirse sadece `bash scripts/sync-deploy.sh` kullan.
