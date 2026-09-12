-- Adds a MoMo Pay merchant code so merchants can register where their
-- share of each payment should be sent (used for automatic income-split
-- payouts once configured with UmunotaPay).
alter table merchant_profiles
add column momo_pay_code text;
