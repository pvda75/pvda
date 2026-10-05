import React from 'react';

const TestCompletedScreen: React.FC<{ onReturnHome?: () => void }> = ({ onReturnHome }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="text-center p-12 bg-white rounded-2xl shadow-lg max-w-lg w-full">
        <h1 className="text-4xl font-bold text-blue-600 mb-4">Hoàn thành bài thi</h1>
        <p className="text-lg text-gray-700 mb-8">
          Bạn đã hoàn thành bài thi. Vui lòng đóng tab trình duyệt này hoặc quay lại màn hình chính để tiếp tục.
        </p>
        <div className="flex flex-col gap-4 items-center">
            {onReturnHome && (
                <button
                onClick={onReturnHome}
                className="px-6 py-3 w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                Quay lại màn hình chính
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default TestCompletedScreen;
