# Ralulu Taiwan Convenience Store Daily Sync

## What this does

Fetches Taiwan **7-ELEVEN** and **FamilyMart** store directories, deduplicates by `chain + store_id`, validates the results, writes atomic JSON snapshots, and optionally uploads to a Laravel endpoint. No ECPay account, payments, or shipping service needed.

**Source methods previously tested in Google Colab**: 7-ELEVEN nationwide 7,356 unique stores using POST/XML; FamilyMart nationwide 4,545 unique stores using GET/JSONP with zero failed regions. This combined production package has **not yet been executed end-to-end against live websites or a Ralulu server**. Counts are historical reference values, not guarantees.

## Technical requirements for Widy

- Python **3.11+** (3.11 recommended)
- Dependency: `requests>=2.31,<3` (Python standard library otherwise)
- Output: UTF-8 **JSON**, one `output/7eleven_latest.json`, one `output/familymart_latest.json`, plus `output/last_run.json` and `output/sync.log`
- Frequency: **daily at 03:00 Asia/Taipei**; exits when done
- Maintenance: Nick's side maintains scraper/source-site logic; Widy maintains server scheduler, Ralulu import endpoint, and admin dashboard

## Ubuntu installation (run once)

```bash
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv
sudo mkdir -p /opt/ralulu-store-sync
# Upload and extract this project's files into /opt/ralulu-store-sync
cd /opt/ralulu-store-sync
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
# Set RALULU_SYNC_URL and RALULU_SYNC_TOKEN in .env AFTER Laravel import endpoint exists
./run.sh --no-upload  # initial validation; does not modify Ralulu DB
```

`run.sh` forwards any CLI arguments to Python (e.g. `./run.sh --chain familymart --no-upload`). Inspect `output/last_run.json` for both `success` statuses and verify store counts before enabling upload.

## Daily scheduler (03:00 Taiwan time)

Use the system crontab (`crontab -e`) for the account owning the files:

```cron
CRON_TZ=Asia/Taipei
0 3 * * * cd /opt/ralulu-store-sync && /usr/bin/flock -n /tmp/ralulu-store-sync.lock ./run.sh >> /opt/ralulu-store-sync/output/cron.log 2>&1
```

**Important:** Some cron implementations interpret `CRON_TZ` for scheduling, others do not. Widy must verify the actual server timezone and first scheduled execution time, or use a `systemd` timer with `Timezone=Asia/Taipei`. Do not activate the cron job before validating the first manual run.

## Source requests

### 7-ELEVEN

`POST https://emap.pcsc.com.tw/EMapSDK.aspx`, form fields:

```json
{"commandid":"SearchStore","city":"台北市","town":"中正區","roadname":"","ID":"","StoreName":"","SpecialStore_Kind":"","leftMenuChecked":"","address":""}
```

Response: XML `<GeoPosition>` nodes with `POIID`, `POIName`, `Address`, optionally `Telno`, `X`, `Y`. `districts.json` contains the **exact 22-city / 368-district map from the user's successful original Colab notebook**. The original script counted 7,356 nationwide.

### FamilyMart

`GET https://api.map.com.tw/net/familyShop.aspx`

- Towns: `searchType=ShowTownList&type=&city=<city>&fun=storeTownList&key=<key>`
- Stores: `searchType=ShopList&type=&city=<city>&area=<town>&road=&fun=showStoreList&key=<key>`
- Header `Referer: https://www.family.com.tw/Marketing/StoreMap/`
- JSONP response: `showStoreList([{...}])`; `pkey` is the store ID, `NAME` name, `addr` address, `TEL` phone, `px`/`py` longitude/latitude.
- Uses `requests`, **not Scrapling**, because the latter returned blank/incorrect results in Colab testing.
- FamilyMart's public-site key may change; set `FAMILY_API_KEY` in `.env` if needed.

## Output schema

`output/<chain>_latest.json`:

```json
{"generated_at":"2026-11-23T03:00:00+08:00","chain":"familymart","stores":[{"chain":"familymart","store_id":"024080","name":"全家新德店","address":"台北市中正區八德路一段４３巷２號","city":"台北市","district":"中正區","phone":"02-23214351","longitude":121.531597,"latitude":25.044475}]}
```

`output/last_run.json` includes run status, timestamps, per-chain current and previous counts, percentage change, query counts, errors, and whether the import was uploaded.

## Ralulu import: action required from Widy

The scraper **does not know the Ralulu database schema**. Widy should implement a private Laravel endpoint, then set its HTTPS URL and bearer token in `.env`. Example request:

`POST <RALULU_SYNC_URL>`

`Authorization: Bearer <RALULU_SYNC_TOKEN>`

Body: `{ "generated_at": "...", "stores": [ ... ], "summary": { "7eleven": {...}, "familymart": {...} } }`

Server-side contract:

1. Authenticate token; validate payload and schema.
2. Transactional upsert by `(chain, store_id)`; never use store name as unique key.
3. Only mark absent stores inactive after **repeated successful full snapshots** and manual review; do not delete missing stores immediately.
4. Return HTTP 2xx only when import transaction committed; otherwise non-2xx so scraper records failure.
5. Persist sync history and display per-chain status, last successful time, current/previous count, percentage change, and errors at top of **Audit Logs** page.
6. Keep original records on failed/partial crawls. Do not let the import endpoint erase data from a partial payload.

## Failure protection and limitations

- Each request retries transient HTTP errors with backoff; failures are logged per region.
- **Any failed region** or unexpectedly low store count marks the chain failed; its last successful JSON snapshot is retained.
- Default minimum store counts: 6,500 (7-ELEVEN) and 4,000 (FamilyMart). In addition, new count must be at least 90% of previous successful snapshot. These are guardrails, not a proof of completeness; Widy may tune them after validation.
- If either requested chain fails, no combined upload is attempted. Prior successful snapshots remain intact.
- If endpoint/token are not configured, script saves snapshots but **does not update the Ralulu database**.
- Some server environments may block or rate-limit requests. Verify the combined script from the actual server before enabling the schedule. Respect source-site access policies and use modest request pacing.
- Source endpoints are public website internals, not guaranteed stable supported APIs. Nick's side will maintain changes.
