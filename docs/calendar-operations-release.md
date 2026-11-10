# Calendar operations release

## Scope and preflight

Release the Calendar visibility application changes from the authorization branch and the effective-capacity reader change together. The local reconstruction package has no runtime dependency and stays out of the production change set. Before release, confirm the current production app revision, intended Git diff, the Commercial apps project ref `lwhrhnfnuutpisfpkadb`, and the three pending migration versions. Save the effective `calendar_linked_fulfillment_notes(uuid[])` definition, owner and ACL for rollback and record the previous Vercel deployment. No database rows need to be exported. Verify the installed business-access helper, both Staff Away helpers, and the expected daily capacity row type.

## Apply after explicit approval

1. Apply only these migrations, in this order, through the existing tracked Supabase migration process. Review the pending list first. Stop if it includes unrelated migrations.
   - `20261102120000_calendar_view_linked_fulfillment_notes.sql`
   - `20261102130000_calendar_shared_staff_away_read.sql`
   - `20261110000000_resolve_bridge_capacity_from_staff.sql`
2. Confirm the RPC signatures and effective grants after the Data API sees them. Calendar notes and Staff Away are callable by authenticated users and gated inside their functions. Effective daily capacity is callable by the trusted server role. Run a trusted capacity read for November 18 and confirm 17 hours. Inspect the effective grants for anonymous access.
3. Deploy the approved DoorGo revision using the existing project. Reload Calendar and Production, then run the checks below before closing the release.

## Manual checks

- Confirm November 18–20 each show 17 hours before deductions. Confirm November 11 stays closed and November 12 shows 5.5 hours if the saved deductions have not changed. Compare Calendar and Production for the same date.
- With Calendar View and Jobs No Access, open a Delivery/Pickup linked to a known Job note. Repeat with Calendar Use. Confirm ordinary Calendar notes still display and Jobs remains inaccessible to the Jobs No Access account.
- Verify company-wide Staff Away with both Calendar permission levels, including a refresh and a date-range extension. A foreign-location entry stays read-only. Confirm a Calendar Use account retains its existing in-scope edit controls.
- Confirm Calendar View cannot edit and a signed-out or Calendar No Access account cannot load the Calendar projections.

## Rollback

If the app rollout fails, redeploy the previous Vercel revision first. The two newly added RPCs are additive. If a SQL correction needs reversal, use a reviewed forward rollback migration after the previous app is active. Restore the captured linked-notes definition, owner and grants. Revoke execution on or drop the two additive RPCs by exact signature once no deployed caller needs them. For an access-control incident, revoke affected execution immediately. Leave the capacity ledger and all operational rows in place.
