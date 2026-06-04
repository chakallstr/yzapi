-- i18n Faz D: kullanıcı dil tercihi (TR/EN). E-postalar ve API yanıtları bu dile uyar.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lang" text NOT NULL DEFAULT 'tr';
