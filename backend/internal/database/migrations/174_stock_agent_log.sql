-- Every question put to the stock agent: who asked, the answer, the tool
-- calls behind it (name, inputs, timing — not the data they returned, which
-- goes stale), and the tokens and cost. The day's token total is also the
-- agent's daily limit.

CREATE TABLE IF NOT EXISTS stock_agent_log (
    id             BIGSERIAL PRIMARY KEY,
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    question       TEXT NOT NULL,
    answer         TEXT,                      -- NULL when it failed
    steps          JSONB NOT NULL DEFAULT '[]',
    model          TEXT NOT NULL,
    input_tokens   INT NOT NULL DEFAULT 0,
    output_tokens  INT NOT NULL DEFAULT 0,
    cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
    ms             INT NOT NULL DEFAULT 0,    -- time to answer
    error          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_agent_log_created_idx ON stock_agent_log (created_at);
CREATE INDEX IF NOT EXISTS stock_agent_log_user_idx ON stock_agent_log (user_id, created_at DESC);
