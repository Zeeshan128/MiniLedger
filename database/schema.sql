CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(16) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_name VARCHAR(100) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'repaid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  repaid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loans_user_due_date ON loans(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_loans_user_status ON loans(user_id, status);
