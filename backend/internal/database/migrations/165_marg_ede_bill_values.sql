-- Each Marg bill's value split out of its lines: goods before GST (what the
-- Analysis reports and monthly graphs count), GST on them, and charges
-- (### freight, insurance, ...) with their GST. marg_ede_bills.total is the
-- invoice total and includes all of it.
--
-- A bill whose lines Marg didn't fully send (lines_complete = false) is
-- undercounted here by the missing lines.
CREATE OR REPLACE VIEW v_marg_ede_bill_values AS
SELECT
    i.voucher,
    COALESCE(SUM(i.amount)     FILTER (WHERE i.line_kind = 'item'), 0)   AS goods_amount,
    COALESCE(SUM(i.gst_amount) FILTER (WHERE i.line_kind = 'item'), 0)   AS goods_gst,
    COALESCE(SUM(i.amount)     FILTER (WHERE i.line_kind = 'charge'), 0) AS charges_amount,
    COALESCE(SUM(i.gst_amount) FILTER (WHERE i.line_kind = 'charge'), 0) AS charges_gst
FROM marg_ede_bill_items i
WHERE NOT i.is_deleted
GROUP BY i.voucher;
