const request = require("supertest");
const express = require("express");
const { z } = require("zod");

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/);
const loanSchema = z.object({
  friendName: z.string().trim().min(1).max(100),
  amount: z.coerce.number().positive().max(100000000).finite(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const app = express();
app.use(express.json());
app.post("/phone-check", (req, res) => {
  const parsed = phoneSchema.safeParse(req.body.phone);
  res.status(parsed.success ? 200 : 400).json({ valid: parsed.success });
});
app.post("/loan-check", (req, res) => {
  const parsed = loanSchema.safeParse(req.body);
  res.status(parsed.success ? 200 : 400).json({ valid: parsed.success });
});

describe("MiniLedger input validation", () => {
  test("accepts a plausible phone number", async () => {
    const response = await request(app).post("/phone-check").send({ phone: "+919876543210" });
    expect(response.status).toBe(200);
  });
  test("rejects malformed phone numbers", async () => {
    const response = await request(app).post("/phone-check").send({ phone: "abc" });
    expect(response.status).toBe(400);
  });
  test("accepts a valid loan payload", async () => {
    const response = await request(app).post("/loan-check")
      .send({ friendName: "Asha", amount: 1500, dueDate: "2026-12-31" });
    expect(response.status).toBe(200);
  });
  test("rejects zero or negative loan amounts", async () => {
    const response = await request(app).post("/loan-check")
      .send({ friendName: "Asha", amount: -5, dueDate: "2026-12-31" });
    expect(response.status).toBe(400);
  });
});
