import PrimaryNav from '@/components/PrimaryNav';

export const dynamic = 'force-dynamic';

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PrimaryNav />
      {children}
    </>
  );
}
