-- Settings a partner controls for each of their team members:
--   * whether the member may add doctors / retailers to the partner's lists
--   * where the member's orders go: to the partner (who accepts them with
--     their rates, like a retailer's or doctor's order) and/or to Moulins
--     directly (the old behaviour); with both on, the member picks each time
--   * doctors and retailers hidden from that member.
-- A member with no row here gets the defaults below (internal/models/
-- teamSettingsModel.go applies the same ones): can add doctors, orders go to
-- the partner, not to Moulins.

CREATE TABLE IF NOT EXISTS team_member_settings (
    member_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    can_add_doctors    BOOLEAN NOT NULL DEFAULT TRUE,
    can_add_retailers  BOOLEAN NOT NULL DEFAULT FALSE,
    order_to_partner   BOOLEAN NOT NULL DEFAULT TRUE,
    order_to_moulins   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A doctor (doctors.id) or retailer (retailers.user_id) the member must not
-- see. Kept as plain ids: removing the doctor/retailer just leaves a row that
-- matches nothing.
CREATE TABLE IF NOT EXISTS team_member_hidden (
    member_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('doctor', 'retailer')),
    target_id   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (member_id, kind, target_id)
);
