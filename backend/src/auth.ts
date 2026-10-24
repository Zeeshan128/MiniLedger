import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: number;
  phone?: string;
}

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 24) {
    throw new Error("JWT_SECRET must be set in backend/.env and be at least 24 characters.");
  }
  return value;
}

export function signToken(user: { id: number; phone: string }) {
  return jwt.sign({ phone: user.phone }, secret(), { subject: String(user.id), expiresIn: "7d" });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const decoded = jwt.verify(header.slice(7), secret()) as jwt.JwtPayload;
    if (!decoded.sub || !decoded.phone) throw new Error("Invalid token");
    req.userId = Number(decoded.sub);
    req.phone = String(decoded.phone);
    next();
  } catch {
    return res.status(401).json({ error: "Session is invalid or expired. Please log in again." });
  }
}
