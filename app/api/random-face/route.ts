import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const download = searchParams.get('download') === '1';
    const jsonMode = searchParams.get('json') === '1';

    // Thêm timestamp ngẫu nhiên để không bị Cloudflare / Browser cache cùng 1 ảnh
    const randomUrl = `https://thispersondoesnotexist.com/random-person.jpeg?nocache=${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(randomUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://thispersondoesnotexist.com/',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Lỗi tải ảnh từ máy chủ (${res.status})` },
        { status: 502 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Nếu gọi dạng JSON trả Base64 (phục vụ đóng gói ZIP nhiều ảnh)
    if (jsonMode) {
      const base64 = buffer.toString('base64');
      return NextResponse.json({
        success: true,
        mimeType: 'image/jpeg',
        base64,
        sizeBytes: buffer.length,
        timestamp: Date.now(),
      });
    }

    const filename = `face_${Date.now()}.jpg`;

    // Trả về trực tiếp binary image/jpeg
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        ...(download
          ? { 'Content-Disposition': `attachment; filename="${filename}"` }
          : { 'Content-Disposition': `inline; filename="${filename}"` }),
      },
    });
  } catch (err: unknown) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return NextResponse.json(
      {
        error: isAbort
          ? 'Hết thời gian chờ tạo ảnh khuôn mặt'
          : 'Không thể kết nối đến thispersondoesnotexist.com',
      },
      { status: 500 }
    );
  }
}
