---
name: adsense-revenue
description: >
  Diagnose and fix zero-revenue AdSense sites (crypto and utility/tool sites)
  and grow them to meaningful click volume. Use when a site is not being found
  or indexed by Google, when AdSense shows 0 clicks / $0 earnings, when ads are
  not serving, or when planning content and traffic growth for ad-monetized
  sites. Covers Search Console setup, indexing fixes, AdSense approval and
  policy compliance (including crypto-content rules), ad placement, and
  legitimate traffic growth. Triggers: "adsense", "0 clicks", "not indexed",
  "site not showing on Google", "monetize my site", "ad revenue".
---

# AdSense Revenue: Indexing → Traffic → Clicks

## Core mental model

AdSense revenue is the END of a funnel. A site with 0 clicks after months is
almost never "an AdSense problem" — it is a failure at one of four stages.
**Always diagnose the funnel in order and fix the EARLIEST broken stage first.
Work on nothing downstream until the stage above it is verified working.**

```
Stage 1: INDEXED    — Google knows the pages exist
Stage 2: TRAFFIC    — real humans visit the pages
Stage 3: SERVING    — approved AdSense ads actually render on the pages
Stage 4: CLICKS     — enough visitors that a normal ~0.5–2% CTR produces clicks
```

Rule of thumb: 0 clicks ≈ 0 traffic. 1,000 clicks requires very roughly
50,000–200,000 pageviews. "Thousands of clicks across all sites" is a
**traffic** goal, not an ad-tweaking goal. Say this to the user plainly and
set milestones (see "Realistic milestones" below).

## Non-negotiable policy rules (read before anything else)

Violating these gets the AdSense account permanently banned, losing ALL sites
at once. Never suggest, implement, or tolerate:

- Clicking your own ads, or asking/incentivizing anyone to click ads
  ("support the site by clicking") — in text, popups, or placement tricks.
- Buying traffic, bot traffic, traffic exchanges, or paid-to-click services.
- Placing ads so they overlap content, sit under misleading labels
  ("Download", "Continue"), or trigger accidental clicks.
- Auto-refreshing pages/ads to inflate impressions.
- Deceptive crypto content: fake giveaways, guaranteed returns, pump signals,
  impersonating exchanges/wallets. Crypto content is allowed by AdSense, but
  it is high-scrutiny — one deceptive page can flag the whole account.

If the user asks for shortcuts that touch any of the above, refuse that
specific tactic, explain the account-level ban risk, and redirect to the
legitimate playbook below.

## Stage 1 — Diagnose and fix indexing

This is the user's stated problem ("sites not being found and indexed"), so
start here for every site.

### 1a. Quick diagnosis (run these checks per site)

Run each check and record the result before changing anything:

1. **Is it indexed at all?** Search Google for `site:example.com`.
   Zero results = not indexed. A few results = partially indexed.
2. **Is indexing blocked?** Check for the three classic self-inflicted blocks:
   ```bash
   # noindex in HTML head
   curl -sL https://example.com | grep -i 'noindex'
   # noindex sent as an HTTP header
   curl -sIL https://example.com | grep -i 'x-robots-tag'
   # crawling blocked
   curl -s https://example.com/robots.txt
   ```
   In robots.txt, look for `Disallow: /` under `User-agent: *` or
   `User-agent: Googlebot`. Also verify the site returns HTTP 200 (not 4xx/5xx,
   not an endless redirect chain) and that www/non-www and http/https all
   resolve to ONE canonical URL.
3. **Does a sitemap exist and is it valid?**
   ```bash
   curl -s https://example.com/sitemap.xml | head -50
   ```
   Every URL in it must be 200, canonical, and not noindexed.
4. **Is content visible without JavaScript?**
   ```bash
   curl -s https://example.com | grep -o '<body.*' | head -c 2000
   ```
   If the body is an empty `<div id="root">` (client-side-rendered SPA),
   Google may index it late or poorly. Utility/tool sites built as SPAs are a
   very common cause of "site exists but never ranks." Fix: prerender, SSR/SSG,
   or at minimum put real descriptive HTML text (title, h1, explanation of the
   tool, FAQ) in the initial HTML payload.
5. **Is the content indexable-quality?** Google increasingly refuses to index
   thin pages ("Crawled – currently not indexed" in Search Console). A tool
   page with just a widget and no text, or a crypto page with rehashed generic
   info, often simply never gets indexed. This is the most common cause when
   the technical checks all pass.

### 1b. Google Search Console — mandatory, per site

If the user has not set up Google Search Console (GSC) for every site, nothing
else matters until they do. Walk them through:

1. Add each site as a **Domain property** at search.google.com/search-console
   (DNS TXT verification), or URL-prefix property if DNS access is awkward.
2. Submit the sitemap under Indexing → Sitemaps.
3. Use **URL Inspection** on the homepage and 3–5 key pages → "Request
   indexing" for each. This is the single fastest legitimate way to get a new
   site crawled.
4. Read **Indexing → Pages** report. The reason listed there ("Discovered –
   currently not indexed", "Crawled – currently not indexed", "Excluded by
   noindex", "Redirect error", etc.) tells you exactly which fix applies:
   - *Excluded by noindex / blocked by robots.txt* → technical fix (1a.2).
   - *Discovered – currently not indexed* → Google hasn't bothered crawling:
     improve internal linking, get any external link, request indexing.
   - *Crawled – currently not indexed* → quality problem: the page is thin or
     duplicative. Rewrite/expand it (see Stage 2).
5. Also register with **Bing Webmaster Tools** (can import from GSC in one
   click) and submit via **IndexNow** — Bing/DuckDuckGo traffic is easier to
   get early and monetizes the same:
   ```bash
   curl "https://www.bing.com/indexnow?url=https://example.com/&key=YOUR_KEY"
   ```

### 1c. On-page fundamentals every page needs

- Unique `<title>` (~50–60 chars, contains the target keyword) and unique
  `<meta name="description">`.
- One `<h1>` matching the page intent; logical h2/h3 structure.
- `<link rel="canonical">` self-referencing on every page.
- Internal links: every page reachable within 2–3 clicks of the homepage; no
  orphan pages. Tool sites: link related tools to each other in a visible
  "Related tools" block.
- Structured data where honest: `FAQPage`, `HowTo`, `SoftwareApplication`
  (for tools), `Article` (for crypto content). Validate with
  https://search.google.com/test/rich-results.
- Fast enough: run PageSpeed Insights; fix anything scoring < ~50 mobile.
- HTTPS everywhere, mobile-responsive.

### 1d. New-site reality: the discovery problem

A brand-new domain with zero external links can sit unindexed for months —
this matches the user's "since April" timeline. Google finds sites via links.
Fastest legitimate discovery boosts:

- Request indexing in GSC (above) — do this first.
- Get a handful of real links: relevant directory listings, a Product Hunt /
  AlternativeTo / free-tool-directory listing for utility sites, a GitHub
  README linking to the site, profile links, one or two genuinely useful
  posts in relevant communities that link the tool.
- Cross-link the user's own sites in the footer (a few related sites is fine;
  don't build a 20-site link wheel).
- Publish consistently — sites that add content get crawled more often.

Do NOT buy backlinks or use link farms; that trades a slow start for a
penalty.

## Stage 2 — Build traffic (this is where the clicks actually come from)

Once pages are indexed, revenue scales with visitors. The strategy differs by
site type:

### Utility/tool sites

- **Each tool page must target a search query someone actually types**
  ("json to csv converter online", "percentage change calculator"). Name the
  page, title, h1, and URL after that query.
- Add 300–800 words of genuinely useful supporting text under the tool:
  what it does, how to use it, edge cases, FAQ. A bare widget is un-indexable
  and un-rankable; this is the #1 fix for tool sites.
- Build MORE long-tail tool pages rather than fighting for "calculator".
  Find variants with real volume and weak competition (search the query;
  if the first page is all Reddit threads and thin pages, it's winnable).
- Tools spread by being shared: add copy-link/share buttons, make results
  linkable (URL-encoded state), submit to tool directories.

### Crypto sites

- Crypto is YMYL ("Your Money or Your Life") — Google holds it to a HIGHER
  quality bar. Generic "what is Bitcoin" articles will never rank. Winnable
  angles: very specific long-tail how-tos ("how to bridge X from chain A to
  chain B"), data/tool pages (fee calculators, staking-yield trackers,
  gas trackers), and timely niche coverage.
- Add real E-E-A-T signals: an author name and bio, an about page, cited
  sources, dated and updated timestamps, a visible disclaimer that content is
  not financial advice.
- Never publish price predictions framed as certainty, "guaranteed" returns,
  or affiliate-driven "best exchange" pages with no real comparison work —
  these both kill rankings and endanger the AdSense account.

### Cadence and distribution (both site types)

- Publish/expand 2–4 quality pages per week per site rather than launching
  50 thin pages at once. Update old pages; freshness helps.
- Distribute beyond Google while SEO matures: relevant subreddits and Discord
  communities (share the tool when it answers someone's actual question — not
  spam), X/Twitter for crypto content, a small email list, YouTube
  Shorts/TikTok demos for tools. Early direct traffic also accelerates
  indexing.
- Concentrate effort: if the user has many sites, pick the 1–2 with the best
  traction signals and pour effort there. Ten sites at 100 visits/month each
  will always lose to one site at 10,000.

## Stage 3 — Make sure ads can actually serve

Even with traffic, common misconfigurations produce $0. Verify all of these:

1. **Approval status**: In the AdSense dashboard → Sites, EVERY site must show
   "Ready" (approved). Each site must be added and individually approved —
   approval of one site does not cover the others. If a site shows "Getting
   ready" for weeks or was rejected, fix content quality first (thin content
   and "low value content" are the top rejection reasons; crypto sites get
   extra scrutiny).
2. **ads.txt** at the site root, containing the user's real publisher ID:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
   Verify: `curl -s https://example.com/ads.txt`. A missing/wrong ads.txt
   silently reduces or stops ad serving.
3. **Ad code actually on the pages**: view source and confirm the AdSense
   script (`adsbygoogle.js` with the right `ca-pub-` ID) is in the HTML, or
   Auto ads is enabled for that exact domain in the dashboard.
4. **Consent Management Platform (CMP)**: required for EEA/UK/Swiss traffic —
   without a Google-certified CMP configured (AdSense → Privacy & messaging),
   ads won't serve to those visitors at all.
5. **Serving test**: load the site in an incognito window with no ad blocker.
   Blank ad slots on a low-traffic new site can be normal for a short while,
   but persistent blanks mean a config/policy problem — check AdSense →
   Policy center for site-level issues.
6. **Placement basics** (once serving): one ad above the fold but below the
   h1, one mid-content, one at content end. For tool sites: beside or below
   the tool output, never where it can be mistaken for a tool button. Don't
   exceed roughly one ad per screenful — more hurts UX, rankings, and RPM.

## Stage 4 — Realistic milestones and the weekly loop

Set expectations honestly. Typical AdSense CTR is 0.5–2% of pageviews; crypto
RPMs can be good ($10–30+) but utility-tool RPMs are often low ($2–10).
"Thousands of clicks" means roughly 100k+ pageviews — a 6–18 month outcome for
new sites, not a settings change.

Milestones to communicate:
1. **Week 1–2**: all sites verified in GSC, sitemaps submitted, technical
   blocks removed, key pages "Request indexing" done, ads.txt + CMP verified.
2. **Month 1–2**: majority of pages indexed (GSC Pages report), first
   impressions appearing in GSC Performance report.
3. **Month 2–4**: first consistent daily clicks from search; first AdSense
   clicks (any number > 0 confirms the funnel works end-to-end).
4. **Month 4–12**: scale what ranks — double down on the pages/queries
   showing impressions in GSC, add sibling pages, improve titles for CTR.

Weekly operating loop (automatable checklist for the agent):
- GSC: indexed-page count trend, new "not indexed" reasons, top queries by
  impressions, pages ranking 5–20 (quick-win: improve those pages/titles).
- AdSense: page RPM, impressions, Policy center warnings.
- Publish/upgrade the planned 2–4 pages per site.
- Re-run the Stage-1 curl checks after any deploy (a deploy that ships a
  stray `noindex` or breaks robots.txt is a classic silent killer).

## Diagnosis quick-reference

| Symptom | Most likely stage | First action |
|---|---|---|
| `site:` search shows nothing | 1 | GSC setup + check noindex/robots + request indexing |
| Indexed but ~0 GSC impressions | 2 | Pages don't match real queries; retarget + expand content |
| Impressions but no visits | 2 | Titles/descriptions weak, or ranking page 3+ — improve pages |
| Traffic but ads blank | 3 | Approval per-site, ads.txt, CMP, Policy center |
| Traffic + ads render, ~0 clicks | 4 | Placement/viewability; also verify traffic is real humans |
| Everything "works" but earnings tiny | 4 | It's a volume problem — go back to Stage 2 and scale |
