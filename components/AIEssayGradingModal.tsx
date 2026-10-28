import React, { useState, useEffect } from 'react';
import { StudentResult, ScoreConfig, TestVersion, EssayGradingItem } from '../types';
import { X, Sparkles, CheckCircle, AlertCircle, RefreshCw, Save, BookOpen, User } from 'lucide-react';

interface AIEssayGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: StudentResult[];
  numFreeResponse: number;
  numShortAnswer?: number;
  scoreConfig?: ScoreConfig;
  testVersions: Map<string, Pick<TestVersion, 'correctAnswers' | 'testContent' | 'testFile'>>;
  onSaveGrading: (updatedResults: StudentResult[]) => Promise<void>;
  singleStudent?: StudentResult | null;
}

const AIEssayGradingModal: React.FC<AIEssayGradingModalProps> = ({
  isOpen,
  onClose,
  results,
  numFreeResponse,
  scoreConfig,
  testVersions,
  onSaveGrading,
  singleStudent = null,
}) => {
  const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(scoreConfig?.frPoints ?? 1.0);
  const [rubricText, setRubricText] = useState<string>('');
  const [customQuestionPrompt, setCustomQuestionPrompt] = useState<string>('');
  
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [currentProgress, setCurrentProgress] = useState<{ current: number; total: number; studentName: string }>({ current: 0, total: 0, studentName: '' });
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Results holding current grading before applying
  const [gradedResults, setGradedResults] = useState<StudentResult[]>([]);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<string | null>(null);
  const [onlyUngraded, setOnlyUngraded] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Initialize data when opening modal
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setStatusMessage('');
      setIsGrading(false);

      // Try to find default testContent from testVersions to populate question text
      let initialQuestions = '';
      for (const [, v] of testVersions.entries()) {
        if (v.testContent) {
          initialQuestions = v.testContent;
          break;
        }
      }
      setCustomQuestionPrompt(initialQuestions);

      // Target results pool
      const targetPool = singleStudent ? [singleStudent] : results;
      setGradedResults(JSON.parse(JSON.stringify(targetPool)));
      if (targetPool.length > 0) {
        setSelectedStudentForDetail(targetPool[0].id || targetPool[0].name);
      }
    }
  }, [isOpen, results, singleStudent, testVersions]);

  if (!isOpen) return null;

  // Determine questions count: at least 1 or numFreeResponse
  const frCount = numFreeResponse > 0 ? numFreeResponse : 1;

  // Filter students who have essay answers
  const studentsToGrade = gradedResults.filter((st) => {
    if (onlyUngraded && st.essayGrading && Object.keys(st.essayGrading).length > 0) {
      return false;
    }
    return true;
  });

  const handleStartAIGrading = async () => {
    const studentsQueue = onlyUngraded 
      ? gradedResults.filter(s => !s.essayGrading || Object.keys(s.essayGrading).length === 0)
      : gradedResults;

    if (studentsQueue.length === 0) {
      setErrorMessage('Không có học sinh nào cần chấm điểm.');
      return;
    }

    setIsGrading(true);
    setErrorMessage('');
    setCurrentProgress({ current: 0, total: studentsQueue.length, studentName: '' });

    try {
      const updatedList = [...gradedResults];

      for (let i = 0; i < studentsQueue.length; i++) {
        const student = studentsQueue[i];
        setCurrentProgress({
          current: i + 1,
          total: studentsQueue.length,
          studentName: `${student.name} (${student.class})`
        });
        setStatusMessage(`Đang chấm bài (${i + 1}/${studentsQueue.length}): ${student.name}...`);

        // Prepare essay answers of this student
        const studentEssayAnswers: Record<string, string> = {};
        for (let q = 1; q <= frCount; q++) {
          const key = `fr-${q}`;
          studentEssayAnswers[key] = student.answers[key] || '(Học sinh không làm câu này)';
        }

        const response = await fetch('/api/gemini/grade-essay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentName: student.name,
            studentClass: student.class,
            frCount,
            pointsPerQuestion,
            customQuestionPrompt,
            rubricText,
            studentEssayAnswers,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Lỗi máy chủ (${response.status}) khi chấm bài của ${student.name}`);
        }

        const parsedData = await response.json();

        const essayGradingMap: Record<string, EssayGradingItem> = {};
        let totalStudentEssayScore = 0;

        if (Array.isArray(parsedData.questions)) {
          parsedData.questions.forEach((qItem: any) => {
            const sc = Math.min(Math.max(Number(qItem.score) || 0, 0), pointsPerQuestion);
            essayGradingMap[qItem.key] = {
              score: Number(sc.toFixed(2)),
              maxScore: pointsPerQuestion,
              feedback: qItem.feedback || 'Đã chấm bởi AI.'
            };
            totalStudentEssayScore += sc;
          });
        } else {
          for (let q = 1; q <= frCount; q++) {
            const key = `fr-${q}`;
            const studentAns = studentEssayAnswers[key];
            const sc = studentAns && studentAns !== '(Học sinh không làm câu này)' ? pointsPerQuestion * 0.5 : 0;
            essayGradingMap[key] = {
              score: sc,
              maxScore: pointsPerQuestion,
              feedback: sc > 0 ? 'Học sinh có ý trả lời.' : 'Chưa hoàn thành.'
            };
            totalStudentEssayScore += sc;
          }
        }

        const stIndex = updatedList.findIndex(s => (s.id && s.id === student.id) || (s.studentId === student.studentId && s.name === student.name));
        if (stIndex !== -1) {
          updatedList[stIndex] = {
            ...updatedList[stIndex],
            essayGrading: essayGradingMap,
            essayTotalScore: Number(totalStudentEssayScore.toFixed(2)),
          };
        }
      }

      setGradedResults(updatedList);
      setStatusMessage('Đã hoàn tất chấm điểm bằng AI! Giáo viên có thể xem và điều chỉnh điểm bên dưới trước khi Lưu.');
    } catch (err: any) {
      console.error('Lỗi khi chấm điểm bằng AI:', err);
      setErrorMessage(`Đã xảy ra lỗi trong quá trình chấm AI: ${err?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsGrading(false);
    }
  };

  const handleScoreChange = (studentIdentifier: string, questionKey: string, newScore: number) => {
    setGradedResults(prev => prev.map(s => {
      const match = (s.id && s.id === studentIdentifier) || (s.name === studentIdentifier);
      if (!match) return s;

      const currentGrading = { ...(s.essayGrading || {}) };
      const currentItem = currentGrading[questionKey] || { score: 0, maxScore: pointsPerQuestion, feedback: '' };
      
      currentGrading[questionKey] = {
        ...currentItem,
        score: Math.min(Math.max(newScore, 0), currentItem.maxScore || pointsPerQuestion)
      };

      const newTotal = Object.values(currentGrading).reduce((acc, curr) => acc + (curr.score || 0), 0);
      return {
        ...s,
        essayGrading: currentGrading,
        essayTotalScore: Number(newTotal.toFixed(2))
      };
    }));
  };

  const handleFeedbackChange = (studentIdentifier: string, questionKey: string, newFeedback: string) => {
    setGradedResults(prev => prev.map(s => {
      const match = (s.id && s.id === studentIdentifier) || (s.name === studentIdentifier);
      if (!match) return s;

      const currentGrading = { ...(s.essayGrading || {}) };
      const currentItem = currentGrading[questionKey] || { score: 0, maxScore: pointsPerQuestion, feedback: '' };
      
      currentGrading[questionKey] = {
        ...currentItem,
        feedback: newFeedback
      };

      return {
        ...s,
        essayGrading: currentGrading
      };
    }));
  };

  const handleSaveAndApply = async () => {
    setIsSaving(true);
    setErrorMessage('');
    try {
      await onSaveGrading(gradedResults);
      onClose();
    } catch (err: any) {
      setErrorMessage(`Lỗi khi lưu điểm: ${err?.message || 'Không thể lưu điểm vào cơ sở dữ liệu'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStudent = gradedResults.find(s => (s.id && s.id === selectedStudentForDetail) || (s.name === selectedStudentForDetail)) || gradedResults[0];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden animate-fade-in border border-purple-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                Chấm điểm Tự luận bằng AI (Phương án B)
              </h2>
              <p className="text-xs text-purple-100">
                AI tự động đối chiếu bài làm học sinh, cho điểm và nhận xét chi tiết. Giáo viên có thể duyệt & chỉnh sửa.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isGrading}
            className="p-2 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Section 1: Configuration */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-200 pb-3">
              <div className="flex items-center gap-2 font-bold text-purple-900 text-base">
                <BookOpen className="w-5 h-5 text-purple-600" />
                <span>Cấu hình chấm điểm AI</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-purple-200 shadow-sm">
                  <span className="text-gray-700 font-medium">Số câu tự luận:</span>
                  <span className="font-bold text-purple-700">{frCount}</span>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-purple-200 shadow-sm">
                  <span className="text-gray-700 font-medium">Điểm mỗi câu:</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="10"
                    disabled={isGrading}
                    value={pointsPerQuestion}
                    onChange={(e) => setPointsPerQuestion(parseFloat(e.target.value) || 1.0)}
                    className="w-16 px-2 py-0.5 border border-purple-300 rounded font-bold text-purple-700 text-center focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-gray-500 text-xs">điểm</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Đáp án mẫu / Barem chấm thi của Giáo viên (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  disabled={isGrading}
                  value={rubricText}
                  onChange={(e) => setRubricText(e.target.value)}
                  placeholder="Dán đáp án mẫu, tiêu chí hoặc barem điểm từng ý (ví dụ: Câu 1: đúng công thức 0.5đ, giải đúng 0.5đ...)"
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <p className="text-[11px] text-gray-500 mt-1 italic">
                  *Nếu để trống, AI sẽ tự động giải đề và đánh giá sự hợp lý, chính xác của bài làm.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Nội dung câu hỏi tự luận (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  disabled={isGrading}
                  value={customQuestionPrompt}
                  onChange={(e) => setCustomQuestionPrompt(e.target.value)}
                  placeholder="Dán nội dung câu hỏi tự luận nếu đề thi không có văn bản trực tiếp..."
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <p className="text-[11px] text-gray-500 mt-1 italic">
                  *Nội dung này giúp AI hiểu sâu đề thi để chấm chuẩn xác nhất.
                </p>
              </div>
            </div>

            {/* Actions for starting grading */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isGrading}
                  checked={onlyUngraded}
                  onChange={(e) => setOnlyUngraded(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                />
                <span>Chỉ chấm những bài chưa có điểm tự luận</span>
              </label>

              <button
                onClick={handleStartAIGrading}
                disabled={isGrading || studentsToGrade.length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md hover:shadow-lg flex items-center gap-2 transition-all cursor-pointer"
              >
                {isGrading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Đang chấm AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                    <span>Bắt đầu Chấm AI ({studentsToGrade.length} bài)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress / Status banner */}
          {isGrading && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold text-indigo-900">
                <span>{statusMessage}</span>
                <span>{currentProgress.current} / {currentProgress.total}</span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(currentProgress.current / Math.max(currentProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {statusMessage && !isGrading && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-3.5 rounded-xl text-sm flex items-center gap-2 shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-sm flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 2: Review and Edit Graded List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600" />
                <span>Bảng điểm chi tiết & Duyệt kết quả</span>
              </h3>
              <span className="text-xs text-gray-500">
                *Thầy/Cô có thể chỉnh sửa trực tiếp điểm số và nhận xét trước khi lưu.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Left student list selector */}
              <div className="lg:col-span-4 bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-[380px] overflow-y-auto space-y-1.5 custom-scrollbar">
                {gradedResults.map((st) => {
                  const hasGrading = st.essayGrading && Object.keys(st.essayGrading).length > 0;
                  const isSelected = (st.id && st.id === selectedStudentForDetail) || (st.name === selectedStudentForDetail);
                  const essayScore = st.essayTotalScore !== undefined 
                    ? st.essayTotalScore 
                    : (hasGrading ? Object.values(st.essayGrading!).reduce((a, b) => a + (b.score || 0), 0) : null);

                  return (
                    <button
                      key={st.id || st.studentId || st.name}
                      onClick={() => setSelectedStudentForDetail(st.id || st.name)}
                      className={`w-full text-left p-3 rounded-lg transition-all flex items-center justify-between border ${
                        isSelected 
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md' 
                          : 'bg-white hover:bg-gray-100 border-gray-200 text-gray-800'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-sm truncate">{st.name}</div>
                        <div className={`text-xs ${isSelected ? 'text-purple-100' : 'text-gray-500'}`}>
                          SBD: {st.studentId || 'N/A'} - Lớp: {st.class}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {hasGrading ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                            isSelected ? 'bg-white text-purple-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {essayScore?.toFixed(2)} đ
                          </span>
                        ) : (
                          <span className={`text-[11px] px-2 py-0.5 rounded ${
                            isSelected ? 'bg-purple-700 text-purple-200' : 'bg-gray-200 text-gray-600'
                          }`}>
                            Chưa chấm
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right detail card for selected student */}
              <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl p-4 sm:p-5 max-h-[380px] overflow-y-auto space-y-4 custom-scrollbar shadow-sm">
                {selectedStudent ? (
                  <div>
                    <div className="flex flex-wrap justify-between items-center border-b pb-3 mb-4 gap-2">
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">
                          {selectedStudent.name} <span className="text-sm font-normal text-gray-500">({selectedStudent.class})</span>
                        </h4>
                        <p className="text-xs text-gray-500">
                          SBD: <span className="font-medium">{selectedStudent.studentId || 'N/A'}</span> | Mã đề: <span className="font-medium">{selectedStudent.testVersionId}</span>
                        </p>
                      </div>

                      <div className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="text-xs font-semibold text-purple-900">Tổng điểm Tự luận:</span>
                        <span className="font-bold text-lg text-purple-700">
                          {selectedStudent.essayTotalScore !== undefined 
                            ? selectedStudent.essayTotalScore.toFixed(2) 
                            : '0.00'} / {(frCount * pointsPerQuestion).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Question by question view & edit */}
                    <div className="space-y-4">
                      {Array.from({ length: frCount }, (_, i) => i + 1).map((qNum) => {
                        const qKey = `fr-${qNum}`;
                        const studentAnswer = selectedStudent.answers[qKey] || '';
                        const gradeItem = selectedStudent.essayGrading?.[qKey];

                        return (
                          <div key={qKey} className="border border-gray-200 rounded-xl p-3.5 bg-gray-50/60 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                                  {qNum}
                                </span>
                                Câu hỏi tự luận số {qNum}
                              </span>

                              <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-600">Điểm:</label>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  max={pointsPerQuestion}
                                  value={gradeItem ? gradeItem.score : 0}
                                  onChange={(e) => handleScoreChange(selectedStudent.id || selectedStudent.name, qKey, parseFloat(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-bold text-purple-700 text-center focus:ring-2 focus:ring-purple-500"
                                />
                                <span className="text-xs text-gray-500">/ {pointsPerQuestion}</span>
                              </div>
                            </div>

                            {/* Student's answer */}
                            <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs text-gray-800 whitespace-pre-wrap">
                              <span className="font-semibold text-gray-500 block mb-1">Bài làm của học sinh:</span>
                              {studentAnswer ? studentAnswer : <em className="text-gray-400">Học sinh không điền câu trả lời.</em>}
                            </div>

                            {/* AI Feedback */}
                            <div className="bg-purple-50/80 p-2.5 rounded-lg border border-purple-200 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                <span>Nhận xét của AI:</span>
                              </div>
                              <textarea
                                rows={2}
                                value={gradeItem ? gradeItem.feedback : ''}
                                onChange={(e) => handleFeedbackChange(selectedStudent.id || selectedStudent.name, qKey, e.target.value)}
                                placeholder="Chưa có nhận xét. AI sẽ nhận xét sau khi bấm Chấm AI, hoặc Giáo viên có thể tự nhập ở đây."
                                className="w-full text-xs p-1.5 border border-purple-200 rounded bg-white text-gray-700 focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-400 text-sm">
                    Chọn học sinh từ danh sách bên trái để xem bài làm và nhận xét chi tiết.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap justify-between items-center gap-3">
          <div className="text-xs text-gray-600">
            {gradedResults.filter(s => s.essayGrading && Object.keys(s.essayGrading).length > 0).length} / {gradedResults.length} học sinh đã có điểm tự luận
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isGrading || isSaving}
              className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-100 transition-colors shadow-sm cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSaveAndApply}
              disabled={isGrading || isSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang lưu vào hệ thống...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Lưu & Áp dụng điểm</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AIEssayGradingModal;
