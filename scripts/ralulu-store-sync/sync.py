#!/usr/bin/env python3
"""Ralulu Taiwan convenience-store snapshot crawler. Python 3.11+."""
import argparse
import json
import logging
import os
import re
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo('Asia/Taipei')
SEVEN_URL = 'https://emap.pcsc.com.tw/EMapSDK.aspx'
FAMILY_URL = 'https://api.map.com.tw/net/familyShop.aspx'
CITIES = json.loads((ROOT / 'districts.json').read_text(encoding='utf-8'))
FAMILY_KEY = os.environ.get('FAMILY_API_KEY', '6F30E8BF706D653965BDE302661D1241F8BE9EBC')


def session():
    s = requests.Session()
    retries = Retry(total=3, connect=3, read=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504], allowed_methods=['GET', 'POST'])
    s.mount('https://', HTTPAdapter(max_retries=retries))
    s.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; RaluluStoreSync/1.0)'})
    return s


def family_query(s, search_type, callback, **kwargs):
    params = {'searchType': search_type, 'type': '', **kwargs, 'fun': callback, 'key': FAMILY_KEY}
    r = s.get(FAMILY_URL, params=params, headers={'Referer': 'https://www.family.com.tw/Marketing/StoreMap/'}, timeout=35)
    r.raise_for_status()
    raw = r.text.strip()
    match = re.fullmatch(r'\s*' + re.escape(callback) + r'\s*\(\s*(.*?)\s*\)\s*;?\s*', raw, re.S)
    if not match:
        raise ValueError(f'Unexpected FamilyMart response: {raw[:160]!r}')
    result = json.loads(match.group(1))
    if not isinstance(result, list):
        raise ValueError('FamilyMart API returned non-list')
    return result


def crawl_family(s, pause):
    stores, errors, queries = {}, [], 0
    for city in CITIES:
        try:
            towns = family_query(s, 'ShowTownList', 'storeTownList', city=city)
            if not towns:
                raise ValueError('Empty town list')
            names = [x['town'] for x in towns]
        except Exception as exc:
            errors.append({'chain': 'familymart', 'city': city, 'area': None, 'error': str(exc)})
            logging.error('FamilyMart %s town list failed: %s', city, exc)
            continue
        for town in names:
            try:
                result = family_query(s, 'ShopList', 'showStoreList', city=city, area=town, road='')
                queries += 1
                for x in result:
                    code = str(x['pkey']).strip()
                    if not code or not x.get('NAME') or not x.get('addr'):
                        raise ValueError('Incomplete store entry')
                    stores[code] = {'chain': 'familymart', 'store_id': code, 'name': x['NAME'], 'address': x['addr'], 'city': city, 'district': town, 'phone': x.get('TEL'), 'longitude': x.get('px'), 'latitude': x.get('py')}
            except Exception as exc:
                errors.append({'chain': 'familymart', 'city': city, 'area': town, 'error': str(exc)})
                logging.error('FamilyMart %s %s failed: %s', city, town, exc)
            time.sleep(pause)
        logging.info('FamilyMart %s finished; total unique=%s', city, len(stores))
    return list(stores.values()), errors, queries


def crawl_seven(s, pause):
    stores, errors, queries = {}, [], 0
    for city, towns in CITIES.items():
        for town in towns:
            payload = {'commandid': 'SearchStore', 'city': city, 'town': town, 'roadname': '', 'ID': '', 'StoreName': '', 'SpecialStore_Kind': '', 'leftMenuChecked': '', 'address': ''}
            try:
                r = s.post(SEVEN_URL, data=payload, timeout=35)
                r.raise_for_status()
                root = ET.fromstring(r.content)
                queries += 1
                for geo in root.findall('.//GeoPosition'):
                    code = (geo.findtext('POIID') or '').strip()
                    name = (geo.findtext('POIName') or '').strip()
                    address = (geo.findtext('Address') or '').strip()
                    if not code or not name or not address:
                        raise ValueError('Incomplete store entry')
                    stores[code] = {'chain': '7eleven', 'store_id': code, 'name': name, 'address': address, 'city': city, 'district': town, 'phone': (geo.findtext('Telno') or '').strip(), 'longitude': (geo.findtext('X') or '').strip(), 'latitude': (geo.findtext('Y') or '').strip()}
            except Exception as exc:
                errors.append({'chain': '7eleven', 'city': city, 'area': town, 'error': str(exc)})
                logging.error('7-ELEVEN %s %s failed: %s', city, town, exc)
            time.sleep(pause)
        logging.info('7-ELEVEN %s finished; total unique=%s', city, len(stores))
    return list(stores.values()), errors, queries


# nginx in front of Ralulu refuses request bodies over 1 MB, so the snapshot is uploaded in chunks below that
# size and applied by one final "commit" request (see docs/12-cvs-store-sync.md in the Ralulu repo).
CHUNK_BYTES = int(os.environ.get('UPLOAD_CHUNK_BYTES', '700000'))


def compact(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def chunk_stores(stores, limit=CHUNK_BYTES):
    """Split stores into lists whose JSON body stays below `limit` bytes."""
    chunk, size = [], 0
    for store in stores:
        n = len(compact(store)) + 1
        if chunk and size + n > limit:
            yield chunk
            chunk, size = [], 0
        chunk.append(store)
        size += n
    if chunk:
        yield chunk


def upload(s, endpoint, token, stores, summary, started):
    """Send chunks, then the summary. Ralulu applies the data only when the commit request arrives
    and every chunk is accounted for, so an interrupted upload leaves its database untouched."""
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json; charset=utf-8'}
    session_id = uuid.uuid4().hex

    def post(payload):
        body = compact(payload)
        r = s.post(endpoint, data=body, headers=headers, timeout=120)
        if not r.ok:
            raise requests.HTTPError(f'{r.status_code} for {endpoint} ({len(body)} bytes): {r.text[:200]}', response=r)

    parts = 0
    for chunk in chunk_stores(stores):
        post({'session': session_id, 'stores': chunk})
        parts += 1
    post({'session': session_id, 'generated_at': started, 'summary': summary})
    logging.info('Uploaded %s stores in %s chunks', len(stores), parts)


def save_json_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chain', choices=['both', '7eleven', 'familymart'], default='both')
    parser.add_argument('--output-dir', default=str(ROOT / 'output'))
    parser.add_argument('--pause', type=float, default=0.3)
    parser.add_argument('--min-ratio', type=float, default=0.90, help='Reject counts below this fraction of baseline')
    parser.add_argument('--no-upload', action='store_true', help='Never send to Ralulu API')
    args = parser.parse_args()
    if not 0 < args.min_ratio <= 1 or args.pause < 0:
        parser.error('Invalid min-ratio or pause')
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(out / 'sync.log', encoding='utf-8')])
    started = datetime.now(TZ).isoformat()
    s = session()
    result = {}
    baseline = {'7eleven': int(os.environ.get('MIN_SEVEN_STORES', '6500')), 'familymart': int(os.environ.get('MIN_FAMILY_STORES', '4000'))}
    if args.chain in ('both', '7eleven'):
        result['7eleven'] = crawl_seven(s, args.pause)
    if args.chain in ('both', 'familymart'):
        result['familymart'] = crawl_family(s, args.pause)
    summary, all_stores, problems = {}, [], []
    for chain, (stores, errors, queries) in result.items():
        previous_path = out / f'{chain}_latest.json'
        previous = None
        if previous_path.exists():
            try:
                previous = len(json.loads(previous_path.read_text(encoding='utf-8'))['stores'])
            except Exception:
                logging.warning('Previous snapshot unreadable for %s', chain)
        threshold = max(baseline[chain], int((previous or 0) * args.min_ratio))
        ok = not errors and len(stores) >= threshold
        summary[chain] = {'status': 'success' if ok else 'failed', 'count': len(stores), 'previous_count': previous, 'change_pct': round((len(stores) - previous) / previous * 100, 2) if previous else None, 'queries': queries, 'errors': errors, 'threshold': threshold}
        if ok:
            save_json_atomic(previous_path, {'generated_at': started, 'chain': chain, 'stores': stores})
            all_stores.extend(stores)
        else:
            problems.append(chain)
    status = 'success' if not problems else ('partial' if len(problems) < len(result) else 'failed')
    report = {'started_at': started, 'finished_at': datetime.now(TZ).isoformat(), 'status': status, 'chains': summary, 'uploaded': False}
    # Always report to Ralulu so the Audit Logs monitor sees failures too. all_stores only holds
    # chains that passed validation, so a failed/partial chain never overwrites production data.
    if not args.no_upload:
        endpoint = os.environ.get('RALULU_SYNC_URL', '').strip()
        token = os.environ.get('RALULU_SYNC_TOKEN', '').strip()
        if endpoint and token:
            try:
                upload(s, endpoint, token, all_stores, summary, started)
                report['uploaded'] = True
            except Exception as exc:
                report['status'] = 'failed'
                report['upload_error'] = str(exc)
                logging.exception('Ralulu upload failed')
        else:
            logging.info('No RALULU_SYNC_URL/TOKEN configured; snapshots only, no database changes')
    save_json_atomic(out / 'last_run.json', report)
    logging.info('Run complete: %s, counts=%s, uploaded=%s', report['status'], {k: v['count'] for k, v in summary.items()}, report['uploaded'])
    return 0 if report['status'] == 'success' else 1


if __name__ == '__main__':
    sys.exit(main())
