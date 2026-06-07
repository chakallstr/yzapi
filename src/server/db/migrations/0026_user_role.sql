-- 0026_user_role.sql
-- Ortak (partner) RBAC: users tablosuna rol kolonu. owner e-posta ile tanınır
-- (bu kolona yazılmaz); 'partner' = sınırlı co-admin; 'user' = normal müşteri.
-- Deploys INERT: default 'user' → deploy hiçbir şeyi değiştirmez; bir owner
-- bir kullanıcıyı 'partner' yapana kadar davranış aynı kalır.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
