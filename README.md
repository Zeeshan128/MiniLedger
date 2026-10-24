# MiniLedger

MiniLedger is a small React Native app and Node.js/TypeScript/PostgreSQL API for tracking money lent to friends. It includes mock phone OTP authentication, loan creation, repayment, a summary endpoint, overdue highlighting, input validation, and basic validation tests.

> **Demo security note:** OTPs are intentionally printed in the backend terminal because the assignment asks for mock OTP. This is a demo implementation, not production authentication. OTPs are held in memory and are lost when the backend restarts.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer
- npm
- Expo Go on a physical phone, or Android Studio emulator (optional)

## 1. Create the database

Open pgAdmin or a PostgreSQL terminal and create a database named `miniledger`:

```sql
CREATE DATABASE miniledger;
```

Then run the schema file against that database. In pgAdmin, select `miniledger`, open Query Tool, open `database/schema.sql`, and execute it.

Or from a terminal (adjust the username if needed):

```powershell
psql -U postgres -d miniledger -f database/schema.sql
```

## 2. Start the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edit `backend/.env`. Replace `YOUR_PASSWORD` with your PostgreSQL password and set `JWT_SECRET` to a random string at least 24 characters long.

Example:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:MyLocalPassword@localhost:5432/miniledger
JWT_SECRET=replace-with-a-long-random-secret-at-least-24-chars
OTP_TTL_MINUTES=5
```

Start development server:

```powershell
npm run dev
```

You should see `MiniLedger API listening on http://localhost:4000`. Test `http://localhost:4000/health` in your browser. The response should contain `"status":"ok"`.

In a second backend terminal, run:

```powershell
npm test
npm run build
```

## 3. Configure and run the Expo app

In a new terminal:

```powershell
cd mobile
npm install
Copy-Item .env.example .env
```

Edit `mobile/.env` and set `EXPO_PUBLIC_API_URL` to an address the mobile app can reach:

- **Android emulator:** `http://10.0.2.2:4000`
- **iOS simulator:** `http://localhost:4000`
- **Physical phone:** `http://YOUR_COMPUTER_LAN_IP:4000` (example: `http://192.168.1.20:4000`)

For a physical phone, connect phone and computer to the same Wi-Fi. Find your computer's LAN IPv4 address using `ipconfig`. Allow Node.js through Windows Firewall on private networks if prompted. The backend listens on `0.0.0.0` for LAN access.

Start Expo:

```powershell
npx expo start
```

Scan the QR code with Expo Go. If you change `.env`, restart Expo and clear cache if necessary:

```powershell
npx expo start --clear
```

## 4. Demo login flow

1. Enter a phone number, e.g. `+919876543210`.
2. Press **Send mock OTP**.
3. Read the OTP in the backend terminal, shown as `[MiniLedger MOCK OTP]`.
4. Enter the 6-digit OTP in the app.
5. Add a loan with a friend name, positive amount, and date (`YYYY-MM-DD`).
6. Add an entry with a due date before today to see overdue highlighting.
7. Tap **Mark as repaid** to update its status.
8. Pull down to refresh and verify the summary totals.

## API overview

All loan endpoints require `Authorization: Bearer <token>` from OTP verification.

| Method | Endpoint | Body / purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/send-otp` | `{ "phone": "+919876543210" }` |
| POST | `/auth/verify-otp` | `{ "phone": "+919876543210", "otp": "123456" }` |
| GET | `/loans` | List the authenticated user's loans |
| POST | `/loans` | `{ "friendName": "Asha", "amount": 1500, "dueDate": "2026-12-31" }` |
| PATCH | `/loans/:id/repay` | Mark an unpaid loan as repaid |
| GET | `/summary` | Summary totals for the authenticated user |

### Summary definitions

- `totalLent`: sum of all original loan amounts.
- `totalRepaid`: sum of amounts for loans marked fully repaid.
- `overdueAmount`: sum of unpaid loans with `due_date < CURRENT_DATE`.
- `outstandingAmount`: sum of all unpaid loans.
- `activeLoans`: count of unpaid loans.

The current UI models full repayment only, as required by the assignment; it does not support partial repayments.

## Tests

The Jest tests cover phone and loan input validation:

```powershell
cd backend
npm test
```

## Repository structure

```text
MiniLedger/
├── backend/       # Express + TypeScript REST API
├── database/      # PostgreSQL schema
├── mobile/        # Expo React Native app
└── README.md
```

## Before publishing to GitHub

- Do not commit `.env` files, passwords, tokens, or real OTPs.
- Keep `.env.example` files with placeholders only.
- Test the complete app flow and update this README if you change commands or endpoints.
- Add your own screenshots to the README if useful.
- Record a 2–3 minute demo showing login, add loan, overdue styling, repayment, and updated totals.
