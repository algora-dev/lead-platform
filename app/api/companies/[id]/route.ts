import {prisma} from '@/lib/prisma';import {NextRequest,NextResponse} from 'next/server';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;return NextResponse.json(await prisma.company.update({where:{id:Number(id)},data:await req.json(),include:{jobs:true}}));}
export async function DELETE(_:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;await prisma.company.update({where:{id:Number(id)},data:{discarded:true}});return NextResponse.json({ok:true});}
