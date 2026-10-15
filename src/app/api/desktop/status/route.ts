import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    available: false,
    running: false,
    startAtLogin: false,
  });
}
