'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Building2, Loader2, X } from 'lucide-react';

interface BranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
}

export function BranchModal({ isOpen, onClose, onSuccess, initialData }: BranchModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setName(initialData.name || '');
      setAddress(initialData.address || '');
      setPhone(initialData.phone || '');
    } else {
      setCode('');
      setName('');
      setAddress('');
      setPhone('');
    }
    setErrorMessage('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        code,
        name,
        address: address || undefined,
        phone: phone || undefined,
      };

      const url = isEdit ? `/api/v1/branches/${initialData.id}` : '/api/v1/branches';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Khong the luu chi nhanh.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Loi ket noi mang.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="relative w-full max-w-lg border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col text-sm">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 text-sky-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEdit ? 'Chinh Sua Chi Nhanh' : 'Tao Chi Nhanh Moi'}
              </h2>
              <p className="text-xs text-slate-400">
                Quan ly danh muc chi nhanh trong pham vi to chuc hien tai.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Ma Chi Nhanh *</label>
              <input
                type="text"
                required
                placeholder="HN-01"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white font-mono uppercase focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Ten Chi Nhanh *</label>
              <input
                type="text"
                required
                placeholder="Chi nhanh Ha Noi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Dia Chi</label>
            <textarea
              rows={2}
              placeholder="Dia chi van phong/chi nhanh"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">So Dien Thoai</label>
            <input
              type="text"
              placeholder="024..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[11px] leading-relaxed text-slate-400">
            Trang thai chi nhanh duoc dieu khien bang nut kich hoat/ngung hoat dong rieng. Chi nhanh da xoa mem khong duoc hien thi va ma chi nhanh van duoc giu lai.
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading} className="border-slate-700">
              Huy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-sky-600 hover:bg-sky-500 text-white font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" /> Dang luu...
                </span>
              ) : isEdit ? (
                'Luu Cap Nhat'
              ) : (
                'Tao Chi Nhanh'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
