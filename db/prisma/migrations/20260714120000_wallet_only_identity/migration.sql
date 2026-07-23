-- Wallet-only identity (W4). Auth becomes SIWE-only: the lowercased wallet
-- address IS the account identity. There are only test accounts, so this is a
-- reset, not a data migration — drop email/password and make walletAddress the
-- required unique key.

-- Reset: clears accounts (and, via ON DELETE CASCADE, their characters, ledger
-- events, manifests, loftpods and mutes). Test data only.
DELETE FROM "Account";

-- Drop the legacy email + password columns (email's unique index drops with it).
ALTER TABLE "Account" DROP COLUMN "email";
ALTER TABLE "Account" DROP COLUMN "passwordHash";

-- The wallet is now required (its unique index already exists from the nullable
-- @unique). Every future account must present a wallet.
ALTER TABLE "Account" ALTER COLUMN "walletAddress" SET NOT NULL;
