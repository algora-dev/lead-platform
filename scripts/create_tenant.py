"""Create a new tenant configuration by cloning the internal template.
Usage: python scripts/create_tenant.py demo-acme
"""
import argparse
import json
import re
import shutil
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]


def slug(value:str)->str:
    return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('tenant_id')
    parser.add_argument('--business-name')
    parser.add_argument('--product-name')
    args=parser.parse_args()
    tenant_id=slug(args.tenant_id)
    source=BASE/'tenants'/'internal'
    target=BASE/'tenants'/tenant_id
    if target.exists():
        raise SystemExit(f'Tenant already exists: {target}')
    shutil.copytree(source,target)
    branding_path=target/'branding.json'
    branding=json.loads(branding_path.read_text(encoding='utf-8'))
    branding['businessName']=args.business_name or tenant_id.replace('-',' ').title()
    branding['productName']=args.product_name or f"{branding['businessName']} Intelligence"
    branding_path.write_text(json.dumps(branding,indent=2),encoding='utf-8')
    print(f'Created {target}')
    print(f'Run with TENANT_ID={tenant_id}')


if __name__=='__main__':
    main()
