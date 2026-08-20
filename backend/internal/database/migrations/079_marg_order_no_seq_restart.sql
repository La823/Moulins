-- Marg's server already had test OrderNo values up through 31 in use from
-- prior manual/webtool testing (outside this app) — restart clear of that.
ALTER SEQUENCE marg_order_no_seq RESTART WITH 35;
