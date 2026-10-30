'use client';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
export default function SignOut(){ const router=useRouter(); return <button className="btn" onClick={async()=>{await apiFetch('/auth/signout',{method:'POST'}); router.push('/signin'); router.refresh();}}>Sign out</button>; }
