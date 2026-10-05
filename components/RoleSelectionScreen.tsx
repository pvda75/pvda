import React, { useState } from 'react';

const RoleSelectionScreen: React.FC<{ onStart: (role: 'teacher' | 'student') => void }> = ({ onStart }) => {
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student' | null>(null);
  const [hasExited, setHasExited] = useState(false);

  const handleStartClick = () => {
    if (selectedRole) {
      onStart(selectedRole);
    }
  };

  if (hasExited) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Đã thoát ứng dụng</h2>
          <p className="text-gray-600">Bạn có thể đóng thẻ trình duyệt này một cách an toàn.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-lg p-12 space-y-8 bg-white rounded-2xl shadow-lg text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5">
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white shadow-lg transform -rotate-3 transition-transform hover:rotate-0">
            <span className="font-extrabold text-base sm:text-lg tracking-wider">AI</span>
            <div className="absolute -bottom-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-blue-600 sm:text-left leading-tight">
            Hệ thống kiểm tra<br />trực tuyến
          </h1>
        </div>
        <p className="mt-6 text-lg text-gray-700">Vui lòng chọn vai trò của bạn để bắt đầu.</p>
        <p className="text-sm text-gray-500">
          Ứng dụng sẽ chuyển sang chế độ toàn màn hình để đảm bảo môi trường làm bài tốt nhất.
        </p>

        <div className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setSelectedRole('teacher')}
              className={`flex items-center justify-center gap-3 w-full py-4 px-4 border rounded-lg text-lg font-medium transition-all duration-200 ${
                selectedRole === 'teacher'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-transparent shadow-lg shadow-blue-500/30 ring-2 ring-offset-2 ring-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Giáo viên
            </button>
            <button
              onClick={() => setSelectedRole('student')}
               className={`flex items-center justify-center gap-3 w-full py-4 px-4 border rounded-lg text-lg font-medium transition-all duration-200 ${
                selectedRole === 'student'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-transparent shadow-lg shadow-emerald-500/30 ring-2 ring-offset-2 ring-emerald-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-9.998 12.078 12.078 0 01.665-6.479L12 14z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" /></svg>
              Học sinh
            </button>
          </div>
        </div>

        <div className="pt-8 flex flex-col gap-4">
          <div className="flex flex-row gap-4">
            <button
              onClick={() => {
                window.open('', '_self', '');
                window.close();
                setHasExited(true);
              }}
              className="flex-1 flex items-center justify-center gap-3 py-4 px-4 border border-transparent rounded-lg shadow-md text-xl font-bold text-white bg-gradient-to-r from-rose-400 to-red-500 hover:from-rose-500 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Thoát
            </button>
            <button
              onClick={handleStartClick}
              disabled={!selectedRole}
              className="flex-1 flex items-center justify-center gap-3 py-4 px-4 border border-transparent rounded-lg shadow-md text-xl font-bold text-white bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-100 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg disabled:hover:translate-y-0"
            >
              Bắt đầu
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelectionScreen;
