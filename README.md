# GTA Construction & Project Management Jobs

A static job dashboard for the Greater Toronto Area. A GitHub Action collects jobs once a week from permitted public job APIs, scores them against `profile.js` with transparent keyword rules, and publishes the result to GitHub Pages.

**No AI is used at runtime.** Collection, matching, scoring, filtering and keyword suggestions are all plain JavaScript rules you can read and edit.

```
Job APIs / feeds ──► GitHub Action (weekly) ──► updater/update.mjs
                                                   │  normalize → GTA filter → keyword score
                                                   │  → remove duplicates → mark closed/expired
                                                   ▼
                                                jobs.json  ──►  index.html (static, in any browser)
```

## Files

| File | What it does |
|---|---|
| `index.html` | The dashboard: filters, job list, keyword suggestions, tracker, exports |
| `profile.js` | **Your profile**: titles, skills, credentials, industries, locations, scoring points |
| `matcher.js` | The scoring and keyword rules (shared by the dashboard and the updater) |
| `jobs.json` | Job database written by the updater. The dashboard reads it |
| `jobs.js` | Same data, used only when `index.html` is opened directly from disk |
| `updater/sources.json` | Which job sources to use, search phrases, expiry settings |
| `updater/update.mjs` | The weekly collector (Node 20, no packages to install) |
| `updater/test-fixture.json` | Fake sample jobs for testing the updater offline |
| `.github/workflows/weekly-update.yml` | Weekly schedule plus deployment to GitHub Pages |

---

## Setup, about 20 minutes, one time only

### 1. Create the GitHub repository
1. Sign in at github.com (a free account is fine).
2. Select **New repository**. Name it, for example, `gta-jobs`.
3. Choose **Public**. GitHub Pages is free for public repositories. The site shows only job data, and nothing personal is in these files.
4. Select **Create repository**.

### 2. Upload the files
1. Unzip `gta-jobs.zip` on your computer.
2. In the new repository, select **uploading an existing file**.
3. Drag in **the contents** of the unzipped folder, not the folder itself. Include the hidden `.github` folder:
   - **Mac:** press `Cmd + Shift + .` in Finder to show hidden folders.
   - **Windows:** in File Explorer, choose View → Show → Hidden items.
4. Select **Commit changes**.
5. Check that `.github/workflows/weekly-update.yml` is listed in the repository. If the drag-and-drop skipped it, create it manually: select **Add file → Create new file**, type `.github/workflows/weekly-update.yml` as the name, and paste the file's contents.

### 3. Add the free API keys
The two main sources need free keys. Neither needs a credit card.

| Source | Where to sign up | GitHub secret names |
|---|---|---|
| Adzuna | developer.adzuna.com → Register | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Jooble | jooble.org/api/about → request a key | `JOOBLE_API_KEY` |

To add each secret, go to your repository → **Settings → Secrets and variables → Actions → New repository secret**. Enter the exact name from the table and paste the key. Secrets are encrypted and never appear in the website or `jobs.json`.

A source without its key is marked "Skipped" and the other sources still run.

### 4. Enable GitHub Actions
1. Open the **Actions** tab.
2. If GitHub asks, select **I understand my workflows, go ahead and enable them**.
3. Go to **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and select **Save**. This lets the workflow commit the new `jobs.json`.

### 5. Enable GitHub Pages
1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. Do not choose "Deploy from a branch".
3. Your site address appears there once the first deployment finishes. It looks like `https://YOUR-USERNAME.github.io/gta-jobs/`.

### 6. Run the first update
1. Go to **Actions → Weekly job update → Run workflow → Run workflow**.
2. Wait about 3–5 minutes for both jobs, **update** and **deploy**, to show a green check.
3. Open your site. After this, it updates every Monday on its own.

---

## Everyday changes

### Change your profile keywords
Edit `profile.js` on GitHub (open the file, then select the pencil icon), then commit.

- **Add a job title:** add a line to `targetTitles.primary` (+40 points) or `targetTitles.related` (+25 points), for example `'program controls manager|manager, program controls',`.
- **Add a skill:** add a line to `skills`. Use `|` between synonyms, for example `'procore|procore certified',`.
- **Exclude unrelated jobs:** add words to `excludeTitleWords`.
- **Change the points or match thresholds:** edit `scoring` and `thresholds` at the bottom.
- **Add a location:** add an entry to `locations`, with specific places above region-wide entries.

The dashboard re-scores every job in the browser as soon as the site redeploys, which takes about a minute. The next weekly run also collects jobs using the new rules.

### Configure job sources
Everything is in `updater/sources.json`:

- `enabled: true/false` turns a source on or off.
- `queries` are the search phrases sent to Adzuna and Jooble. Add or remove lines.
- `where`, `distanceKm` and `radiusKm` set the search area. The default is 70–80 km around Toronto, which covers Oshawa to Burlington. Every job is then checked against your `locations` list.
- `settings` controls request delay, when closed jobs become expired (`recentlyClosedDays`), when they are deleted (`purgeAfterDays`) and the maximum posting age.

### Add an employer's own career site
Most large employers use an applicant-tracking system with a public job feed. Open the employer's careers page and check the address of a job listing:

| If the job URL contains | Use `type` | Fill in |
|---|---|---|
| `myworkdayjobs.com` | `workday` | From `https://acme.wd3.myworkdayjobs.com/en-US/AcmeCareers`: `host` = `acme.wd3.myworkdayjobs.com`, `tenant` = `acme`, `site` = `AcmeCareers` |
| `boards.greenhouse.io/acme` | `greenhouse` | `board` = `acme` |
| `jobs.lever.co/acme` | `lever` | `site` = `acme` |
| `jobs.smartrecruiters.com/Acme` | `smartrecruiters` | `companyIdentifier` = `Acme` |
| An RSS icon or feed link | `rss` | `url` = the feed address |
| Anything else | `jsonld` | `urls` = individual job page addresses |

Copy the matching example block in `sources.json`, give it a unique `id`, fill in the values and set `enabled: true`. Employer sources use `priority: 1`, so their listing becomes the main one when the same job also appears on Adzuna or Jooble.

Before enabling a source, look over the site's terms of use. The updater checks robots.txt and skips any page it disallows, but it cannot read the terms.

### Remove a source
Set `"enabled": false`, or delete its block. Jobs from a removed source are marked Recently closed on the next run, then expire and are deleted.

### Change the update frequency
Edit the `cron` line in `.github/workflows/weekly-update.yml`. Times are in UTC.

| Frequency | cron |
|---|---|
| Weekly, Monday 10:00 UTC (default) | `0 10 * * 1` |
| Twice a week, Monday and Thursday | `0 10 * * 1,4` |
| Every day | `0 10 * * *` |
| Every two weeks | not possible with cron alone; keep weekly |

Also update `nextRunDate()` near the end of `updater/update.mjs` if you change the day, so that "Next scheduled update" stays accurate, and update `settings.updateIntervalDays` in `sources.json`.

### Test the updater
- **On GitHub:** go to **Actions → Weekly job update → Run workflow**, tick **Dry run**, and run it. Open the finished run to read the log. It lists every source, how many jobs it fetched and kept, and any errors, but commits nothing.
- **On your computer (optional):** requires Node 20.
  ```
  node updater/update.mjs --test      # offline, fake sample jobs, writes updater/test-output.json
  node updater/update.mjs --dry-run   # real sources, writes nothing (set the key variables first)
  node updater/update.mjs --only=adzuna
  ```

---

## How it behaves

- **Matching:** see *How it works* on the site. Open any job to see a line-by-line breakdown of its score.
- **Keyword suggestions:** opening a job shows every recognised keyword in the posting. Each is marked as already on your profile or not, and repeated phrases and credential gaps (P.Eng, Gold Seal and so on) are listed too. Some sources only provide an excerpt, so open the full posting to find more.
- **Duplicates:** listings with the same employer, title and city, or the same URL or posting ID, are merged. Other copies appear under "Also found on".
- **Closed and expired jobs:** a job not returned on the next run becomes *Recently closed*. After 14 days it becomes *Expired*, and after 45 days it is deleted. If a source fails, its jobs are left unchanged rather than closed.
- **Failures:** one broken source never stops the others. The *Sources* tab shows the result of each source on the last run. If every source fails, the previous `jobs.json` is kept.
- **Your tracking:** Saved, Applied, Interview, Follow-up, Rejected and your notes are kept in your browser's localStorage. Export a backup from *My applications* now and then, because clearing browser data erases them.

## Hosting elsewhere
The site is five static files: `index.html`, `profile.js`, `matcher.js`, `jobs.json` and `jobs.js`.

- **Netlify or Cloudflare Pages:** connect the GitHub repository with no build command and `/` as the publish directory. The GitHub Action still commits new data weekly, and those services redeploy on each commit. You can then delete the `deploy` job from the workflow.
- **Any web host:** upload the five files.
- **Open from disk:** double-click `index.html`. It reads `jobs.js` when the browser blocks reading `jobs.json` directly.

## What it deliberately does not do
It does not scrape LinkedIn, Indeed or Glassdoor, log in to any site, solve CAPTCHAs or ignore robots.txt. The *Sources & searches* tab has one-tap buttons that open live searches on those sites instead. Adzuna and Jooble already include many postings from those boards and from employer sites.

## Keeping it running
GitHub pauses scheduled workflows in a repository with no activity for 60 days. The weekly commit normally counts as activity. If GitHub emails you that the workflow was disabled, open **Actions** and select **Enable workflow**.

## Adding features later
The structure leaves room for these without changing the core:

- **New-job, salary or employer alerts:** add a step to the workflow after the update that reads `jobs.json`, filters for `status: "new"` and a score or salary threshold, and sends the result through an email or Telegram action. Keep the tokens in GitHub secrets.
- **Employer watchlists:** these already exist in `profile.employers`; filtering or alerting on them is a small addition.
- **Interview, resume-version and cover-letter tracking:** the tracker stores a free-form object per job in localStorage, so new fields such as `resumeVersion` or `interviewDate` can be added to `setTrack()` without migrating data.
- **Weekly application reports:** can be generated from the tracker's `updatedAt` and `status` values.
