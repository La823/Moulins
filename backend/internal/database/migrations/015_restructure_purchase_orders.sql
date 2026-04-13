DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(50) NOT NULL UNIQUE,
    sr_no INT,
    po_date DATE NOT NULL,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    mrp DECIMAL(12,2),
    rate DECIMAL(12,2),
    estimate DECIMAL(14,2),
    specifications VARCHAR(255),
    type VARCHAR(100),
    manufacturer_id UUID REFERENCES manufacturers(id),
    qty_received INT DEFAULT 0,
    remarks TEXT,
    category VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'mail_done',
    bill_number VARCHAR(100),
    document_key VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_po_manufacturer_id ON purchase_orders(manufacturer_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_category ON purchase_orders(category);
CREATE INDEX idx_po_number ON purchase_orders(po_number);
