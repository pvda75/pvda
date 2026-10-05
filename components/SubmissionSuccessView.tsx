
import React, { useState } from 'react';
import { StudentResult, Answers, ScoreConfig } from '../types';
import { calculateScore, calculateMaxScore } from '../utils';

interface SubmissionSuccessViewProps {
    onRetakeTest: () => void;
    onReviewTest: () => void;
    onEndSession: () => void;
    result: StudentResult;
    correctAnswers: Answers;
    numMultipleChoice: number;
    numTrueFalse: number;
    numShortAnswer: number;
    numFreeResponse: number;
    scoreConfig?: ScoreConfig;
    teacherPassword?: string;
    testName?: string;
}

const SubmissionSuccessView: React.FC<SubmissionSuccessViewProps> = ({ 
    onRetakeTest, 
    onReviewTest, 
    onEndSession,
    result, 
    correctAnswers, 
    numMultipleChoice, 
    numTrueFalse, 
    numShortAnswer,
    numFreeResponse, 
    scoreConfig,
    teacherPassword,
    testName
}) => {
  const [isRetakeModalOpen, setIsRetakeModalOpen] = useState(false);
  const [retakePasswordInput, setRetakePasswordInput] = useState('');
  const [retakePasswordError, setRetakePasswordError] = useState('');

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewPasswordInput, setReviewPasswordInput] = useState('');
  const [reviewPasswordError, setReviewPasswordError] = useState('');

  const autoGradedMaxScore = calculateMaxScore(numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);
  const score = calculateScore(result.answers, correctAnswers, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);

  const formatSubmissionTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const submissionMessage = () => {
    switch (result.submissionType) {
      case 'auto_visibility':
        return (
            <p className="mt-4 text-lg text-red-600 font-semibold bg-red-50 p-3 rounded-md border border-red-200">
                Bài làm đã được tự động nộp do thoát màn hình.
            </p>
        );
      case 'auto_timeout':
        return (
            <p className="mt-4 text-lg text-red-600 font-semibold bg-red-50 p-3 rounded-md border border-red-200">
                Bài làm đã được tự động nộp do hết thời gian.
            </p>
        );
      default:
        return null;
    }
  };

  const handleRetakeClick = () => {
    if (!teacherPassword) onRetakeTest();
    else setIsRetakeModalOpen(true);
  };

  const handleConfirmRetake = () => {
    if (teacherPassword && retakePasswordInput !== teacherPassword) {
      setRetakePasswordError('Mật khẩu không đúng.');
      return;
    }
    onRetakeTest();
  };

  const handleEndClick = () => {
    onEndSession();
  };

  const handleReviewClick = () => {
    if (!teacherPassword) onReviewTest();
    else setIsReviewModalOpen(true);
  };

  const handleConfirmReview = () => {
    if (teacherPassword && reviewPasswordInput !== teacherPassword) {
      setReviewPasswordError('Mật khẩu không đúng.');
      return;
    }
    onReviewTest();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      {isRetakeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Làm bài lại</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Mật khẩu Giáo viên</label>
              <input type="password" value={retakePasswordInput} onChange={(e) => setRetakePasswordInput(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              {retakePasswordError && <p className="text-xs text-red-500 mt-1">{retakePasswordError}</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsRetakeModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md">Hủy</button>
              <button onClick={handleConfirmRetake} className="px-4 py-2 bg-green-600 text-white rounded-md">Đồng ý</button>
            </div>
          </div>
        </div>
      )}
      {isReviewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xem lại bài</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Mật khẩu Giáo viên</label>
              <input type="password" value={reviewPasswordInput} onChange={(e) => setReviewPasswordInput(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              {reviewPasswordError && <p className="text-xs text-red-500 mt-1">{reviewPasswordError}</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsReviewModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md">Hủy</button>
              <button onClick={handleConfirmReview} className="px-4 py-2 bg-yellow-600 text-white rounded-md">Đồng ý</button>
            </div>
          </div>
        </div>
      )}
      <div className="text-center p-12 bg-white rounded-2xl shadow-lg max-w-lg w-full">
        <h1 className="text-4xl font-bold text-green-600 mb-4">Nộp bài thành công!</h1>
        {testName && <h2 className="text-2xl font-semibold text-blue-700 mb-2">{testName}</h2>}
        {submissionMessage()}
        <p className="mt-4 text-lg text-gray-800">
          SBD: <span className="text-blue-700 font-bold">{result.studentId || "N/A"}</span>
          <br />
          Học sinh: <span className="text-blue-700 font-bold">{result.name}</span>
          <br />
          Lớp: <span className="text-blue-700 font-bold">{result.class}</span>
          {result.additionalData && Object.keys(result.additionalData).length > 0 && (
            <>
              {Object.entries(result.additionalData).map(([key, value]) => (
                <span key={key}>
                  <br />
                  {key}: <span className="text-blue-700 font-bold">{value}</span>
                </span>
              ))}
            </>
          )}
        </p>
        <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-indigo-700">Kết quả</h2>
            <div className="mt-4 text-3xl font-bold text-blue-600">
                {score.toFixed(2)} / {autoGradedMaxScore.toFixed(1)}
            </div>
            {(numFreeResponse > 0) && (
                <p className="mt-2 text-sm text-gray-500 italic">
                    (Điểm trên chưa bao gồm {numFreeResponse} câu Tự luận)
                </p>
            )}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
            {scoreConfig?.allowMultipleAttempts && (
                <button onClick={handleRetakeClick} className="px-4 py-3 bg-green-600 text-white rounded-lg">Làm lại</button>
            )}
            <button onClick={handleReviewClick} className={`px-4 py-3 bg-yellow-500 text-white rounded-lg ${!scoreConfig?.allowMultipleAttempts ? 'col-span-2' : ''}`}>Xem lại</button>
            <button onClick={handleEndClick} className="px-4 py-3 bg-red-600 text-white rounded-lg col-span-2">Kết thúc</button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionSuccessView;
