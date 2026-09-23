# Policy to Action — Release Day Checklist

App Store Connect status: version 1.0 approved, Pending Developer Release. Nothing goes public until you click Release This Version.

## Pre-Flight (before you click Release)

- [x] Email infrastructure live: Resend domain policyaligned.com verified, new API key in Vercel, sender is Policy to Action <noreply@policyaligned.com>, test verification email received and link redeemed (2026-08-10)
- [ ] Apple demo account still active and signs in (never deactivate or delete it)
- [ ] One full end-to-end scenario on production: sign in, run a realistic scenario, confirm policy citations and action steps render correctly
- [ ] Study participant plan settled: self-service signup now works, or provision accounts through the admin panel
- [ ] EU DSA trader-status banner resolved: declare status, or exclude EU territories in Pricing and Availability (US-only fits the study scope)
- [ ] No experimental code sitting in production; what is live right now is what App Store users will see

## Release

- [ ] App Store Connect, Distribution tab, click Release This Version
- [ ] Allow up to 24 hours for propagation across App Store storefronts

## Day One (after it shows live)

- [ ] Search the App Store for "Policy to Action" and confirm the listing looks right
- [ ] Fresh install on a device that never had the TestFlight build; run one end-to-end scenario
- [ ] From that device: new signup with a plus-address, confirm verification email arrives and completes
- [ ] Screenshot the live listing for your dissertation records
- [ ] Skim Resend logs (deliveries), Vercel logs (errors), and Neon (connections) once during the day

## Week One Discipline and Cleanup

- [ ] Treat every `vercel --prod` as instantly user-visible; deploy from the project folder via CLI only (never the dashboard Redeploy button)
- [ ] Delete the orphan policyaligned.com zone in the jbeauscott@gmail.com Cloudflare account (the real zone lives in the Beau.scott@me.com account)
- [ ] Delete the dead Resend key policy-to-action-prod-2 (scoped to the removed send.beauhawked.com domain)
- [ ] Optional hygiene: rotate the policyaligned-prod Resend key and update Vercel
- [ ] Later, once sending reputation builds: tighten DMARC from p=none to p=quarantine
- [ ] Begin study participant onboarding

## Standing Rules

- Web changes deploy freely; only new native builds require another Apple review
- The iOS shell is pinned to policytoaction.beauhawked.com; any domain cutover to policyaligned.com is a post-release project requiring an Xcode rebuild and resubmission
