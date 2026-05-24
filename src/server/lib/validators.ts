import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const planIdSchema = z.enum(["ucretsiz", "gelistirici", "pro", "kurumsal"]);

export const userDurumSchema = z.enum(["aktif", "askida", "engelli"]);

export const bakiyeTipSchema = z.enum(["yukleme", "kullanim", "iade", "manuel"]);

export const announcementTipSchema = z.enum(["bilgi", "uyari", "bakim", "yenilik"]);

export const providerDurumSchema = z.enum(["aktif", "yavas", "kapali"]);
