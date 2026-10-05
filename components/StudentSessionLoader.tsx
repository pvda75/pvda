
import React, { useState } from 'react';

interface StudentSessionLoaderProps {
  username: string;
  onSessionFileSelect: (file: File) => void;
  onSessionIdSubmit: (sessionId: string) => void;
  onLogout: () => void;
}

const StudentSessionLoader: React.FC<StudentSessionLoaderProps> = ({ username, onSessionFileSelect, onSessionIdSubmit, onLogout }) => {
  const [sessionIdInput, setSessionIdInput] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.testsession')) {
        onSessionFileSelect(file);
      } else {
        alert('Vui lòng chọn một tệp .testsession hợp lệ.');
      }
    }
  };

  const handleIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionIdInput.trim()) {
      onSessionIdSubmit(sessionIdInput.trim());
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onLogout();
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-10 space-y-8 bg-white rounded-2xl shadow-lg text-center">
        <h1 className="text-3xl font-bold text-blue-600">Chào mừng, {username}!</h1>
        <p className="mt-2 text-gray-600">Nhập mã phiên làm bài hoặc tải lên tệp .testsession để bắt đầu.</p>
        
        <form onSubmit={handleIdSubmit} className="pt-4 space-y-4">
          <div>
            <label htmlFor="sessionId" className="sr-only">Mã phiên làm bài</label>
            <input
              id="sessionId"
              name="sessionId"
              type="text"
              required
              className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Nhập mã phiên làm bài"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Vào phòng kiểm tra
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Hoặc</span>
          </div>
        </div>

        <div className="space-y-4">
          <label
            htmlFor="session-file-upload"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 cursor-pointer"
          >
            Tải lên tệp .testsession
            <input
              id="session-file-upload"
              type="file"
              className="sr-only"
              accept=".testsession"
              onChange={handleFileChange}
            />
          </label>
           <button
            type="button"
            onClick={handleLogout}
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-lg font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Quay lại
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentSessionLoader;
