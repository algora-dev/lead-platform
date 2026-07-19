import {prisma} from '@/lib/prisma';import {NextRequest,NextResponse} from 'next/server';
export async function GET(){return NextResponse.json(await prisma.batch.findMany({include:{_count:{select:{companies:true}}},orderBy:{createdAt:'desc'}}));}
export async function POST(req:NextRequest){const {name,companyIds,notes}=await req.json();return NextResponse.json(await prisma.batch.create({data:{name,notes,companies:{connect:(companyIds||[]).map((id:number)=>({id}))}}}));}
