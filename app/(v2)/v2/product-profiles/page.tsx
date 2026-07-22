import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ProductProfilesRedirect() {
  redirect('/v2/profiles?tab=product');
}
