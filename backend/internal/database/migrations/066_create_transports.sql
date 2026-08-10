CREATE TABLE IF NOT EXISTS transports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('courier', 'transport')),
    name VARCHAR(150) NOT NULL,
    gst_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (mode, name)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_id UUID REFERENCES transports(id);
