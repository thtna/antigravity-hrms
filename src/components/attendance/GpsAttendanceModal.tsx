'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Navigation,
  RefreshCw,
  Building,
  ShieldCheck,
  Compass,
  Radio,
  Clock,
} from 'lucide-react';

interface GpsAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

type GpsStatus = 'IDLE' | 'ACQUIRING' | 'VERIFYING' | 'READY' | 'ERROR';

export function GpsAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
}: GpsAttendanceModalProps) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorGuidance, setErrorGuidance] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Raw client GPS coordinates
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);

  // Server pre-verification result
  const [verification, setVerification] = useState<any | null>(null);
  const [notes, setNotes] = useState('');

  // Auto-detect action (default CHECK_IN or user selected)
  const [action, setAction] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT'>('AUTO');

  // Trigger GPS acquisition
  const acquireLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('ERROR');
      setErrorMessage('Trình duyệt của bạn không hỗ trợ Geolocation.');
      setErrorGuidance('Vui lòng sử dụng các trình duyệt hiện đại như Google Chrome, Firefox, Safari hoặc Edge.');
      return;
    }

    setGpsStatus('ACQUIRING');
    setErrorMessage('');
    setErrorGuidance('');
    setVerification(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const clientCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy * 10) / 10,
        };
        setCoords(clientCoords);
        setGpsStatus('VERIFYING');

        // Server-side pre-verification
        try {
          const res = await fetch('/api/v1/attendance/gps/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientCoords),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            setGpsStatus('ERROR');
            setErrorMessage(data.error?.message || 'Không thể xác thực vị trí với máy chủ.');
            return;
          }

          setVerification(data.data);
          setGpsStatus('READY');
        } catch (err: any) {
          setGpsStatus('ERROR');
          setErrorMessage('Lỗi mạng hoặc không thể kết nối tới máy chủ xác thực.');
        }
      },
      (error) => {
        setGpsStatus('ERROR');
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage('Quyền truy cập vị trí đã bị từ chối.');
          setErrorGuidance(
            'Nhấn vào biểu tượng ổ khóa/vị trí trên thanh địa chỉ trình duyệt, chuyển quyền Vị trí thành "Cho phép", sau đó nhấn "Thử lại".'
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErrorMessage('Không thể xác định vị trí thiết bị (Tín hiệu GPS yếu hoặc mất kết nối).');
          setErrorGuidance('Vui lòng kiểm tra cài đặt Định vị của hệ điều hành hoặc di chuyển ra gần cửa sổ.');
        } else if (error.code === error.TIMEOUT) {
          setErrorMessage('Hết thời gian chờ phản hồi GPS (Timeout).');
          setErrorGuidance('Vui lòng nhấn nút "Thử lại" bên dưới.');
        } else {
          setErrorMessage('Không thể lấy tọa độ vị trí.');
          setErrorGuidance('Vui lòng thử lại.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  useEffect(() => {
    if (isOpen) {
      acquireLocation();
    } else {
      setGpsStatus('IDLE');
      setCoords(null);
      setVerification(null);
      setErrorMessage('');
      setErrorGuidance('');
      setNotes('');
    }
  }, [isOpen, acquireLocation]);

  if (!isOpen) return null;

  // Execute GPS Check-In / Check-Out
  const handleExecuteAttendance = async (selectedAction?: 'CHECK_IN' | 'CHECK_OUT') => {
    if (!coords || !verification) return;

    setSubmitting(true);
    setErrorMessage('');
    setErrorGuidance('');

    try {
      const payload = {
        action: selectedAction || (action === 'AUTO' ? undefined : action),
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        worksiteId: verification.worksite?.id,
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/v1/attendance/gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Không thể thực hiện chấm công GPS.');
      }

      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Có lỗi xảy ra khi chấm công.');
    } finally {
      setSubmitting(false);
    }
  };

  const isWithinGeofence = verification?.isWithinRadius;
  const isAccuracyAcceptable = verification?.isAccuracyValid;
  const canSubmit = verification?.canAttend && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <Card className="relative w-full max-w-lg bg-slate-900 border-slate-800 text-slate-100 shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner">
              <Radio className="w-5 h-5 animate-pulse text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white flex items-center gap-2">
                Chấm Công GPS
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  Geofence Protected
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Xác thực vị trí làm việc thời gian thực qua vệ tinh & trình duyệt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Radar Animation / Status Center */}
          <div className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800/80 overflow-hidden text-center">
            {/* Ambient radar circle pulses */}
            <div className="relative w-28 h-28 flex items-center justify-center mb-3">
              <div
                className={`absolute inset-0 rounded-full border border-cyan-500/20 ${
                  gpsStatus === 'ACQUIRING' || gpsStatus === 'VERIFYING' ? 'animate-ping' : ''
                }`}
              />
              <div className="absolute inset-3 rounded-full border border-cyan-500/30" />
              <div className="absolute inset-7 rounded-full border border-cyan-500/40" />

              {gpsStatus === 'ACQUIRING' || gpsStatus === 'VERIFYING' ? (
                <div className="relative z-10 p-3.5 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 shadow-lg shadow-cyan-500/20">
                  <Compass className="w-8 h-8 animate-spin" />
                </div>
              ) : gpsStatus === 'READY' && isWithinGeofence && isAccuracyAcceptable ? (
                <div className="relative z-10 p-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
              ) : gpsStatus === 'READY' && !isWithinGeofence ? (
                <div className="relative z-10 p-3.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 shadow-lg shadow-amber-500/20">
                  <MapPin className="w-8 h-8" />
                </div>
              ) : (
                <div className="relative z-10 p-3.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-400 shadow-lg shadow-rose-500/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Status Heading */}
            {gpsStatus === 'ACQUIRING' && (
              <>
                <p className="text-sm font-medium text-cyan-300 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tìm kiếm vệ tinh GPS & kết nối mạng...
                </p>
                <p className="text-xs text-slate-500 mt-1">Vui lòng cho phép quyền truy cập vị trí</p>
              </>
            )}

            {gpsStatus === 'VERIFYING' && (
              <>
                <p className="text-sm font-medium text-cyan-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 animate-spin text-cyan-400" />
                  Đang kiểm định tọa độ Geofence với máy chủ...
                </p>
                <p className="text-xs text-slate-500 mt-1">Tính toán khoảng cách Haversine geodesic</p>
              </>
            )}

            {gpsStatus === 'READY' && (
              <>
                {isWithinGeofence && isAccuracyAcceptable ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Vị trí hợp lệ trong khuôn viên làm việc!
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Bạn đang cách tâm {verification.worksite.name}{' '}
                      <span className="text-emerald-300 font-bold">
                        {Math.round(verification.distanceMeters)}m
                      </span>{' '}
                      (Bán kính cho phép: {verification.allowedRadiusMeters}m)
                    </p>
                  </div>
                ) : !isWithinGeofence ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-amber-400 flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Bạn đang ở ngoài khu vực chấm công
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                      Cách {verification.worksite.name}{' '}
                      <span className="text-amber-400 font-bold">
                        {Math.round(verification.distanceMeters)}m
                      </span>{' '}
                      (Vượt quá {Math.round(verification.excessMeters)}m)
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-rose-400 flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Độ chính xác GPS chưa đạt yêu cầu
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{verification.accuracyReason}</p>
                  </div>
                )}
              </>
            )}

            {gpsStatus === 'ERROR' && (
              <div className="text-center">
                <p className="text-sm font-semibold text-rose-400 flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {errorMessage || 'Lỗi định vị vị trí'}
                </p>
                {errorGuidance && <p className="text-xs text-slate-400 mt-1.5">{errorGuidance}</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={acquireLocation}
                  className="mt-3 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  Thử lại
                </Button>
              </div>
            )}
          </div>

          {/* Worksite & Telemetry Details */}
          {verification && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Building className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold text-white">{verification.worksite.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    isWithinGeofence
                      ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                      : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  }
                >
                  {isWithinGeofence ? 'Trong Vùng Cho Phép' : 'Ngoài Vùng Geofence'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>
                  <span className="text-slate-500">Khoảng cách: </span>
                  <span className="font-mono text-white font-medium">
                    {Math.round(verification.distanceMeters)} m
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Bán kính cho phép: </span>
                  <span className="font-mono text-white font-medium">
                    {verification.allowedRadiusMeters} m
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Sai số GPS: </span>
                  <span
                    className={`font-mono font-medium ${
                      isAccuracyAcceptable ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ±{Math.round(verification.accuracyMeters)} m
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Tọa độ: </span>
                  <span className="font-mono text-slate-300">
                    {coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optional Notes */}
          {canSubmit && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Ghi chú chấm công (tùy chọn)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Làm việc tại phòng họp tầng 18"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={acquireLocation}
              disabled={submitting || gpsStatus === 'ACQUIRING' || gpsStatus === 'VERIFYING'}
              className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${
                  gpsStatus === 'ACQUIRING' || gpsStatus === 'VERIFYING' ? 'animate-spin' : ''
                }`}
              />
              Làm mới vị trí
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="border-slate-800 text-slate-400 hover:text-white"
              >
                Đóng
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleExecuteAttendance('CHECK_IN')}
                disabled={!canSubmit}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 shadow-lg shadow-emerald-600/20 disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 mr-1.5" />
                )}
                Check-In (Vào Ca)
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleExecuteAttendance('CHECK_OUT')}
                disabled={!canSubmit}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs px-3 shadow-lg shadow-cyan-600/20 disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 mr-1.5" />
                )}
                Check-Out (Tan Ca)
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
