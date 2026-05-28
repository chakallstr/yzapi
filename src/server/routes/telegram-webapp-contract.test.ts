import { createHmac } from "crypto";
import express, { type NextFunction, type Request, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOT_TOKEN = "123456:ABCDEF_test_bot_token";
const NOW_SEC = 1_800_000_000;

const mocks = vi.hoisted(() => ({
  configRows: [{ kur: "47.084289", minBakiyeTL: "250", maxBakiyeTL: "50000" }],
  insertedPayments: [] as Array<Record<string, unknown>>,
  updatedPayments: [] as Array<Record<string, unknown>>,
  createCryptoPayInvoice: vi.fn(),
  upsertTelegramAccount: vi.fn(),
  getUserBalanceTL: vi.fn(),
  deliverApiAccessToTelegramUser: vi.fn(),
  answerTelegramCallback: vi.fn(),
  editTelegramMessageText: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        limit: vi.fn(async () => mocks.configRows),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          mocks.insertedPayments.push(values);
          return [{ id: "pay_test_1" }];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          mocks.updatedPayments.push(values);
        }),
      })),
    })),
  },
}));

vi.mock("../middleware/admin-auth.js", () => ({
  adminAuth: vi.fn((_req, _res, next) => next()),
}));

vi.mock("../middleware/user-auth.js", () => ({
  userAuth: vi.fn((_req, _res, next) => next()),
}));

vi.mock("../services/payment-common.js", () => ({
  calcKdv: (grossTL: number) => ({
    gross: grossTL,
    netTL: Math.round((grossTL / 1.2) * 10000) / 10000,
    kdvTL: Math.round((grossTL - grossTL / 1.2) * 10000) / 10000,
  }),
  creditUserBalance: vi.fn(),
}));

vi.mock("../services/crypto-pay-service.js", () => {
  class CryptoPayError extends Error {
    constructor(message: string, public details?: unknown) {
      super(message);
      this.name = "CryptoPayError";
    }
  }

  return {
    CryptoPayError,
    createCryptoPayInvoice: mocks.createCryptoPayInvoice,
    getPaidCryptoPayInvoice: vi.fn(),
    verifyCryptoPayWebhook: vi.fn(() => true),
  };
});

vi.mock("../services/telegram-bot-service.js", () => ({
  answerTelegramCallback: mocks.answerTelegramCallback,
  buildTelegramMainMenu: vi.fn(() => ({
    inline_keyboard: [
      [{ text: "Yükleme Paneli", callback_data: "tg:topup:panel" }],
      [{ text: "Bakiye", callback_data: "tg:balance" }],
    ],
  })),
  buildTelegramTopupPanelMenu: vi.fn((url: string) => ({
    inline_keyboard: [
      [{ text: "Paneli Aç", web_app: { url } }],
      [{ text: "Geri", callback_data: "tg:menu" }],
    ],
  })),
  consumeTelegramLinkCode: vi.fn(),
  createTelegramLinkCode: vi.fn(),
  deliverApiAccessToTelegramUser: mocks.deliverApiAccessToTelegramUser,
  editTelegramMessageText: mocks.editTelegramMessageText,
  formatBalanceMessage: vi.fn((balance: number) => `Güncel bakiyen: ${balance.toFixed(2)} TL`),
  getUserBalanceTL: mocks.getUserBalanceTL,
  parseTelegramCommand: vi.fn(() => ({ type: "menu" })),
  sendTelegramMessage: mocks.sendTelegramMessage,
  upsertTelegramAccount: mocks.upsertTelegramAccount,
}));

function signedInitData(params: Record<string, string>, token = BOT_TOKEN): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const search = new URLSearchParams(params);
  search.set("hash", hash);
  return search.toString();
}

function validInitData() {
  return signedInitData({
    auth_date: String(NOW_SEC - 60),
    query_id: "AAE-test",
    user: JSON.stringify({ id: 7075241777, first_name: "Sesli", username: "seslitr" }),
  });
}

async function createTelegramTestServer(): Promise<{ baseUrl: string; server: Server }> {
  vi.resetModules();
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.CRYPTO_PAY_API_TOKEN = "crypto-pay-token";
  process.env.APP_BASE_URL = "https://yapayzekalab.example";

  const router = (await import("./telegram.js")).default;
  const app = express();
  app.use(express.json());
  app.use("/api/telegram", router);
  app.use((error: unknown, _req: Request, res: ExpressResponse, _next: NextFunction) => {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown" });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function readJson(response: globalThis.Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_SEC * 1000));
  vi.clearAllMocks();
  mocks.configRows = [{ kur: "47.084289", minBakiyeTL: "250", maxBakiyeTL: "50000" }];
  mocks.insertedPayments = [];
  mocks.updatedPayments = [];
  mocks.upsertTelegramAccount.mockResolvedValue({
    userId: "user_test_1",
    telegramAccountId: "telegram_account_test_1",
  });
  mocks.getUserBalanceTL.mockResolvedValue(123.45);
  mocks.deliverApiAccessToTelegramUser.mockResolvedValue({ delivered: true, alreadyDelivered: false });
  mocks.createCryptoPayInvoice.mockResolvedValue({
    invoiceId: "invoice_test_1",
    status: "active",
    payUrl: "https://t.me/CryptoBot/app?startapp=test",
    raw: { invoice_id: 123, status: "active" },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("telegram WebApp route contract", () => {
  it("returns linked Telegram balance and payment limits for valid initData", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webapp/me`, {
        headers: { "X-Telegram-Init-Data": validInitData() },
      });

      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        balanceTL: 123.45,
        kur: 47.084289,
        minBakiyeTL: 250,
        maxBakiyeTL: 50000,
        quickAmountsUsd: [5, 10, 25],
        user: {
          telegramId: "7075241777",
          username: "seslitr",
          firstName: "Sesli",
        },
      });
      expect(mocks.upsertTelegramAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 7075241777 }));
    } finally {
      await closeServer(server);
    }
  });

  it("rejects invalid WebApp initData before linking any account", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webapp/me`, {
        headers: { "X-Telegram-Init-Data": `${validInitData()}tampered` },
      });

      expect(response.status).toBe(401);
      expect(await readJson(response)).toMatchObject({ error: "Invalid Telegram WebApp init data" });
      expect(mocks.upsertTelegramAccount).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it("creates a Crypto Pay invoice from the signed Telegram user, not request body identity", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webapp/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": validInitData(),
        },
        body: JSON.stringify({ amountUsd: "10", telegramId: "attacker" }),
      });

      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        paymentId: "pay_test_1",
        invoiceId: "invoice_test_1",
        payUrl: "https://t.me/CryptoBot/app?startapp=test",
        amountUsd: 10,
        creditTL: 470.8429,
        payableTL: 471,
      });
      expect(mocks.insertedPayments[0]).toMatchObject({
        userId: "user_test_1",
        metod: "crypto_bot",
        amountUsd: "10",
        providerPayload: { source: "telegram", telegramId: "7075241777" },
      });
      expect(mocks.createCryptoPayInvoice).toHaveBeenCalledWith(expect.objectContaining({
        paymentId: "pay_test_1",
        amountUsd: 10,
      }));
    } finally {
      await closeServer(server);
    }
  });

  it("rejects amounts outside existing TL limits before creating payment or provider invoice", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webapp/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": validInitData(),
        },
        body: JSON.stringify({ amountUsd: "1" }),
      });

      expect(response.status).toBe(400);
      expect(await readJson(response)).toMatchObject({ error: "Minimum yükleme 250.00 TL" });
      expect(mocks.insertedPayments).toHaveLength(0);
      expect(mocks.createCryptoPayInvoice).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it("edits the old Telegram message into a WebApp panel button for top-up callbacks", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query: {
            id: "callback_test_1",
            data: "tg:topup:panel",
            from: { id: 7075241777, first_name: "Sesli" },
            message: { message_id: 42, chat: { id: 7075241777 } },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.answerTelegramCallback).toHaveBeenCalledWith("callback_test_1");
      expect(mocks.editTelegramMessageText).toHaveBeenCalledWith(expect.objectContaining({
        chatId: 7075241777,
        messageId: 42,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "Paneli Aç", web_app: { url: "https://yapayzekalab.example/telegram/topup" } }],
            [{ text: "Geri", callback_data: "tg:menu" }],
          ],
        },
      }));
      expect(JSON.stringify(mocks.editTelegramMessageText.mock.calls[0][0].replyMarkup)).not.toContain("tg:topup:5");
    } finally {
      await closeServer(server);
    }
  });

  it("falls back to sending the WebApp panel when Telegram cannot edit the old message", async () => {
    mocks.editTelegramMessageText.mockRejectedValueOnce(new Error("Telegram editMessageText failed: Bad Request: chat not found"));
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query: {
            id: "callback_edit_fail",
            data: "tg:topup:panel",
            from: { id: 7075241777, first_name: "Sesli" },
            message: { message_id: 42, chat: { id: 7075241777 } },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
        7075241777,
        expect.stringContaining("Yükleme paneli hazır"),
        expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [{ text: "Paneli Aç", web_app: { url: "https://yapayzekalab.example/telegram/topup" } }],
          ]),
        }),
      );
    } finally {
      await closeServer(server);
    }
  });

  it("lets Telegram users create a fresh copyable API key without revoking the old one", async () => {
    const { baseUrl, server } = await createTelegramTestServer();
    try {
      const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query: {
            id: "callback_change_key",
            data: "tg:apikey:change",
            from: { id: 7075241777, first_name: "Sesli" },
            message: { message_id: 43, chat: { id: 7075241777 } },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.deliverApiAccessToTelegramUser).toHaveBeenCalledWith({
        userId: "user_test_1",
        telegramAccountId: "telegram_account_test_1",
        chatId: 7075241777,
        forceNewKey: true,
      });
    } finally {
      await closeServer(server);
    }
  });
});
