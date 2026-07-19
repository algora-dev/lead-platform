import fs from 'fs';
import path from 'path';

const TENANT_ID = process.env.TENANT_ID || 'internal';
const TENANT_DIR = path.join(process.cwd(), 'tenants', TENANT_ID);

function loadJson(name: string): Record<string, any> {
  const filePath = path.join(TENANT_DIR, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing tenant configuration: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export const tenant = {
  id: TENANT_ID,
  branding: loadJson('branding.json'),
  features: loadJson('features.json'),
};
