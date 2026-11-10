-- users.username is a display name, not a login (everyone logs in by phone
-- number, and nothing looks a user up by username). It was UNIQUE since
-- 001, so a partner could not add a team member named like anyone else on
-- the platform ("Rahul") — the insert failed and the app only said "Could
-- not create team member". Names may repeat; phone numbers stay unique.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
