'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as OTPAuth from 'otpauth';
import {
  ShieldCheck,
  Copy,
  Check,
  Clock,
  Sparkles,
  ClipboardPaste,
  Trash2,
  Bookmark,
  History,
  AlertCircle,
  RefreshCw,
  Layers,
  ArrowRight,
  Key,
} from 'lucide-react';

interface RecentKeyItem {
  id: string;
  name: string;
  rawInput: string;
  cleanKey: string;
  createdAt: number;
}

interface BatchItem {
  id: string;
  label: string;
  rawLine: string;
  cleanKey: string;
  code: string;
  error?: string;
}

const STORAGE_2FA_RECENT = 'fb_toolkit_2fa_recent_keys_v1';
const SAMPLE_2FA_KEY = 'JBSWY3DPEHPK3PXP'; // Mã demo chuẩn RFC 6238

// Hàm làm sạch và trích xuất Base32 key
export function extractBase32Secret(input: string): string {
  let s = input.trim();
  if (!s) return '';

  // 1. Kiểm tra nếu là otpauth:// URI
  if (s.startsWith('otpauth://')) {
    try {
      const parsed = OTPAuth.URI.parse(s);
      return parsed.secret.base32;
    } catch {}
  }

  // 2. Kiểm tra nếu là dạng phân tách bởi | hoặc dấu phẩy hoặc tab (VD: uid|pass|2fa|cookie)
  if (s.includes('|') || s.includes('\t') || s.includes(';')) {
    const delimiter = s.includes('|') ? '|' : s.includes('\t') ? '\t' : ';';
    const parts = s.split(delimiter);

    // Tìm phần tử phù hợp cấu trúc base32 (14 - 40 ký tự A-Z2-7, không phải email/url/uid thuần số)
    for (const part of parts) {
      const candidate = part.trim().replace(/\s+/g, '').toUpperCase();
      if (/^[A-Z2-7]{14,40}$/.test(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Chuỗi đơn thuần: loại bỏ khoảng trắng, dấu gạch ngang, chuyển chữ hoa
  const cleaned = s.replace(/[\s\-_=]/g, '').toUpperCase();
  return cleaned;
}

// Tạo mã 6 số từ base32 secret
function generateCode(secretBase32: string): { code: string; error?: string } {
  if (!secretBase32) return { code: '', error: 'Chưa có khóa 2FA' };
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secretBase32),
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    return { code: totp.generate() };
  } catch (err: unknown) {
    return {
      code: '',
      error: 'Khóa 2FA không hợp lệ (cần mã Base32 gồm chữ A-Z và số 2-7)',
    };
  }
}

export function TwoFactorAuth() {
  const [inputVal, setInputVal] = useState('');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [remainingSec, setRemainingSec] = useState<number>(30);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [recentKeys, setRecentKeys] = useState<RecentKeyItem[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [autoCopyOnPaste, setAutoCopyOnPaste] = useState(false);
  const lastCopiedCodeRef = useRef<string>('');

  // Nạp lịch sử từ LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_2FA_RECENT);
      if (saved) setRecentKeys(JSON.parse(saved));
    } catch {}
  }, []);

  // Timer đếm ngược 30 giây chuẩn RFC 6238
  useEffect(() => {
    const updateTimer = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = 30 - (nowSec % 30);
      setRemainingSec(remaining === 0 ? 30 : remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  // Trích xuất key cho chế độ Đơn lẻ
  const singleCleanKey = useMemo(() => {
    // Nếu có nhiều dòng thì chỉ lấy dòng đầu trong chế độ đơn lẻ
    const firstLine = inputVal.split('\n')[0] || '';
    return extractBase32Secret(firstLine);
  }, [inputVal]);

  // Sinh mã cho chế độ Đơn lẻ (tự động tính lại khi remainingSec thay đổi chu kỳ)
  const singleResult = useMemo(() => {
    if (!singleCleanKey) return { code: '', error: '' };
    return generateCode(singleCleanKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleCleanKey, Math.floor(Date.now() / 30000)]);

  // Tự động sao chép mã nếu người dùng bật tùy chọn
  useEffect(() => {
    if (autoCopyOnPaste && singleResult.code && singleResult.code !== lastCopiedCodeRef.current) {
      lastCopiedCodeRef.current = singleResult.code;
      triggerCopy(singleResult.code, 'single');
    }
  }, [autoCopyOnPaste, singleResult.code]);

  // Xử lý chế độ Hàng loạt (Batch) nếu nhập nhiều dòng
  const batchList: BatchItem[] = useMemo(() => {
    if (mode !== 'batch') return [];
    const lines = inputVal.split('\n').filter((l) => l.trim().length > 0);
    return lines.map((line, idx) => {
      const clean = extractBase32Secret(line);
      const res = generateCode(clean);

      // Trích xuất nhãn (UID hoặc tài khoản nếu có dấu |)
      let label = `Tài khoản #${idx + 1}`;
      if (line.includes('|')) {
        const parts = line.split('|');
        if (parts[0] && parts[0].trim()) label = parts[0].trim();
      }

      return {
        id: `batch_${idx}`,
        label,
        rawLine: line,
        cleanKey: clean,
        code: res.code,
        error: res.error,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputVal, mode, Math.floor(Date.now() / 30000)]);

  // Tự động chuyển chế độ nếu dán nhiều dòng
  const handleInputChange = (val: string) => {
    setInputVal(val);
    const lineCount = val.split('\n').filter((l) => l.trim()).length;
    if (lineCount > 1 && mode !== 'batch') {
      setMode('batch');
    }
  };

  // Sao chép kèm hiệu ứng
  const triggerCopy = useCallback((text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => {
      setCopiedKey((cur) => (cur === id ? null : cur));
    }, 2200);
  }, []);

  // Dán từ clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleInputChange(text);
      }
    } catch {
      alert('Không thể đọc bộ nhớ tạm. Bạn hãy dùng phím tắt Ctrl+V để dán nhé!');
    }
  };

  // Lưu key vào danh sách gần đây
  const handleSaveToRecent = (customLabel?: string) => {
    if (!singleCleanKey) {
      alert('Vui lòng nhập mã 2FA hợp lệ trước khi lưu!');
      return;
    }

    const name = (customLabel || labelInput).trim() || `Nick 2FA (${singleCleanKey.slice(-4)})`;
    const newItem: RecentKeyItem = {
      id: `key_${Date.now()}`,
      name,
      rawInput: inputVal,
      cleanKey: singleCleanKey,
      createdAt: Date.now(),
    };

    const updated = [newItem, ...recentKeys.filter((k) => k.cleanKey !== singleCleanKey)].slice(0, 15);
    setRecentKeys(updated);
    localStorage.setItem(STORAGE_2FA_RECENT, JSON.stringify(updated));
    setLabelInput('');
    triggerCopy(singleResult.code || '', 'saved');
  };

  const handleDeleteRecent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentKeys.filter((k) => k.id !== id);
    setRecentKeys(updated);
    localStorage.setItem(STORAGE_2FA_RECENT, JSON.stringify(updated));
  };

  // Tính phần trăm vòng quay đếm ngược
  const progressPct = ((30 - remainingSec) / 30) * 100;
  const isUrgent = remainingSec <= 5;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* CỘT TRÁI: Ô NHẬP 2FA SECRET & DANH SÁCH LƯU */}
      <div className="lg:col-span-5 space-y-4">
        <div className="glass-panel p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">
                Nhập mã khóa 2FA
              </span>
            </div>

            {/* Chuyển đơn lẻ / hàng loạt */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setMode('single')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  mode === 'single'
                    ? 'bg-cyan-500 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1 Nick
              </button>
              <button
                onClick={() => setMode('batch')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  mode === 'batch'
                    ? 'bg-cyan-500 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Nhiều Nick
              </button>
            </div>
          </div>

          {/* Ô nhập */}
          <div className="relative">
            <textarea
              value={inputVal}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                mode === 'single'
                  ? `Dán mã 2FA Secret Key vào đây...
Ví dụ:
• JBSWY3DPEHPK3PXP
• uid|pass|JBSWY3DPEHPK3PXP|cookie
• otpauth://totp/...`
                  : `Dán nhiều dòng (Mỗi dòng 1 nick hoặc 1 mã 2FA)...
Ví dụ:
1000123456|pass1|JBSWY3DPEHPK3PXP
1000987654|pass2|4S57J22AGL74TQYF
3WXP45ABC...`
              }
              rows={mode === 'single' ? 5 : 7}
              className="w-full glass-input p-3.5 rounded-2xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none resize-y"
            />
          </div>

          {/* Công cụ dán & xóa */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-cyan-300 flex items-center gap-1.5 transition"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Dán từ bộ nhớ tạm</span>
              </button>

              <button
                type="button"
                onClick={() => handleInputChange(SAMPLE_2FA_KEY)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition"
              >
                Mẫu thử
              </button>
            </div>

            {inputVal && (
              <button
                type="button"
                onClick={() => setInputVal('')}
                className="text-xs p-2 rounded-xl text-slate-400 hover:text-rose-400 transition"
                title="Xóa trắng"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tùy chọn tự động sao chép */}
          {mode === 'single' && (
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={autoCopyOnPaste}
                onChange={(e) => setAutoCopyOnPaste(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-white/10 border-white/20"
              />
              <span>Tự động sao chép mã 6 số ngay khi dán</span>
            </label>
          )}

          {/* Form lưu mã này để lần sau dùng lại */}
          {mode === 'single' && singleCleanKey && !singleResult.error && (
            <div className="pt-2 border-t border-white/10 flex items-center gap-2">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="Đặt tên lưu nick này (VD: Nick chính, Clone 1)..."
                className="flex-1 glass-input py-2 px-3 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSaveToRecent()}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Lưu</span>
              </button>
            </div>
          )}
        </div>

        {/* DANH SÁCH 2FA ĐÃ LƯU GẦN ĐÂY */}
        {recentKeys.length > 0 && (
          <div className="glass-panel p-4 rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-pink-400" />
                <span>Mã 2FA đã lưu gần đây ({recentKeys.length})</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {recentKeys.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setInputVal(item.rawInput || item.cleanKey);
                    setMode('single');
                  }}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between cursor-pointer transition group"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300">
                      {item.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      {item.cleanKey.slice(0, 6)}••••••••{item.cleanKey.slice(-4)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500">Bấm lấy mã</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecent(item.id, e)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CỘT PHẢI: KẾT QUẢ MÃ 6 SỐ & ĐẾM NGƯỢC RÕ RÀNG */}
      <div className="lg:col-span-7 space-y-4">
        {mode === 'single' ? (
          /* ================= CHẾ ĐỘ 1 NICK ================= */
          <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 text-center">
            {/* Header trạng thái */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Mã xác thực 2 bước (TOTP 6 số)</span>
              </span>
              <span className="text-[11px] text-slate-400">Chu kỳ chuẩn: 30s</span>
            </div>

            {/* BẢNG HIỂN THỊ MÃ 6 SỐ */}
            {singleResult.error ? (
              <div className="py-10 px-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{singleResult.error}</span>
              </div>
            ) : singleResult.code ? (
              <div className="space-y-6">
                {/* Ô mã 6 số siêu to khổng lồ */}
                <div
                  onClick={() => triggerCopy(singleResult.code, 'single')}
                  className="relative p-6 sm:p-8 rounded-3xl bg-black/60 border-2 border-cyan-400/50 shadow-[0_0_35px_rgba(34,211,238,0.2)] cursor-pointer group hover:border-cyan-300 transition duration-200 select-all"
                  title="Bấm để sao chép mã 6 số"
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-3 text-4xl sm:text-6xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-200 to-pink-300">
                    <span>{singleResult.code.slice(0, 3)}</span>
                    <span className="text-slate-500 text-3xl sm:text-5xl font-light">
                      •
                    </span>
                    <span>{singleResult.code.slice(3, 6)}</span>
                  </div>

                  <div className="mt-2 text-xs text-slate-400 group-hover:text-cyan-300 transition flex items-center justify-center gap-1">
                    <Copy className="w-3.5 h-3.5" />
                    <span>Bấm vào ô số hoặc nút bên dưới để copy</span>
                  </div>
                </div>

                {/* THANH ĐẾM NGƯỢC THỜI GIAN RÕ RÀNG */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <Clock
                        className={`w-4 h-4 ${
                          isUrgent ? 'text-rose-400 animate-spin' : 'text-cyan-400'
                        }`}
                      />
                      <span className="font-semibold text-slate-200">
                        Thời gian còn lại:
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-mono font-black text-base sm:text-lg tabular-nums px-2.5 py-0.5 rounded-lg border transition ${
                          isUrgent
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                            : remainingSec <= 10
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {remainingSec}s
                      </span>
                      <span className="text-[11px] text-slate-400">/ 30s</span>
                    </div>
                  </div>

                  {/* Thanh tiến trình màu sắc động */}
                  <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                        isUrgent
                          ? 'bg-gradient-to-r from-rose-500 to-red-600'
                          : remainingSec <= 10
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                          : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                      }`}
                      style={{ width: `${(remainingSec / 30) * 100}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 text-left pt-1">
                    {isUrgent
                      ? '⚠️ Mã sắp hết hạn, hệ thống sẽ tự động đổi sang mã mới sau vài giây!'
                      : 'Hết 30 giây mã 6 số sẽ tự động làm mới ngay tại đây.'}
                  </p>
                </div>

                {/* NÚT SAO CHÉP MÃ TO RÕ RÀNG */}
                <button
                  type="button"
                  onClick={() => triggerCopy(singleResult.code, 'single')}
                  className={`w-full py-4 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-xl transition-all duration-200 active:scale-95 ${
                    copiedKey === 'single'
                      ? 'bg-emerald-500 text-white shadow-emerald-500/40'
                      : 'btn-primary text-white'
                  }`}
                >
                  {copiedKey === 'single' ? (
                    <>
                      <Check className="w-6 h-6 stroke-[3]" />
                      <span>ĐÃ SAO CHÉP MÃ: {singleResult.code}!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      <span>SAO CHÉP MÃ 6 SỐ</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Trạng thái chưa nhập */
              <div className="py-16 text-center space-y-3 text-slate-400">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center mx-auto text-cyan-400">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-white">Chưa có mã 2FA</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Dán mã Secret Key hoặc dòng nick dạng <code>uid|pass|2fa</code> vào ô bên trái để nhận ngay mã 6 số kèm đồng hồ đếm ngược!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleInputChange(SAMPLE_2FA_KEY)}
                  className="text-xs px-3.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 font-semibold transition"
                >
                  Thử ngay với mã mẫu
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ================= CHẾ ĐỘ HÀNG LOẠT (BATCH) ================= */
          <div className="glass-panel p-5 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Mã 2FA hàng loạt ({batchList.length} tài khoản)
                </span>
              </div>

              {/* Đồng hồ đếm ngược chung */}
              <div className="flex items-center gap-1.5 text-xs bg-black/40 px-3 py-1 rounded-xl border border-white/10">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400">Đổi mã sau:</span>
                <span
                  className={`font-mono font-bold ${
                    isUrgent ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                  }`}
                >
                  {remainingSec}s
                </span>
              </div>
            </div>

            {batchList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">
                Vui lòng nhập danh sách nick hoặc mã 2FA vào cột bên trái (mỗi dòng 1 nick).
              </p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {batchList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/5 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300 truncate">
                          {item.label}
                        </span>
                        {item.cleanKey && (
                          <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
                            ({item.cleanKey.slice(-6)})
                          </span>
                        )}
                      </div>

                      {item.error ? (
                        <p className="text-[11px] text-rose-400 mt-0.5">{item.error}</p>
                      ) : (
                        <p className="text-xl sm:text-2xl font-black font-mono text-cyan-300 tracking-wider mt-0.5 select-all">
                          {item.code ? `${item.code.slice(0, 3)} ${item.code.slice(3, 6)}` : '--- ---'}
                        </p>
                      )}
                    </div>

                    {item.code && (
                      <button
                        type="button"
                        onClick={() => triggerCopy(item.code, item.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                          copiedKey === item.id
                            ? 'bg-emerald-500 text-white shadow'
                            : 'bg-white/10 hover:bg-white/15 text-white'
                        }`}
                      >
                        {copiedKey === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Đã copy!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy mã</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
