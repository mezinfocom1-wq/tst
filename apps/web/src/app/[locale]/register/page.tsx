import { Suspense } from 'react';
import { RegisterForm } from '@/components/AuthForms';

export default function Page() {
  return <Suspense><RegisterForm /></Suspense>;
}
