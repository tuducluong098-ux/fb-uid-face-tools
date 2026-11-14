import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CheckResult {
  uid: string;
  status: 'live' | 'die' | 'error';
  avatar?: string;
  message?: string;
}

// Kiểm tra 1 UID qua Graph API Picture (không cần access token)
async function checkSingleUid(uid: string): Promise<CheckResult> {
  const cleanUid = uid.trim().replace(/\D/g, '');
  if (!cleanUid) {
    return { uid, status: 'die', message: 'UID không hợp lệ' };
  }

  try {
    const url = `https://graph.facebook.com/${cleanUid}/picture?type=normal`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Khi live: FB trả HTTP 301/302 Redirect sang CDN ảnh scontent...
    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307) {
      const location = res.headers.get('location') || '';
      return {
        uid: cleanUid,
        status: 'live',
        avatar: location || url,
      };
    }

    // Nếu trả 200 trực tiếp (một số proxy hoặc response)
    if (res.ok) {
      return {
        uid: cleanUid,
        status: 'live',
        avatar: url,
      };
    }

    // HTTP 400 Bad Request: "Unsupported head request. Object with ID does not exist" -> Die
    return {
      uid: cleanUid,
      status: 'die',
      message: 'Tài khoản không tồn tại hoặc đã bị khóa',
    };
  } catch (err: unknown) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return {
      uid: cleanUid,
      status: 'die',
      message: isAbort ? 'Hết thời gian phản hồi (Timeout)' : 'Lỗi kết nối Facebook',
    };
  }
}

// Hàm chia mảng theo lô để kiểm tra đồng thời (concurrency)
async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawList: string[] = Array.isArray(body?.uids) ? body.uids : [];

    if (rawList.length === 0) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp danh sách UID cần kiểm tra.' },
        { status: 400 }
      );
    }

    // Lọc và chuẩn hóa UID
    const uidsToProcess = rawList
      .map((item) => {
        if (typeof item !== 'string') return '';
        // Hỗ trợ dạng: uid|pass|2fa, url facebook.com/123456, hoặc thuần số
        const match = item.match(/(\d+)/);
        return match ? match[1] : item.trim();
      })
      .filter((uid) => uid.length >= 1);

    // Loại bỏ UID trùng lặp trong 1 lần check
    const uniqueUids = Array.from(new Set(uidsToProcess)).slice(0, 500); // Giới hạn tối đa 500 UID/lần

    if (uniqueUids.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy UID hợp lệ trong danh sách cung cấp.' },
        { status: 400 }
      );
    }

    // Chạy song song tối đa 10 luồng để vừa nhanh vừa không bị FB chặn IP
    const results = await runConcurrent(uniqueUids, 10, checkSingleUid);

    const liveCount = results.filter((r) => r.status === 'live').length;
    const dieCount = results.filter((r) => r.status === 'die').length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        live: liveCount,
        die: dieCount,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi xử lý kiểm tra UID' },
      { status: 500 }
    );
  }
}
