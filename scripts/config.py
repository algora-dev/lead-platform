import json
import os
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
TENANT_ID = os.getenv('TENANT_ID', 'internal')
TENANT_DIR = BASE / 'tenants' / TENANT_ID


def _load(name: str) -> dict:
    path = TENANT_DIR / name
    if not path.exists():
        raise FileNotFoundError(f'Missing tenant configuration: {path}')
    return json.loads(path.read_text(encoding='utf-8'))


SOURCES = _load('sources.json')
FIELDS = _load('fields.json')
SCORING = _load('scoring.json')
FEATURES = _load('features.json')
BRANDING = _load('branding.json')

TASK_GROUPS = FIELDS['taskGroups']
QUERY_PAIRS = [tuple(pair) for pair in SOURCES['brave']['queryPairs']]
JOB_TERMS = SOURCES['jobTerms']
IGNORE_DOMAINS = SOURCES['ignoreDomains']
JOB_BOARD_DOMAINS = [
    'indeed.', 'reed.co.uk', 'totaljobs.', 'cv-library.', 'adzuna.',
    'glassdoor.', 'monster.', 'jobsite.', 'ziprecruiter.', 'seek.co.nz',
    'trademe.co.nz'
]
