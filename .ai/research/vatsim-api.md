# VATSIM API v2 — controlling history

**Verified on 2026-09-21** against live ZID CIDs.

Base: `https://api.vatsim.net/v2`. **No API key**, same as the VATUSA roster —
which is why the certification work needs no new secrets.

## Why this exists

DEV-115 needs to know whether an arriving controller "has been active as a VATSIM
controller in the last 6 months". Nothing we already had answers that:

| Source                          | Why not                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| Identity `SessionContext`       | Only `activeSession` — are they online **right now**. No history    |
| VATUSA roster `lastactivity`    | "Last seen in the VATUSA system", which is not "controlled"         |
| VATUSA roster payload generally | Carries ratings and dates, but **no controlling hours of any kind** |

Identity's typed RPC surface is `getSessionContext(token)` and nothing else, so
it cannot answer questions about a controller who is not the current user at all.

## The two endpoints we use

### `GET /v2/members/{cid}/atc?limit=1` — the currency check

```json
{
	"items": [
		{
			"connection_id": {
				"id": 121426528,
				"vatsim_id": "1279609",
				"type": 2,
				"rating": 5,
				"callsign": "IND_83_CTR",
				"start": "2026-07-21T01:20:35Z",
				"end": "2026-07-21T02:56:23Z",
				"server": "VIRTUALNAS"
			},
			"aircrafttracked": 22,
			"handoffsinitiated": 22
		}
	],
	"count": 738
}
```

**Newest first**, so one item is the whole answer. `end` is null while a session
is still open.

**`limit` works; `per_page` and `page_size` are silently ignored.** That is worth
knowing: the default page is 100 items and about 42 KB, while `?limit=1` is 450
bytes. Two of the three obvious parameter names do nothing and return the full
page, which looks like the parameter was honoured until you check the size.

### `GET /v2/members/{cid}/stats` — hours per rating

```json
{
	"id": 1279609,
	"atc": 1002.28,
	"pilot": 447.74,
	"s1": 53.52,
	"s2": 80.98,
	"s3": 96.47,
	"c1": 771.31,
	"c2": 0.0,
	"c3": 0.0,
	"i1": 0.0,
	"i2": 0.0,
	"i3": 0.0,
	"sup": 0.0,
	"adm": 0.0
}
```

This is what makes a **supervisor's earned controller rating recoverable**. SUP
and ADM are not controller ratings — a promoted supervisor keeps SUP as their
visible rating whatever they held before — so the rating field cannot say what
they worked. The highest tier with meaningful hours can.

Note the shape: unearned tiers are `0.0`, not absent, so "highest non-zero tier"
is the right read rather than "highest present key".

## Other endpoints, for reference

| Endpoint                        | Returns                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `/v2/members/{cid}`             | `rating`, `pilotrating`, `reg_date`, `region_id`, `division_id`, `lastratingchange` |
| `/v2/members/{cid}/history`     | All connections, pilot and ATC. `type` 1 is pilot, 2 is ATC                         |
| `/v2/members/{cid}/connections` | **404.** Not an endpoint, despite being the obvious guess                           |

## How we call it

`src/lib/server/vatsim.ts`. Both functions **return rather than throw** on a bad
response, and the distinction matters:

- `fetchLastAtcSessionEnd` returns `null` for "never controlled" and `undefined`
  for "the lookup failed". Collapsing those would record a permanent "no
  certification" decision on the strength of a timeout.
- A failed lookup leaves `roster_members.certificationsCheckedAt` unset, so the
  next cron run tries again.

**Calls are rare by design.** `needsVatsimLookup()` settles two cases without any
HTTP — the controller already holds a certification, or their rating carries
none — which on the live roster is 153 of 157 members. The first full pass made
**4 requests**, not 157.

## Rate limits

Not documented on these endpoints, and not hit in practice: normal operation is
zero or one arrival per 15-minute run. The per-run lookup cap in
`src/lib/server/certifications/arrival.ts` exists for the Worker subrequest
budget rather than for VATSIM's sake, but it bounds both.

## Source

Probed directly with `curl` against real ZID CIDs taken from the VATUSA roster.
There is no prior art in the org — `community-website` has clients for VATUSA,
vNAS, VATSIM Connect and the events API, but nothing for member history.
