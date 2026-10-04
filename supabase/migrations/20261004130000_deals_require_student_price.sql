-- Every deal has a price the student pays (founder decision 2026-10-04:
-- a deal does not have to be a discount, but it must have a price).
--
-- Before: a deal could be saved with no price at all (the AI generator page
-- did not check). "30% off all pizzas" had no price: students saw "Order now"
-- and create-order refused at checkout ("This deal does not have a valid
-- price").
--
-- Rule (checked by the database for every insert and update):
--   * fixed_price ("bundle"): a bundle price above 0;
--   * fixed_amount ("save X RWF"): a price above 0 and a saving between
--     0 and the price;
--   * free_shipping: no price needed (cannot be ordered yet);
--   * every other type (percentage, group_buy, bogo, tiered): a price above 0;
--   * discount_percent, when set, is between 0 and 100 (0 or empty = no
--     discount; the app then shows only the price).

-- The one deal without a price in production. Founder, 2026-10-04: "8000 RWF
-- is what students pay". No discount is recorded, so students see 8000 RWF.
update public.deals
   set price = 8000
 where id = '60eb628b-ab9e-4db6-b965-e875d0a99799'
   and price is null;

alter table public.deals drop constraint if exists deals_have_student_price;
alter table public.deals
  add constraint deals_have_student_price check (
    case offer_type
      when 'fixed_price' then coalesce(final_price, discount_value, 0) > 0
      when 'free_shipping' then true
      when 'fixed_amount' then coalesce(price, 0) > 0
                           and coalesce(discount_value, 0) > 0
                           and discount_value < price
      else coalesce(price, 0) > 0
    end
    and (discount_percent is null or discount_percent between 0 and 100)
  );
