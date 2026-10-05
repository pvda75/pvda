import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { StudentResult, ScoreConfig, TestVersion } from '../types';
import { X } from 'lucide-react';

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: StudentResult[];
  testVersions: Map<string, Pick<TestVersion, 'correctAnswers'>>;
  scoreConfig?: ScoreConfig;
}

const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({ isOpen, onClose, results, testVersions, scoreConfig }) => {
  const [analysis, setAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen && !analysis && !isAnalyzing && results.length > 0) {
      analyzeResults();
    }
  }, [isOpen, results]);

  const analyzeResults = async () => {
    setIsAnalyzing(true);
    setError('');
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Không tìm thấy API Key của Gemini. Vui lòng cấu hình GEMINI_API_KEY.');
      }

      const ai = new GoogleGenAI({ apiKey });

      // Prepare data for AI
      const totalStudents = results.length;
      const scores = results.map(r => r.score);
      const avgScore = scores.reduce((a, b) => a + b, 0) / totalStudents;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);

      const prompt = `
Bạn là một chuyên gia giáo dục và phân tích dữ liệu. Hãy phân tích kết quả bài kiểm tra của học sinh dựa trên dữ liệu sau:
- Tổng số học sinh tham gia: ${totalStudents}
- Điểm trung bình: ${avgScore.toFixed(2)}
- Điểm cao nhất: ${maxScore.toFixed(2)}
- Điểm thấp nhất: ${minScore.toFixed(2)}
- Danh sách điểm cụ thể: ${scores.join(', ')}

Yêu cầu:
1. Đánh giá tổng quan về phổ điểm và tình hình làm bài của lớp.
2. Chỉ ra các điểm nổi bật (nếu có).
3. Đưa ra lời khuyên cho giáo viên để cải thiện kết quả học tập của học sinh trong các bài kiểm tra tới.
Trình bày bằng tiếng Việt, định dạng Markdown rõ ràng, dễ đọc.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      setAnalysis(response.text || 'Không có phản hồi từ AI.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Đã xảy ra lỗi khi phân tích dữ liệu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">Phân tích kết quả bằng AI</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium">AI đang phân tích dữ liệu, vui lòng đợi...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-red-700">{error}</p>
            </div>
          ) : (
            <div className="prose max-w-none prose-blue">
              <Markdown>{analysis}</Markdown>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end rounded-b-xl">
          <button
            onClick={analyzeResults}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors mr-2"
          >
            Phân tích lại
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysisModal;
