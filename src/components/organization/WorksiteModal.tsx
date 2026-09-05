'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  Loader2,
  AlertCircle,
  MapPin,
  Navigation,
  CheckCircle2,
  Building,
} from 'lucide-react';

interface WorksiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
}

const PRESET_LOCATIONS = [
  {
    label: 'TP. Hồ Chí Minh (Quận 1)',
    lat: 10.776889,
    lng: 106.700806,
    address: 'Tầng 18, Tòa nhà Antigravity, Quận 1, TP. Hồ Chí Minh',
  },
  {
    label: 'Hà Nội (Hoàn Kiếm)',
    lat: 21.028511,
    lng: 105.854167,
    address: 'Số 12 Tràng Tiền, Quận Hoàn Kiếm, TP. Hà Nội',
  },
  {
    label: 'Đà Nẵng (Hải Châu)',
    lat: 16.054407,
    lng: 108.202167,
    address: 'Tòa nhà F-Complex, Quận Hải Châu, TP. Đà Nẵng',
  },
];

export function WorksiteModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: WorksiteModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [loading, setLoading] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gpsSuccessMessage, setGpsSuccessMessage] = useState('');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [radiusMeters, setRadiusMeters] = useState<number>(100);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setAddress(initialData.address || '');
      setLatitude(initialData.latitude !== undefined ? String(initialData.latitude) : '');
      setLongitude(initialData.longitude !== undefined ? String(initialData.longitude) : '');
      setRadiusMeters(initialData.radiusMeters || 100);
      setIsActive(initialData.isActive ?? true);
    } else {
      setName('');
      setAddress('');
      setLatitude('10.776889');
      setLongitude('106.700806');
      setRadiusMeters(100);
      setIsActive(true);
    }
    setErrorMessage('');
    setGpsSuccessMessage('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  // Browser Geolocation auto-detection
  const handleDetectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Trình duyệt của bạn không hỗ trợ Geolocation.');
      return;
    }

    setDetectingGps(true);
    setErrorMessage('');
    setGpsSuccessMessage('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setGpsSuccessMessage(
          `Đã lấy tọa độ thực tế thành công (Độ chính xác: ±${Math.round(position.coords.accuracy)}m)`
        );
        setDetectingGps(false);
      },
      (error) => {
        setDetectingGps(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage('Bạn đã từ chối quyền truy cập vị trí trên trình duyệt.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErrorMessage('Không thể xác định vị trí hiện tại của thiết bị.');
        } else {
          setErrorMessage('Hết thời gian chờ lấy tín hiệu vị trí GPS.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleApplyPreset = (preset: (typeof PRESET_LOCATIONS)[0]) => {
    setLatitude(String(preset.lat));
    setLongitude(String(preset.lng));
    if (!address) setAddress(preset.address);
    setGpsSuccessMessage(`Đã áp dụng tọa độ mẫu: ${preset.label}`);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);

      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        throw new Error('Vĩ độ (Latitude) phải là số từ -90 đến 90.');
      }
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        throw new Error('Kinh độ (Longitude) phải là số từ -180 đến 180.');
      }

      const payload = {
        name: name.trim(),
        address: address.trim(),
        latitude: latNum,
        longitude: lngNum,
        radiusMeters: Number(radiusMeters),
        isActive,
      };

      const url = isEdit ? `/api/v1/worksites/${initialData.id}` : '/api/v1/worksites';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Có lỗi xảy ra khi lưu địa điểm.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="relative w-full max-w-xl bg-slate-900 border-slate-800 text-slate-100 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">
                {isEdit ? 'Cập Nhật Địa Điểm Làm Việc' : 'Thêm Địa Điểm Làm Việc Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                Cấu hình tọa độ GPS và bán kính Geofencing cho chấm công
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {gpsSuccessMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{gpsSuccessMessage}</span>
            </div>
          )}

          {/* Worksite Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tên Địa Điểm Làm Việc <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Trụ sở chính — Antigravity Tower"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Địa Chỉ Chi Tiết <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="VD: Tầng 18, Tòa nhà Antigravity, Quận 1, TP. Hồ Chí Minh"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* GPS Coordinate Helper */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                Tọa độ GPS (WGS84)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDetectCurrentLocation}
                disabled={detectingGps}
                className="h-7 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
              >
                {detectingGps ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Đang quét GPS...
                  </>
                ) : (
                  <>
                    <Navigation className="w-3 h-3 mr-1" />
                    Lấy GPS hiện tại của tôi
                  </>
                )}
              </Button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-slate-500 mr-1">Mẫu nhanh:</span>
              {PRESET_LOCATIONS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="px-2 py-0.5 rounded bg-slate-850 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-750 transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Vĩ độ (Latitude) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="10.776889"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Kinh độ (Longitude) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="106.700806"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Radius Configuration */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                Bán Kính Geofence Cho Phép: <span className="text-cyan-400 font-bold">{radiusMeters} mét</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {radiusMeters <= 50
                  ? 'Chặt chẽ (Văn phòng nhỏ)'
                  : radiusMeters <= 100
                  ? 'Tiêu chuẩn (Tòa nhà)'
                  : radiusMeters <= 250
                  ? 'Khu phức hợp'
                  : 'Công trường / Nhà máy rộng'}
              </span>
            </div>

            <input
              type="range"
              min="20"
              max="1000"
              step="10"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />

            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>20m</span>
              <span>100m</span>
              <span>250m</span>
              <span>500m</span>
              <span>1000m</span>
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="worksiteActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="worksiteActive" className="text-xs text-slate-300 cursor-pointer select-none">
              Địa điểm đang hoạt động (Cho phép nhân viên chấm công GPS tại đây)
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Đang lưu...
                </>
              ) : isEdit ? (
                'Lưu Thay Đổi'
              ) : (
                'Tạo Địa Điểm'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
