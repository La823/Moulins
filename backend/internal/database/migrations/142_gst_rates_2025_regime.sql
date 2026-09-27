-- Move the GST rate data onto the post-22-September-2025 regime.
--
-- Migration 141 loaded rates scraped from cbic-gst.gov.in's goods-rate page.
-- That page is frozen: its own footer reads "Updated: 06 May 2025" and its
-- notification index stops at 2023. It therefore predates the 56th GST Council
-- rationalisation, which took effect 22 September 2025, collapsed the 12% and
-- 28% slabs and added a 40% demerit slab. Medicaments under Chapter 30 moved
-- from 12% to 5% -- so every pharmaceutical rate in the table was a year out of
-- date and wrong.
--
-- Rates now come from Notification 9/2025-Integrated Tax (Rate), in force from
-- 22 September 2025, parsed from the PDF's ruled table cells. Its schedules
-- carry no rate columns; the rate IS the schedule:
--
--   I = 5%   II = 18%   III = 40%   IV = 3%   V = 0.25%   VI = 1.50%   VII = 28%
--
-- There is no 12% slab. The string "12%" does not appear in the notification.
--
-- effective_from records which regime a row belongs to. It is the filter the
-- application reads on, so rows that could not be re-sourced stay in the table
-- for reference without being served as though they were current:
--
--   2025-09-22  from Notification 9/2025, verified
--   NULL        pre-rationalisation, retained but NOT to be trusted
--
-- Still outstanding: the Nil-rate (exempt) and compensation-cess entries are
-- published in separate notifications that are not in 9/2025, so the 272 rows
-- carrying them are left at effective_from NULL. The 2025 council also moved
-- 33 life-saving medicines to Nil, which those rows do not reflect.

ALTER TABLE hsn_gst_rates ADD COLUMN IF NOT EXISTS effective_from DATE;

COMMENT ON COLUMN hsn_gst_rates.effective_from IS
    'Date the rate took effect. NULL means pre-2025-09-22 and unverified; '
    'queries serving the app must filter on this being set.';

-- Serving current rates means filtering on effective_from on every lookup.
CREATE INDEX IF NOT EXISTS idx_hsn_gst_rates_effective
    ON hsn_gst_rates (code, effective_from);
