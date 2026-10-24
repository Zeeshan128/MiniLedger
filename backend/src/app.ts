import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { query } from "./db";
import { requireAuth, AuthRequest, signToken } from "./auth";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number with country code if needed.");
const sendOtpSchema = z.object({ phone: phoneSchema });
const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits.")
});
const loanSchema = z.object({
  friendName: z.string().trim().min(1).max(100),
  amount: z.coerce.number().positive().max(100000000).finite(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD.")
}).refine((v) => {
  const d = new Date(`${v.dueDate}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v.dueDate;
}, { message: "Enter a valid due date.", path: ["dueDate"] });

function validationMessage(error: z.ZodError) {
  return error.issues.map(i => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

app.get("/health", (_req, res) => res.json({ status: "ok", app: "MiniLedger API" }));

app.post("/auth/send-otp", otpLimiter, async (req: Request, res: Response) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });

  const phone = parsed.data.phone;
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { otp, expiresAt: Date.now() + Number(process.env.OTP_TTL_MINUTES || 5) * 60_000 });
  // Mock OTP for this assignment only. Never log OTPs in a production authentication system.
  console.log(`[MiniLedger MOCK OTP] phone=${phone} otp=${otp}`);
  return res.json({ message: "OTP generated. Check the backend terminal for the mock OTP." });
});

app.post("/auth/verify-otp", async (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });

  const { phone, otp } = parsed.data;
  const stored = otpStore.get(phone);
  if (!stored || stored.expiresAt < Date.now() || stored.otp !== otp) {
    return res.status(401).json({ error: "Invalid or expired OTP. Request a new OTP." });
  }
  otpStore.delete(phone);

  try {
    const result = await query<{ id: number; phone: string }>(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone`,
      [phone]
    );
    const user = result.rows[0];
    return res.json({ token: signToken(user), user: { id: user.id, phone: user.phone } });
  } catch (err) {
    console.error("OTP verification/database error:", err);
    return res.status(500).json({ error: "Could not complete login. Check the database connection." });
  }
});

app.get("/loans", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, friend_name AS "friendName", amount::float8 AS amount,
              due_date AS "dueDate", status, created_at AS "createdAt",
              repaid_at AS "repaidAt",
              (status = 'unpaid' AND due_date < CURRENT_DATE) AS overdue
       FROM loans WHERE user_id = $1 ORDER BY due_date ASC, created_at DESC`,
      [req.userId]
    );
    res.json({ loans: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load loans." });
  }
});

app.post("/loans", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = loanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  try {
    const result = await query(
      `INSERT INTO loans (user_id, friend_name, amount, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, friend_name AS "friendName", amount::float8 AS amount,
                 due_date AS "dueDate", status, created_at AS "createdAt",
                 repaid_at AS "repaidAt", false AS overdue`,
      [req.userId, parsed.data.friendName, parsed.data.amount, parsed.data.dueDate]
    );
    res.status(201).json({ loan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create loan." });
  }
});

app.patch("/loans/:id/repay", requireAuth, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid loan ID." });
  try {
    const result = await query(
      `UPDATE loans SET status = 'repaid', repaid_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'unpaid'
       RETURNING id, friend_name AS "friendName", amount::float8 AS amount,
                 due_date AS "dueDate", status, created_at AS "createdAt",
                 repaid_at AS "repaidAt", false AS overdue`,
      [id, req.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Unpaid loan not found." });
    res.json({ loan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not mark loan as repaid." });
  }
});

app.get("/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query<{
      totalLent: string; totalRepaid: string; overdueAmount: string; outstandingAmount: string; activeLoans: string;
    }>(
      `SELECT
         COALESCE(SUM(amount), 0)::numeric(14,2)::text AS "totalLent",
         COALESCE(SUM(amount) FILTER (WHERE status = 'repaid'), 0)::numeric(14,2)::text AS "totalRepaid",
         COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid' AND due_date < CURRENT_DATE), 0)::numeric(14,2)::text AS "overdueAmount",
         COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0)::numeric(14,2)::text AS "outstandingAmount",
         COUNT(*) FILTER (WHERE status = 'unpaid')::text AS "activeLoans"
       FROM loans WHERE user_id = $1`,
      [req.userId]
    );
    const row = result.rows[0];
    res.json({
      totalLent: Number(row.totalLent),
      totalRepaid: Number(row.totalRepaid),
      overdueAmount: Number(row.overdueAmount),
      outstandingAmount: Number(row.outstandingAmount),
      activeLoans: Number(row.activeLoans)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not calculate summary." });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Endpoint not found." }));
export default app;
