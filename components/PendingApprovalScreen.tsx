import React from 'react';
import { ChevronLeftIcon } from './icons';

interface PendingApprovalScreenProps {
  onBackToRoleSelection: () => void;
}

const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({ onBackToRoleSelection }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-10 space-y-6 bg-white rounded-2xl shadow-lg text-center">
        <h1 className="text-3xl font-bold text-yellow-600">
          Tài khoản đang chờ duyệt
        </h1>
        <p className="mt-4 text-gray-700">
          Tài khoản Giáo viên của bạn đang chờ Quản trị viên phê duyệt. Vui lòng quay lại sau.
        </p>
        
        <div className="pt-8">
            <button
                type="button"
                onClick={(e) => { e.preventDefault(); onBackToRoleSelection(); }}
                className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
                <ChevronLeftIcon /> <span className="ml-2">Quay lại chọn vai trò</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalScreen;
