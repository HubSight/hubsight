import React, { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { AppConfig, AppConfigQRResponse } from '@hubsight/sdk';
import { X, QrCode, Copy, Check, RotateCw, Shield } from '@/components/icons';
import toast from 'react-hot-toast';

interface AppConfigQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig | null;
  qrData: AppConfigQRResponse | null;
  loading: boolean;
  onRefreshQr?: () => void;
}

export const AppConfigQrModal: React.FC<AppConfigQrModalProps> = ({
  isOpen,
  onClose,
  config,
  qrData,
  loading,
  onRefreshQr,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !config) return null;

  const handleCopyLink = () => {
    if (!qrData?.download_url) return;
    navigator.clipboard.writeText(qrData.download_url);
    setCopied(true);
    toast.success(t('clients.copySuccess') || 'Đã sao chép đường dẫn!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shadow-2xs">
              <QrCode size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 leading-tight">
                {t('appConfigs.qrModalTitle') || t('mobileConfigs.qrModalTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {config.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200/80">
          {loading ? (
            <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RotateCw size={32} className="animate-spin text-orange-600" />
              <span className="text-xs font-medium text-slate-500">Đang sinh mã QR an toàn...</span>
            </div>
          ) : qrData?.qr_code_base64 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200">
                <img
                  src={qrData.qr_code_base64}
                  alt="App Config QR"
                  className="w-60 h-60 object-contain rounded-lg"
                />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Mã QR có hiệu lực trong 24 giờ
              </span>
            </div>
          ) : (
            <div className="w-64 h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
              <p className="text-xs text-red-500 font-medium">Không thể tạo mã QR</p>
              {onRefreshQr && (
                <button
                  type="button"
                  onClick={onRefreshQr}
                  className="text-xs text-orange-600 font-semibold hover:underline cursor-pointer"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-orange-50/60 rounded-2xl p-4 border border-orange-100/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-orange-800">
            <Shield size={14} className="text-orange-600" />
            <span>Hướng dẫn nạp cấu hình trên HubSight (Mobile & Desktop):</span>
          </div>
          <ol className="text-xs text-orange-950/80 space-y-1 pl-4 list-decimal leading-relaxed">
            <li>Mở ứng dụng <strong>HubSight</strong> trên điện thoại hoặc máy tính.</li>
            <li>Tại màn hình khởi động, chọn <strong>Quét mã QR / Nạp file cấu hình (.hscfg)</strong>.</li>
            <li>Quét mã hoặc chọn file tải về, sau đó <strong>nhập mã PIN 6 số</strong> bạn đã đặt để giải mã cấu hình.</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
          {qrData?.download_url && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full sm:flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
            >
              {copied ? <Check size={14} className="text-emerald-600 shrink-0" /> : <Copy size={14} className="shrink-0" />}
              <span>{copied ? 'Đã sao chép link' : 'Sao chép link tải'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const MobileConfigQrModal = AppConfigQrModal;
export default AppConfigQrModal;
