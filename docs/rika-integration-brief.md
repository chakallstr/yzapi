# YapayZekaLab — Rika AI Reseller Integration Brief

> **Audience:** Rika AI systems, reseller support, and technical onboarding.
> **Purpose:** Describes how YapayZekaLab interacts with Rika AI as a reseller.
> **Version:** 1.0 · 2026-06-08

---

## 1. Platform Identity

| Field | Value |
|---|---|
| Platform name | YapayZekaLab |
| Public URL | https://yapayzekalab.org |
| Role | Rika AI reseller — routes end-user AI requests through the Rika GPT/Codex layer |
| Region | Turkey (TR) |
| Primary language | Turkish + English |

YapayZekaLab is an AI API gateway for Turkish developers and businesses. It provides
OpenAI-compatible endpoints under `https://yapayzekalab.org/v1` and uses Rika AI as
the upstream provider for GPT-5.5 and GPT-5.4 models.

---

## 2. Request Structure

Every request forwarded to Rika originates from an authenticated YapayZekaLab
customer. Requests conform to the OpenAI Chat Completions API format.

### 2.1 Identifying fields

| Field | Location | Content | Example |
|---|---|---|---|
| `user` | JSON body | YapayZekaLab customer UUID | `"b653ee71-45a6-40cc-8d8d-374c1eae0d76"` |
| `Authorization` | Header | Rika reseller API key (Bearer) | `Bearer <rika_api_key>` |
| `model` | JSON body | Canonical model ID | `"gpt-5.5"` or `"gpt-5.4"` |

The `user` field is the **opaque internal customer identifier** within YapayZekaLab.
It is a UUID v4, not a personal name or email. It is included for:
- Per-customer abuse detection on Rika's side
- Request traceability across both platforms

### 2.2 What is NOT included

The following are **never** sent to Rika:
- Customer email addresses
- Customer names or phone numbers
- YapayZekaLab pricing or billing data
- Internal provider routing names
- Prompt content logs (only forwarded in the live request body, not stored externally)

---

## 3. Model Usage

| Model | Status | Notes |
|---|---|---|
| `gpt-5.5` | Active (default) | Primary GPT model |
| `gpt-5.5-2026-04-23` | Active | Dated alias |
| `gpt-5.4` | Active | Secondary GPT model |
| `gpt-5.4-2026-03-05` | Active | Dated alias |

Model selection is managed by YapayZekaLab admins via the Rika card in the admin panel.
Traffic can be switched between `gpt-5.5` and `gpt-5.4` without redeployment.

---

## 4. Traffic Characteristics

- **Request type:** Chat completions (`/v1/chat/completions`), streaming and non-streaming
- **Concurrency:** Standard reseller usage — no burst flooding expected
- **Daily volume:** Varies; governed by per-customer package limits (e.g. 500 req/day for free tier)
- **Timeout expectation:** 30 s connect, 120 s stream completion

---

## 5. Package Context

YapayZekaLab sells access packages that allow customers to use Rika-backed models:

| Package | Daily limit | Models | Price |
|---|---|---|---|
| GPT/Codex Deneme (500) | 500 requests | gpt-5.5, gpt-5.4 | Free (30 days) |

Each request deducts from the customer's package quota before reaching Rika.
A request that fails upstream may be refunded to the customer's quota.

---

## 6. Reseller Monitoring

YapayZekaLab monitors reseller quota via:

```
GET https://ai.rika.wtf/reseller/api/key-details?resellerId=<RESELLER_ID>
```

This data is displayed in the YapayZekaLab admin panel (Rika GPT/Codex card)
and is used to manage key rotation and quota planning.

---

## 7. Contact & Escalation

For platform-level issues (quota exhaustion, key suspension, model availability):

- Platform: https://yapayzekalab.org
- Reseller panel: https://ai.rika.wtf/reseller

Rika API key and reseller credentials are managed through the Rika reseller dashboard
and stored encrypted in YapayZekaLab infrastructure. They are never exposed to end users.

---

*This document is intended for technical and AI-assisted onboarding only.
No proprietary pricing, customer PII, or internal routing configuration is included.*
