-- Normalize purchase_order_master's messy date/timestamp text columns into
-- proper typed columns. Source sheet mixed DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
-- and MM-DD-YY formats across rows; the original text is kept in *_raw for
-- audit since a handful of rows couldn't be parsed unambiguously.
ALTER TABLE purchase_order_master
    RENAME COLUMN po_date TO po_date_raw;
ALTER TABLE purchase_order_master
    RENAME COLUMN time_stamp TO time_stamp_raw;

ALTER TABLE purchase_order_master
    ADD COLUMN po_date DATE,
    ADD COLUMN time_stamp_date DATE,
    ADD COLUMN time_stamp_time TIME;
