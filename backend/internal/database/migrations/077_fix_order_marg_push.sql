-- OrderID for InsertOrderDetail is Marg-assigned (send blank, they return
-- it as OrderNo), not something we generate — the marg_order_id_seq/column
-- from 076 was based on a misreading of the spec. Drop it; marg_order_no
-- (Marg's own assigned order number) is the only identifier we need.
ALTER TABLE orders DROP COLUMN IF EXISTS marg_order_id;
DROP SEQUENCE IF EXISTS marg_order_id_seq;
