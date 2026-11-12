import { Suspense } from 'react';
import { VerifyEmail } from '@/components/AuthForms';

export default function Page() {
  return <Suspense><VerifyEmail /></Suspense>;
}
