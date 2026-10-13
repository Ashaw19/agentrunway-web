-- 00177_flight_plan_default_copy_unsourced_figures.sql
--
-- Default Flight Plans: take five unsourced figures out of the copy already
-- seeded into users' accounts.
--
-- lib/flight-plan-defaults.ts seeds 20 default campaigns per user, once
-- (POST /api/flight-plans/seed-defaults skips a system_key the user already
-- has). Three descriptions and two step templates stated a figure as fact
-- with no source: "Most agents lose 90% of open house leads within 48
-- hours", "20–30% of 'dead' leads convert within 12 months", "worth 5x the
-- effort of a typical buyer lead", "Most experts say 3–6 months before
-- buying" and "most agents stop after 1 call". The defaults file is reworded
-- in the same change; this brings the rows seeded before it into line.
--
-- Only text that still equals the old default is replaced. A description or
-- template the user has edited is left alone. Data only: no schema change.

UPDATE flight_plan_steps AS s
   SET template = $new$Pre-approval timing guide — 'When to start the mortgage conversation.' Introduce your preferred broker now.$new$
  FROM flight_plans AS p
 WHERE s.flight_plan_id = p.id
   AND p.system_key = 'long_term_buyer_nurture'
   AND s.template = $old$Pre-approval timing guide — 'When to start the mortgage conversation.' Most experts say 3–6 months before buying. Introduce your preferred broker now.$old$;

UPDATE flight_plans
   SET description = $new$Captures the warm in-person connection from open house sign-ins, starting with a text and a call the same day.$new$
 WHERE system_key = 'open_house_follow_up'
   AND description = $old$Captures the warm in-person connection from open house sign-ins. Most agents lose 90% of open house leads within 48 hours — this sequence prevents that.$old$;

UPDATE flight_plans
   SET description = $new$Recovers leads who went cold without burning bridges. A low-pressure check-in leaves the door open for a lead whose timing has changed.$new$
 WHERE system_key = 're_engagement_ghosted'
   AND description = $old$Recovers leads who went cold without burning bridges. 20–30% of 'dead' leads convert within 12 months with the right low-pressure sequence.$old$;

UPDATE flight_plans
   SET description = $new$Serves real estate investors with ROI-focused content. An investor may buy more than once, so the relationship can outlast a single deal.$new$
 WHERE system_key = 'investor_lead_nurture'
   AND description = $old$Serves real estate investors with ROI-focused content. Investors transact repeatedly and refer heavily — worth 5x the effort of a typical buyer lead.$old$;

UPDATE flight_plan_steps AS s
   SET template = $new$📞 Second attempt — one unanswered call is not a no. Persistence signals you actually want their business. Keep it brief and confident.$new$
  FROM flight_plans AS p
 WHERE s.flight_plan_id = p.id
   AND p.system_key = 'expired_listing_prospecting'
   AND s.template = $old$📞 Second attempt — most agents stop after 1 call. Don't. Persistence signals you actually want their business. Keep it brief and confident.$old$;
