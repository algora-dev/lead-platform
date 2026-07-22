import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LibrariesRedirect() {
  redirect('/v2/scans?tab=libraries');
}
