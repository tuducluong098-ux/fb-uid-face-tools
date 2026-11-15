import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface CheckResult {
  uid: string;
  status: 'live' | 'die' | 'error';
  name?: string;
  avatar?: string;
  message?: string;
}

// Chuẩn hóa input (hỗ trợ UID số, url facebook.com/..., hoặc định dạng uid|pass|2fa...)
function extractTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 1. Tách định dạng uid|pass|2fa...
  const firstPart = trimmed.split('|')[0].trim();

  // 2. URL facebook.com/profile.php?id=12345
  const profileIdMatch = firstPart.match(/[?&]id=(\d+)/i);
  if (profileIdMatch) return profileIdMatch[1];

  // 3. URL facebook.com/username hoặc /123456
  const urlMatch = firstPart.match(
    /(?:https?:\/\/)?(?:www\.|m\.|touch\.)?facebook\.com\/(?:people\/[^\/]+\/(\d+)|profile\.php\?id=(\d+)|([a-zA-Z0-9._-]+))/i
  );
  if (urlMatch) {
    const id = urlMatch[1] || urlMatch[2] || urlMatch[3];
    if (
      id &&
      !['home', 'login', 'recover', 'watch', 'groups', 'marketplace'].includes(
        id.toLowerCase()
      )
    ) {
      return id;
    }
  }

  // 4. Nếu là chuỗi số thuần
  const digitsOnly = firstPart.replace(/\D/g, '');
  if (digitsOnly.length >= 1) return digitsOnly;

  return firstPart;
}

// Kiểm tra với Access Token (nếu người dùng cung cấp)
async function checkWithToken(target: string, token: string): Promise<CheckResult> {
  try {
    const url = `https://graph.facebook.com/v19.0/${target}?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(
      token
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    if (data.id && data.name) {
      return {
        uid: data.id || target,
        status: 'live',
        name: data.name,
        avatar: data.picture?.data?.url,
        message: 'Hoạt động (Xác thực qua Token)',
      };
    }

    if (data.error) {
      const code = data.error.code;
      const subcode = data.error.error_subcode;
      if (code === 190) {
        return {
          uid: target,
          status: 'error',
          message: 'Access Token không hợp lệ hoặc đã hết hạn',
        };
      }
      if (subcode === 459 || subcode === 460 || subcode === 463) {
        return {
          uid: target,
          status: 'die',
          message: 'Tài khoản bị Checkpoint (Khóa 956/282)',
        };
      }
      return {
        uid: target,
        status: 'die',
        message: data.error.message || 'Tài khoản không tồn tại hoặc đã khóa',
      };
    }

    return { uid: target, status: 'die', message: 'Không thể truy vấn UID' };
  } catch {
    return { uid: target, status: 'die', message: 'Hết thời gian chờ Graph API' };
  }
}

// Kiểm tra không cần token (Dual-Check: OpenGraph Crawler + Graph CDN Avatar)
async function checkAnonymous(target: string): Promise<CheckResult> {
  const isNumeric = /^\d+$/.test(target);

  try {
    // Luồng 1: OpenGraph Scraper Crawler để lấy Title và xác minh profile
    const profileUrl = isNumeric
      ? `https://www.facebook.com/profile.php?id=${target}`
      : `https://www.facebook.com/${target}`;

    const ogPromise = fetch(profileUrl, {
      headers: {
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        return { title };
      })
      .catch(() => null);

    // Luồng 2: Graph API Picture CDN Check (đối với UID số)
    const picPromise = isNumeric
      ? fetch(
          `https://graph2.facebook.com/v3.3/${target}/picture?type=large&redirect=0`,
          {
            signal: AbortSignal.timeout(4000),
          }
        )
          .then(async (res) => {
            if (!res.ok) return null;
            return await res.json();
          })
          .catch(() => null)
      : Promise.resolve(null);

    const [ogResult, picResult] = await Promise.all([ogPromise, picPromise]);

    const title = ogResult?.title || '';
    const avatarUrl = picResult?.data?.url || '';

    // Kiểm tra xem avatar có phải CDN scontent thật không hay là ảnh silhouette rỗng (static.xx.fbcdn.net hoặc rsrc.php)
    const hasScontentAvatar =
      avatarUrl.includes('scontent') &&
      !avatarUrl.includes('rsrc.php') &&
      !avatarUrl.includes('static.xx.fbcdn.net');

    // Title kiểm tra
    const isInvalidTitle =
      !title ||
      title.toLowerCase() === 'facebook' ||
      title.toLowerCase().includes('log in') ||
      title.toLowerCase().includes('đăng nhập') ||
      title.toLowerCase().includes('error') ||
      title.toLowerCase().includes('content not found') ||
      title.toLowerCase().includes('nội dung không tìm thấy');

    if (!isInvalidTitle) {
      return {
        uid: target,
        status: 'live',
        name: title,
        avatar: hasScontentAvatar ? avatarUrl : undefined,
        message: 'Hoạt động (Đã xác minh profile)',
      };
    }

    if (hasScontentAvatar) {
      return {
        uid: target,
        status: 'live',
        name: 'Người dùng Facebook',
        avatar: avatarUrl,
        message: 'Hoạt động (Avatar CDN khả dụng)',
      };
    }

    return {
      uid: target,
      status: 'die',
      message: 'Tài khoản không tồn tại, đã bị khóa (checkpoint) hoặc bị xóa',
    };
  } catch (err: unknown) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return {
      uid: target,
      status: 'die',
      message: isAbort ? 'Hết thời gian phản hồi (Timeout)' : 'Lỗi kết nối Facebook',
    };
  }
}

// Hàm chia mảng theo lô để kiểm tra đồng thời
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
    const token: string = typeof body?.token === 'string' ? body.token.trim() : '';

    if (rawList.length === 0) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp danh sách UID cần kiểm tra.' },
        { status: 400 }
      );
    }

    // Lọc và chuẩn hóa UID
    const uidsToProcess = rawList
      .map(extractTarget)
      .filter((uid) => uid.length >= 1);

    // Loại bỏ UID trùng lặp trong 1 lần check
    const uniqueUids = Array.from(new Set(uidsToProcess)).slice(0, 300); // Tối đa 300 UID/lần

    if (uniqueUids.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy UID hợp lệ trong danh sách cung cấp.' },
        { status: 400 }
      );
    }

    // Chạy song song tối đa 8 luồng
    const checkFn = (target: string) =>
      token ? checkWithToken(target, token) : checkAnonymous(target);

    const results = await runConcurrent(uniqueUids, 8, checkFn);

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
