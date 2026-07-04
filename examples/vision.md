# Vision — Tally

Tally is a tiny link-counting service for a solo newsletter author. She pastes links
into her newsletter and wants to know, per link, how many readers clicked — nothing
more. Every existing analytics tool she tried is a dashboard-shaped kitchen sink; she
wants a service so small she can read all of its code in ten minutes and trust it.

What matters:

- Creating a tracked link takes one API call and returns a short id.
- Visiting the short link redirects to the destination and counts the click.
- Asking for a link's stats returns the count. That is the entire product.
- Failures are loud and clear — a bad destination URL is rejected at creation, an
  unknown short id says so plainly.

What explicitly does not matter for v1: accounts, auth, dashboards, geo/device
breakdowns, retention policies, or scale beyond one small newsletter.
