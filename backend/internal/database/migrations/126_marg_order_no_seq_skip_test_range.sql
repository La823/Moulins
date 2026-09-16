-- marg_order_no_seq (078/079) climbed into a range of OrderNo values Marg's
-- server had already seen from testing done outside this app (the api
-- test/ Python/webtool scripts, well before this Go integration existed) —
-- confirmed by a live collision at value 125, which Marg mapped to an old
-- order (Marg Order No. 70257). 35 wasn't far enough clear of that. Jump
-- to a value safely past anything that old testing could plausibly have
-- used.
ALTER SEQUENCE marg_order_no_seq RESTART WITH 100000;
