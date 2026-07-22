import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CustomerProfilesRedirect() {
  redirect('/v2/profiles?tab=customer');
}
