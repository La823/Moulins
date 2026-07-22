CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres UNIQUE treats NULLs as distinct, so coalesce to a sentinel to
-- guarantee at most one conversation per (client, employee) pair including
-- employee_id IS NULL (the customer+admins-only thread, before any employee
-- is assigned).
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_client_employee
  ON conversations (client_id, COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  ALTER COLUMN receiver_id DROP NOT NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_addressing_chk;
ALTER TABLE messages
  ADD CONSTRAINT messages_addressing_chk CHECK (conversation_id IS NOT NULL OR receiver_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
