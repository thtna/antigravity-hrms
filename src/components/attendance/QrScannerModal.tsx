'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  QrCode,
  Camera,
  Upload,
  Keyboard,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QrScannerModal({ isOpen, onClose, onSuccess }: QrScannerModalProps) {
  const [scanTab, setScanTab] = useState<'CAMERA' | 'UPLOAD' | 'MANUAL'>('CAMERA');
  const [action, setAction] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT'>('AUTO');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState<any | null>(null);

  // Manual input
  const [manualPayload, setManualPayload] = useState('');
  const [notes, setNotes] = useState('');

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const handleScanSuccess = useCallback(async (payload: string) => {
    if (loading) return;
    setLoading(true);
    setErrorMessage('');
    setSuccessResult(null);

    try {
      const body: any = {
        qrPayload: payload.trim(),
        notes: notes.trim() || undefined,
      };
      if (action !== 'AUTO') {
        body.action = action;
      }

      const res = await fetch('/api/v1/attendance/qr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Quét mã QR thất bại.');
        setLoading(false);
        return;
      }

      setSuccessResult(data.data);
      onSuccess();
      stopCamera();
    } catch {
      setErrorMessage('Lỗi kết nối mạng khi gửi mã QR.');
    } finally {
      setLoading(false);
    }
  }, [action, notes, loading, onSuccess, stopCamera]);

  const tickRef = useRef<() => void>(() => {});

  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleScanSuccess(code.data);
          return; // Stop loop on hit
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(() => tickRef.current());
  }, [handleScanSuccess]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
          animationFrameRef.current = requestAnimationFrame(() => tickRef.current());
        }
      } else {
        setCameraError('Trình duyệt không hỗ trợ truy cập camera trực tiếp.');
        setScanTab('MANUAL');
      }
    } catch {
      setCameraError('Không thể mở camera. Vui lòng cấp quyền hoặc sử dụng cách Tải ảnh / Nhập mã.');
      setScanTab('MANUAL');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessResult(null);
      if (scanTab === 'CAMERA') {
        startCamera();
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, scanTab, startCamera, stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          handleScanSuccess(code.data);
        } else {
          setErrorMessage('Không tìm thấy mã QR trong hình ảnh tải lên. Vui lòng thử ảnh khác.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-lg border-slate-800 bg-slate-900 text-slate-100 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Quét Mã QR Chấm Công
                <Sparkles className="h-4 w-4 text-amber-400" />
              </h2>
              <p className="text-xs text-slate-400">Mã QR động xoay vòng an toàn — Chống chụp ảnh phát lại</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Mode Toggle */}
        <div className="px-6 pt-4">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Thao tác mong muốn:
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAction('AUTO')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                action === 'AUTO'
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tự Động (Auto)
            </button>
            <button
              type="button"
              onClick={() => setAction('CHECK_IN')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                action === 'CHECK_IN'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              Vào Ca (Check-In)
            </button>
            <button
              type="button"
              onClick={() => setAction('CHECK_OUT')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                action === 'CHECK_OUT'
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tan Ca (Check-Out)
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 px-6 pt-3 gap-4">
          <button
            onClick={() => {
              setScanTab('CAMERA');
              startCamera();
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              scanTab === 'CAMERA'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera Quét Trực Tiếp
          </button>
          <button
            onClick={() => {
              setScanTab('UPLOAD');
              stopCamera();
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              scanTab === 'UPLOAD'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Tải Ảnh Chụp QR
          </button>
          <button
            onClick={() => {
              setScanTab('MANUAL');
              stopCamera();
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              scanTab === 'MANUAL'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Nhập Mã / Test Payload
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successResult && (
          <div className="mx-6 mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Chấm công bằng mã QR thành công!
            </div>
            <div className="text-xs text-slate-300 space-y-1 pt-1">
              <div>Thao tác: <Badge variant="success">{successResult.action === 'CHECK_IN' ? 'Check-in (Vào ca)' : 'Check-out (Tan ca)'}</Badge></div>
              <div>Nhân viên: <strong className="text-white">{successResult.employee?.fullName}</strong> ({successResult.employee?.employeeCode})</div>
              <div>Thời gian: <span className="font-mono text-emerald-300">{new Date(successResult.scannedAt).toLocaleTimeString('vi-VN')}</span></div>
              {successResult.attendance?.actualWorkHours > 0 && (
                <div>Giờ làm việc: <strong className="text-white font-mono">{successResult.attendance.actualWorkHours}h</strong></div>
              )}
            </div>
          </div>
        )}

        {/* Scanner Content */}
        <div className="p-6">
          {scanTab === 'CAMERA' && (
            <div className="space-y-4">
              <div className="relative aspect-square w-full max-w-[320px] mx-auto overflow-hidden rounded-2xl border-2 border-dashed border-blue-500/40 bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Laser scan animation line */}
                {cameraActive && (
                  <div className="absolute inset-x-4 top-1/2 h-0.5 bg-blue-400/80 shadow-[0_0_12px_#38bdf8] animate-bounce" />
                )}

                {!cameraActive && (
                  <div className="text-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Đang khởi động camera...</p>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="text-xs text-amber-400 text-center">{cameraError}</p>
              )}

              <p className="text-center text-xs text-slate-400">
                Hướng camera về phía mã QR đang xoay vòng trên màn hình Kiosk sảnh văn phòng.
              </p>
            </div>
          )}

          {scanTab === 'UPLOAD' && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-2xl p-8 cursor-pointer bg-slate-950/60 transition-colors">
                <Upload className="h-10 w-10 text-blue-400 mb-2" />
                <span className="text-sm font-semibold text-white">Bấm để chọn tệp hình ảnh mã QR</span>
                <span className="text-xs text-slate-400 mt-1">Hỗ trợ PNG, JPG, JPEG</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {scanTab === 'MANUAL' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mã Token QR hoặc Payload JSON <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={manualPayload}
                  onChange={(e) => setManualPayload(e.target.value)}
                  placeholder='Dán chuỗi mã QR hoặc JSON payload {"v":"1","code":"...","sig":"..."}'
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ghi chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: Quét tại sảnh tầng 1..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <Button
                type="button"
                disabled={loading || !manualPayload.trim()}
                onClick={() => handleScanSuccess(manualPayload)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác Nhận Chấm Công Bằng Mã QR
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            Mã QR hợp lệ trong 30 giây
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-slate-700 bg-slate-800 text-slate-300"
          >
            Đóng
          </Button>
        </div>
      </Card>
    </div>
  );
}
