'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  RefreshCw,
  Trash2,
  ExternalLink,
  Users,
  Image as ImageIcon,
  Check,
  FileText,
  Bookmark,
  Sparkles,
  Info,
  Archive,
  Layers,
  ArrowRight,
  ShieldCheck,
  Key,
} from 'lucide-react';
import JSZip from 'jszip';
import { TwoFactorAuth } from './components/TwoFactorAuth';

interface UidResult {
  uid: string;
  status: 'live' | 'die' | 'error';
  name?: string;
  avatar?: string;
  message?: string;
}

interface SavedUidGroup {
  id: string;
  name: string;
  uids: string;
  createdAt: number;
}

interface FaceItem {
  id: string;
  url: string;
  timestamp: number;
}

const STORAGE_KEYS = {
  CURRENT_INPUT: 'fb_toolkit_current_uids',
  SAVED_GROUPS: 'fb_toolkit_saved_groups',
  LAST_RESULTS: 'fb_toolkit_last_results',
  FACE_HISTORY: 'fb_toolkit_face_history',
};

const SAMPLE_UIDS = `4
61592088983182
61592091653973
61593390296974
100084321987654|matkhau123|2FACODE
61550000000001
100000000000001
99999999999999999999`;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'uid' | '2fa' | 'face'>('2fa');

  // ===================== TAB 1: CHECK LIVE UID =====================
  const [rawInput, setRawInput] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showTokenSettings, setShowTokenSettings] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<UidResult[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'live' | 'die'>('all');
  const [savedGroups, setSavedGroups] = useState<SavedUidGroup[]>([]);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // ===================== TAB 2: RANDOM FACE =====================
  const [currentFaceUrl, setCurrentFaceUrl] = useState<string>('/api/random-face');
  const [isFaceLoading, setIsFaceLoading] = useState(false);
  const [faceHistory, setFaceHistory] = useState<FaceItem[]>([]);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);

  // Khởi tạo từ LocalStorage (Ghi nhớ UID tự động)
  useEffect(() => {
    try {
      const savedInput = localStorage.getItem(STORAGE_KEYS.CURRENT_INPUT);
      if (savedInput) setRawInput(savedInput);

      const savedGroupsData = localStorage.getItem(STORAGE_KEYS.SAVED_GROUPS);
      if (savedGroupsData) setSavedGroups(JSON.parse(savedGroupsData));

      const savedResultsData = localStorage.getItem(STORAGE_KEYS.LAST_RESULTS);
      if (savedResultsData) setResults(JSON.parse(savedResultsData));
    } catch (e) {
      console.error('Lỗi nạp localStorage:', e);
    }
  }, []);

  // Tự động lưu input khi người dùng gõ
  const handleInputChange = (val: string) => {
    setRawInput(val);
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_INPUT, val);
    } catch {}
  };

  // Sao chép kèm thông báo
  const triggerCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  // Bắt đầu Check UID
  const handleCheckUids = async () => {
    const lines = rawInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      alert('Vui lòng dán danh sách UID vào ô văn bản trước!');
      return;
    }

    setIsChecking(true);
    try {
      const res = await fetch('/api/check-uid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uids: lines,
          token: accessToken.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi kiểm tra UID');
      }

      setResults(data.results || []);
      localStorage.setItem(STORAGE_KEYS.LAST_RESULTS, JSON.stringify(data.results || []));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi kiểm tra UID');
    } finally {
      setIsChecking(false);
    }
  };

  // Lưu nhóm UID vào danh bạ
  const handleSaveGroup = () => {
    if (!groupNameInput.trim()) {
      alert('Vui lòng đặt tên cho danh sách này!');
      return;
    }
    const newGroup: SavedUidGroup = {
      id: `group_${Date.now()}`,
      name: groupNameInput.trim(),
      uids: rawInput,
      createdAt: Date.now(),
    };
    const updated = [newGroup, ...savedGroups];
    setSavedGroups(updated);
    localStorage.setItem(STORAGE_KEYS.SAVED_GROUPS, JSON.stringify(updated));
    setGroupNameInput('');
    setShowSaveModal(false);
    triggerCopy('', `Đã lưu danh sách "${newGroup.name}"!`);
  };

  const handleDeleteGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedGroups.filter((g) => g.id !== id);
    setSavedGroups(updated);
    localStorage.setItem(STORAGE_KEYS.SAVED_GROUPS, JSON.stringify(updated));
  };

  const handleLoadGroup = (group: SavedUidGroup) => {
    handleInputChange(group.uids);
    triggerCopy('', `Đã tải lại "${group.name}"`);
  };

  // Lọc kết quả
  const liveList = results.filter((r) => r.status === 'live');
  const dieList = results.filter((r) => r.status === 'die');
  const filteredResults =
    filterMode === 'live' ? liveList : filterMode === 'die' ? dieList : results;

  // Xuất file .txt
  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===================== LOGIC FACE GENERATOR =====================
  const loadNewFace = () => {
    setIsFaceLoading(true);
    const newUrl = `/api/random-face?t=${Date.now()}_${Math.random()}`;
    const img = new Image();
    img.src = newUrl;
    img.onload = () => {
      setCurrentFaceUrl(newUrl);
      setIsFaceLoading(false);
      setFaceHistory((prev) => [
        { id: `face_${Date.now()}`, url: newUrl, timestamp: Date.now() },
        ...prev.slice(0, 11),
      ]);
    };
    img.onerror = () => {
      setIsFaceLoading(false);
      alert('Không thể kết nối tải ảnh mới, vui lòng thử lại!');
    };
  };

  // Tự động xoay mặt sau mỗi 5 giây nếu bật
  useEffect(() => {
    if (!autoRotate || activeTab !== 'face') return;
    const interval = setInterval(loadNewFace, 5000);
    return () => clearInterval(interval);
  }, [autoRotate, activeTab]);

  // Tải trực tiếp 1 ảnh về máy
  const downloadCurrentFace = async (urlToDownload?: string) => {
    const target = urlToDownload || currentFaceUrl;
    const downloadUrl = target.includes('?')
      ? `${target}&download=1`
      : `${target}?download=1`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `face_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Tải hàng loạt ảnh thành file .ZIP
  const handleBatchDownload = async (count: number) => {
    setIsBatchDownloading(true);
    setBatchProgress({ current: 0, total: count });

    try {
      const zip = new JSZip();
      for (let i = 1; i <= count; i++) {
        setBatchProgress({ current: i, total: count });
        const res = await fetch(`/api/random-face?json=1&t=${Date.now()}_${i}`);
        const data = await res.json();
        if (data.base64) {
          zip.file(`face_ai_${i}.jpg`, data.base64, { base64: true });
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faces_ai_pack_${count}_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert('Lỗi tải gói ảnh: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsBatchDownloading(false);
      setBatchProgress(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-6">
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-pink-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                FB Toolkit Pro
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                v1.0
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Check Live UID (Nhớ tự động) · Lấy mã 2FA đếm ngược · Tải ảnh mặt AI
            </p>
          </div>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex items-center p-1 bg-black/40 border border-white/10 rounded-xl self-start sm:self-auto flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('uid')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'uid'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Check Live UID</span>
          </button>
          <button
            onClick={() => setActiveTab('2fa')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === '2fa'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Get Code 2FA</span>
          </button>
          <button
            onClick={() => setActiveTab('face')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'face'
                ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Tải Ảnh Mặt AI</span>
          </button>
        </div>
      </header>

      {/* THÔNG BÁO COPIED TOAST */}
      {copyFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 font-medium text-sm animate-bounce">
          <Check className="w-4 h-4" />
          <span>{copyFeedback}</span>
        </div>
      )}

      {/* ===================== TAB 1: CHECK LIVE UID ===================== */}
      {activeTab === 'uid' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI: NHẬP UID & CÔNG CỤ */}
          <div className="lg:col-span-5 space-y-4">
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    Nhập danh sách UID
                  </span>
                  <span className="text-xs text-slate-400 font-normal">
                    ({rawInput.split('\n').filter((l) => l.trim()).length} dòng)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleInputChange(SAMPLE_UIDS)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-cyan-300 hover:bg-white/10 transition"
                  >
                    Dán mẫu
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Bạn có chắc muốn xóa trắng ô nhập?')) {
                        handleInputChange('');
                        setResults([]);
                      }
                    }}
                    className="text-xs p-1.5 rounded-lg text-slate-400 hover:text-rose-400 transition"
                    title="Xóa trắng"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Ô nhập nhớ tự động */}
              <div className="relative">
                <textarea
                  value={rawInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={`Dán danh sách UID vào đây (Mỗi dòng 1 UID)...
Hỗ trợ định dạng:
1000123456789
https://facebook.com/1000123456789
1000123456789|MatKhau|2FA|Cookie...`}
                  rows={9}
                  className="w-full glass-input p-3.5 rounded-xl text-sm font-mono text-slate-200 placeholder-slate-500 focus:outline-none resize-y"
                />
              </div>

              {/* Tùy chọn Access Token */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowTokenSettings(!showTokenSettings)}
                  className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 transition font-medium"
                >
                  <Key className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {showTokenSettings
                      ? '▲ Thu gọn cài đặt Token'
                      : '🔑 Thêm Access Token (Tùy chọn - Check 100% qua Graph API)'}
                  </span>
                </button>

                {showTokenSettings && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-300 font-semibold">
                        Token Facebook (EAAB / EAAG / EAAA...):
                      </label>
                      {accessToken && (
                        <button
                          onClick={() => setAccessToken('')}
                          className="text-[10px] text-rose-400 hover:underline"
                        >
                          Xóa token
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="Dán token EAAB... vào đây để check tên & checkpoint chuẩn 100%"
                      className="w-full glass-input px-3 py-2 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400">
                      💡 Mặc định không cần token: Hệ thống dùng cơ chế kép (OpenGraph Crawler + Avatar CDN) lọc sạch 100% tài khoản ảo/die.
                    </p>
                  </div>
                )}
              </div>

              {/* Ghi nhớ UID tự động Notification */}
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-2.5 text-xs text-cyan-200">
                <Bookmark className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
                <span>
                  <b>Tự động nhớ UID:</b> Danh sách được lưu trực tiếp vào máy. Lần sau bạn quay lại không bao giờ sợ mất hay phải gõ lại!
                </span>
              </div>

              {/* Nút hành động */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleCheckUids}
                  disabled={isChecking || !rawInput.trim()}
                  className="btn-primary w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang kiểm tra kết nối FB...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Bắt đầu Kiểm Tra Live</span>
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowSaveModal(true)}
                    disabled={!rawInput.trim()}
                    className="py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-pink-400" />
                    <span>Lưu thành nhóm</span>
                  </button>

                  <button
                    onClick={() => {
                      const uids = rawInput.split('\n').filter(Boolean).join('\n');
                      downloadTextFile(uids, `danh_sach_uid_${Date.now()}.txt`);
                    }}
                    disabled={!rawInput.trim()}
                    className="py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tải file .txt</span>
                  </button>
                </div>
              </div>
            </div>

            {/* DANH SÁCH NHÓM ĐÃ LƯU */}
            {savedGroups.length > 0 && (
              <div className="glass-panel p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Nhóm UID đã lưu ({savedGroups.length})</span>
                  </span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {savedGroups.map((group) => (
                    <div
                      key={group.id}
                      onClick={() => handleLoadGroup(group)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between cursor-pointer transition group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300">
                          {group.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {group.uids.split('\n').filter(Boolean).length} UID ·{' '}
                          {new Date(group.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleDeleteGroup(group.id, e)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Xóa nhóm này"
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

          {/* CỘT PHẢI: KẾT QUẢ CHECK */}
          <div className="lg:col-span-7 space-y-4">
            {/* THỐNG KÊ SUMMARY */}
            <div className="grid grid-cols-3 gap-3">
              <div
                onClick={() => setFilterMode('all')}
                className={`glass-panel p-3.5 rounded-2xl cursor-pointer transition border ${
                  filterMode === 'all'
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-lg'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <p className="text-xs font-semibold text-slate-400">Tổng kiểm tra</p>
                <p className="text-2xl font-black text-white mt-0.5">{results.length}</p>
              </div>

              <div
                onClick={() => setFilterMode('live')}
                className={`glass-panel p-3.5 rounded-2xl cursor-pointer transition border ${
                  filterMode === 'live'
                    ? 'border-emerald-400 bg-emerald-500/15 shadow-lg'
                    : 'border-white/10 hover:border-emerald-400/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-400">Tài khoản LIVE</p>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 live-badge" />
                </div>
                <p className="text-2xl font-black text-emerald-300 mt-0.5">{liveList.length}</p>
              </div>

              <div
                onClick={() => setFilterMode('die')}
                className={`glass-panel p-3.5 rounded-2xl cursor-pointer transition border ${
                  filterMode === 'die'
                    ? 'border-rose-400 bg-rose-500/15 shadow-lg'
                    : 'border-white/10 hover:border-rose-400/40'
                }`}
              >
                <p className="text-xs font-semibold text-rose-400">Tài khoản DIE</p>
                <p className="text-2xl font-black text-rose-300 mt-0.5">{dieList.length}</p>
              </div>
            </div>

            {/* THANH CÔNG CỤ COPY & EXPORT */}
            {results.length > 0 && (
              <div className="glass-panel p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Đang lọc:</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white/10 text-white uppercase">
                    {filterMode === 'all'
                      ? 'Tất cả'
                      : filterMode === 'live'
                      ? 'Chỉ Live'
                      : 'Chỉ Die'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {liveList.length > 0 && (
                    <button
                      onClick={() =>
                        triggerCopy(
                          liveList.map((i) => i.uid).join('\n'),
                          `Đã copy ${liveList.length} UID LIVE!`
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy {liveList.length} LIVE</span>
                    </button>
                  )}

                  {dieList.length > 0 && (
                    <button
                      onClick={() =>
                        triggerCopy(
                          dieList.map((i) => i.uid).join('\n'),
                          `Đã copy ${dieList.length} UID DIE!`
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy {dieList.length} DIE</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      const text = filteredResults
                        .map((r) => `${r.uid}|${r.status.toUpperCase()}`)
                        .join('\n');
                      downloadTextFile(text, `ket_qua_uid_${filterMode}_${Date.now()}.txt`);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3 h-3" />
                    <span>Xuất file</span>
                  </button>
                </div>
              </div>
            )}

            {/* DANH SÁCH KẾT QUẢ */}
            <div className="glass-panel p-4 rounded-2xl space-y-2">
              {results.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400">
                  <Users className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-medium">Chưa có kết quả kiểm tra</p>
                  <p className="text-xs text-slate-500">
                    Dán UID vào cột bên trái và bấm &quot;Bắt đầu Kiểm Tra Live&quot;
                  </p>
                </div>
              ) : filteredResults.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  Không có UID nào phù hợp với bộ lọc &quot;{filterMode}&quot;.
                </div>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {filteredResults.map((item, idx) => (
                    <div
                      key={`${item.uid}_${idx}`}
                      className="p-3 rounded-xl bg-black/30 hover:bg-black/50 border border-white/5 flex items-center justify-between gap-3 transition"
                    >
                      {/* Avatar & UID Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        {item.status === 'live' && item.avatar ? (
                          <img
                            src={item.avatar}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border border-emerald-400/40 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                              item.status === 'live'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {item.status === 'live' ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <XCircle className="w-5 h-5" />
                            )}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white select-all">
                              {item.uid}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                item.status === 'live'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {item.status === 'live' ? 'LIVE' : 'DIE'}
                            </span>
                          </div>
                          {item.name && item.name !== item.uid && (
                            <p className="text-xs font-semibold text-cyan-300 truncate mt-0.5">
                              {item.name}
                            </p>
                          )}
                          {item.message && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => triggerCopy(item.uid, `Đã copy UID ${item.uid}`)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
                          title="Sao chép UID"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`https://facebook.com/${item.uid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 transition"
                          title="Mở trang cá nhân trên Facebook"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: GET CODE 2FA ===================== */}
      {activeTab === '2fa' && <TwoFactorAuth />}

      {/* ===================== TAB 3: TẢI ẢNH MẶT AI ===================== */}
      {activeTab === 'face' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI: ẢNH HIỆN TẠI (KÉO & TẢI 1-CLICK) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="glass-panel p-6 rounded-3xl space-y-5 text-center">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>Khuôn mặt AI ngẫu nhiên</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Nguồn: ThisPersonDoesNotExist
                </span>
              </div>

              {/* KHUNG ẢNH CHÍNH (HỖ TRỢ KÉO THẢ TRỰC TIẾP) */}
              <div className="relative mx-auto w-full max-w-md aspect-square rounded-2xl overflow-hidden border-2 border-white/15 bg-black/60 shadow-2xl group">
                <img
                  src={currentFaceUrl}
                  alt="Random Person Does Not Exist"
                  draggable={true}
                  className={`w-full h-full object-cover transition-all duration-300 ${
                    isFaceLoading ? 'scale-95 opacity-50 blur-sm' : 'scale-100 opacity-100'
                  }`}
                />

                {isFaceLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm text-white">
                    <RefreshCw className="w-8 h-8 animate-spin text-pink-400" />
                    <span className="text-xs font-semibold">Đang sinh khuôn mặt mới...</span>
                  </div>
                )}

                {/* Hướng dẫn kéo ảnh */}
                <div className="absolute bottom-3 inset-x-3 py-2 px-3 rounded-xl bg-black/75 backdrop-blur-md text-white/90 text-xs font-medium border border-white/10 opacity-90 group-hover:opacity-100 transition pointer-events-none">
                  💡 Bạn có thể <b>kéo ảnh này thả trực tiếp</b> ra Desktop/Thư mục, hoặc bấm nút &quot;Tải về máy&quot; bên dưới!
                </div>
              </div>

              {/* BỘ NÚT ĐIỀU KHIỂN CHÍNH */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                <button
                  onClick={() => downloadCurrentFace()}
                  className="btn-primary py-3.5 px-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải ảnh này về máy</span>
                </button>

                <button
                  onClick={loadNewFace}
                  disabled={isFaceLoading}
                  className="py-3.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 font-bold text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isFaceLoading ? 'animate-spin' : ''}`} />
                  <span>Đổi mặt khác ngay</span>
                </button>
              </div>

              {/* TỰ ĐỘNG ĐỔI MẶT TOGGLE */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRotate}
                    onChange={(e) => setAutoRotate(e.target.checked)}
                    className="w-4 h-4 rounded text-pink-500 focus:ring-0 bg-white/10 border-white/20"
                  />
                  <span>Tự động đổi mặt mới sau mỗi 5 giây</span>
                </label>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TẢI NHANH HÀNG LOẠT (ZIP) & LỊCH SỬ KHUÔN MẶT */}
          <div className="lg:col-span-5 space-y-4">
            {/* TẢI GÓI ZIP NHANH */}
            <div className="glass-panel p-5 rounded-3xl space-y-4">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Tải gói nhiều ảnh (File .ZIP)
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tự động tải liên tục nhiều khuôn mặt AI khác nhau và nén sẵn vào 1 file ZIP để bạn giải nén dùng ngay.
              </p>

              {isBatchDownloading ? (
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-pink-400 mx-auto" />
                  <p className="text-xs font-semibold text-white">
                    Đang tạo và tải ảnh {batchProgress?.current}/{batchProgress?.total}...
                  </p>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-pink-500 to-cyan-500 h-full transition-all duration-300"
                      style={{
                        width: `${
                          batchProgress
                            ? (batchProgress.current / batchProgress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleBatchDownload(5)}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white flex flex-col items-center gap-1.5 transition active:scale-95"
                  >
                    <Layers className="w-5 h-5 text-pink-400" />
                    <span>Tải nhanh 5 ảnh</span>
                  </button>

                  <button
                    onClick={() => handleBatchDownload(10)}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white flex flex-col items-center gap-1.5 transition active:scale-95"
                  >
                    <Layers className="w-5 h-5 text-cyan-400" />
                    <span>Tải nhanh 10 ảnh</span>
                  </button>
                </div>
              )}
            </div>

            {/* BỘ SƯU TẬP ẢNH ĐÃ XEM VỪA QUA */}
            <div className="glass-panel p-5 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                  <span>Ảnh vừa tạo gần đây</span>
                </h3>
                <span className="text-[11px] text-slate-500">Bấm để xem/tải lại</span>
              </div>

              {faceHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Bấm &quot;Đổi mặt khác ngay&quot; để tạo danh sách ảnh lưu ở đây!
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {faceHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => downloadCurrentFace(item.url)}
                      className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 cursor-pointer hover:border-pink-400/80 transition"
                      title="Bấm để tải ảnh này về"
                    >
                      <img
                        src={item.url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white">
                        <Download className="w-5 h-5 text-pink-300 drop-shadow" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPUP LƯU NHÓM UID */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-3xl p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Lưu nhóm UID</h3>
            <p className="text-xs text-slate-400">
              Đặt tên để lần sau bạn chỉ cần 1 click là nạp lại toàn bộ danh sách này:
            </p>
            <input
              type="text"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="VD: Nick nuôi dàn 1, Clone đợt 2..."
              autoFocus
              className="w-full glass-input p-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveGroup}
                className="btn-primary px-4 py-2 rounded-xl text-xs font-bold text-white"
              >
                Lưu ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
