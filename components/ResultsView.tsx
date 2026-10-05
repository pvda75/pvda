
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Answers, StudentResult, TestVersion, ScoreConfig } from '../types';
import { calculateScore, calculateMaxScore, normalizeAnswer, normalizeQuestionKey } from '../utils';
import AIAnalysisModal from './AIAnalysisModal';

interface AllResultsViewProps {
  results: StudentResult[];
  testVersions: Map<string, Pick<TestVersion, 'correctAnswers'>>;
  numMultipleChoice: number;
  numTrueFalse: number;
  numShortAnswer: number;
  numFreeResponse: number;
  scoreConfig?: ScoreConfig;
  onExport: () => void;
  onContinueSession: () => void;
  onExportStudent: (result: StudentResult) => void;
  onReturnToRoleSelection: () => void;
  onReconfigure: () => void;
  onDeleteStudentResult?: (resultId: string) => void;
  onDeleteMultipleStudentResults?: (resultIds: string[]) => void;
  onDeleteActiveParticipant?: (participantId: string) => void;
  onEditStudentId?: (oldId: string, newId: string) => void;
  onReviewStudent?: (result: StudentResult) => void;
  activeParticipants?: { id?: string; name: string; class: string; studentId: string; testVersionId: string; joinTime: string }[];
  teacherPassword?: string;
  testName?: string;
  isAdmin?: boolean;
}

const AllResultsView: React.FC<AllResultsViewProps> = ({ 
    results, 
    testVersions,
    numMultipleChoice, 
    numTrueFalse, 
    numShortAnswer,
    numFreeResponse,
    scoreConfig,
    onExport, 
    onContinueSession, 
    onExportStudent,
    onReturnToRoleSelection,
    onReconfigure,
    onDeleteStudentResult,
    onDeleteMultipleStudentResults,
    onDeleteActiveParticipant,
    onEditStudentId,
    onReviewStudent,
    activeParticipants = [],
    teacherPassword,
    testName,
    isAdmin = false,
}) => {
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<StudentResult | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<{ id?: string; name: string } | null>(null);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);
  
  const [studentToReview, setStudentToReview] = useState<StudentResult | null>(null);
  const [reviewPasswordInput, setReviewPasswordInput] = useState('');
  const [reviewPasswordError, setReviewPasswordError] = useState('');
  const [selectedStatsVersion, setSelectedStatsVersion] = useState<string>('');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentIdValue, setEditStudentIdValue] = useState<string>('');

  React.useEffect(() => {
    if (isStatsModalOpen && !selectedStatsVersion && testVersions.size > 0) {
      setSelectedStatsVersion(Array.from(testVersions.keys())[0]);
    }
  }, [isStatsModalOpen, testVersions, selectedStatsVersion]);
  
  const autoGradedMaxScore = calculateMaxScore(numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);
  
  const handleConfirmDeleteStudent = () => {
    if (studentToDelete && studentToDelete.id && onDeleteStudentResult) {
      onDeleteStudentResult(studentToDelete.id);
    }
    setStudentToDelete(null);
  };

  const handleConfirmDeleteParticipant = () => {
    if (participantToDelete && participantToDelete.id && onDeleteActiveParticipant) {
      onDeleteActiveParticipant(participantToDelete.id);
    }
    setParticipantToDelete(null);
  };

  const handleConfirmMultiDelete = () => {
    if (onDeleteMultipleStudentResults && selectedResultIds.length > 0) {
      onDeleteMultipleStudentResults(selectedResultIds);
      setSelectedResultIds([]);
    }
    setIsMultiDeleteModalOpen(false);
  };

  const toggleSelectAll = () => {
    if (selectedResultIds.length === results.length) {
      setSelectedResultIds([]);
    } else {
      setSelectedResultIds(results.map(r => r.id!).filter(id => !!id));
    }
  };

  const toggleSelectResult = (id: string) => {
    setSelectedResultIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleReviewClick = (result: StudentResult) => {
    if (!teacherPassword) {
      onReviewStudent?.(result);
    } else {
      setStudentToReview(result);
      setReviewPasswordInput('');
      setReviewPasswordError('');
    }
  };

  const handleConfirmReview = () => {
    if (teacherPassword && reviewPasswordInput !== teacherPassword) {
      setReviewPasswordError('Mật khẩu không đúng.');
      return;
    }
    if (studentToReview) {
      onReviewStudent?.(studentToReview);
    }
    setStudentToReview(null);
  };

  const renderActiveMonitoring = () => {
    const currentlyActive = activeParticipants.filter(p => !results.some(r => r.studentId === p.studentId));

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8">
            <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-green-800 flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                    Học sinh đang làm bài ({currentlyActive.length})
                </h2>
            </div>
            <div className="p-6">
                {currentlyActive.length === 0 ? (
                    <p className="text-center text-gray-500 py-4 italic">Không có học sinh nào đang làm bài.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentlyActive.map((p, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <p className="font-bold text-gray-800">{p.studentId} - {p.name}</p>
                                    <p className="text-xs text-gray-500">Lớp: {p.class} | Đề: {p.testVersionId}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Vào lúc</p>
                                        <p className="text-xs font-mono text-gray-600">{new Date(p.joinTime).toLocaleTimeString('vi-VN')}</p>
                                    </div>
                                    {onDeleteActiveParticipant && p.id && (
                                        <button
                                            onClick={() => setParticipantToDelete({ id: p.id, name: p.name })}
                                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-md transition-colors"
                                            title="Xóa học sinh đang treo"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
  };

  const renderStatsModal = () => {
    if (!isStatsModalOpen) return null;

    let totalScore = 0;
    let maxScore = -1;
    let minScore = 9999;
    let validResultsCount = 0;
    const distribution = {
      '<5': 0,
      '5-6.5': 0,
      '6.5-8': 0,
      '8-10': 0
    };

    results.forEach(result => {
      const correctAnswers = testVersions.get(result.testVersionId)?.correctAnswers;
      if (correctAnswers) {
        const score = calculateScore(result.answers, correctAnswers, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);
        totalScore += score;
        if (score > maxScore) maxScore = score;
        if (score < minScore) minScore = score;
        validResultsCount++;

        if (score < 5) distribution['<5']++;
        else if (score < 6.5) distribution['5-6.5']++;
        else if (score < 8) distribution['6.5-8']++;
        else distribution['8-10']++;
      }
    });

    const averageScore = validResultsCount > 0 ? (totalScore / validResultsCount).toFixed(2) : '0.00';
    const displayMax = maxScore !== -1 ? maxScore.toFixed(2) : '0.00';
    const displayMin = minScore !== 9999 ? minScore.toFixed(2) : '0.00';

    // Question stats
    const versionResults = results.filter(r => r.testVersionId === selectedStatsVersion);
    const correctAnswers = testVersions.get(selectedStatsVersion)?.correctAnswers;
    
    let mcStats: { correct: number, incorrect: number, blank: number }[] = [];
    let tfStats: { correct: number, incorrect: number, blank: number }[][] = [];
    let saStats: { correct: number, incorrect: number, blank: number }[] = [];

    if (correctAnswers) {
      mcStats = Array.from({ length: numMultipleChoice }, () => ({ correct: 0, incorrect: 0, blank: 0 }));
      tfStats = Array.from({ length: numTrueFalse }, () => Array.from({ length: 4 }, () => ({ correct: 0, incorrect: 0, blank: 0 })));
      saStats = Array.from({ length: numShortAnswer }, () => ({ correct: 0, incorrect: 0, blank: 0 }));

      versionResults.forEach(result => {
        // MC
        for (let i = 1; i <= numMultipleChoice; i++) {
          const key = `mc-${i}`;
          const normalizedKey = normalizeQuestionKey(key);
          const studentAns = result.answers[key];
          const correctAns = correctAnswers[normalizedKey];
          
          if (!studentAns) mcStats[i-1].blank++;
          else if (normalizeAnswer(studentAns) === normalizeAnswer(correctAns)) mcStats[i-1].correct++;
          else mcStats[i-1].incorrect++;
        }
        
        // TF
        for (let i = 1; i <= numTrueFalse; i++) {
          ['a', 'b', 'c', 'd'].forEach((part, partIndex) => {
            const key = `tf-${i}-${part}`;
            const normalizedKey = normalizeQuestionKey(key);
            const studentAns = result.answers[key];
            const correctAns = correctAnswers[normalizedKey];
            
            if (!studentAns) tfStats[i-1][partIndex].blank++;
            else if (normalizeAnswer(studentAns) === normalizeAnswer(correctAns)) tfStats[i-1][partIndex].correct++;
            else tfStats[i-1][partIndex].incorrect++;
          });
        }
        
        // SA
        for (let i = 1; i <= numShortAnswer; i++) {
          const key = `sa-${i}`;
          const normalizedKey = normalizeQuestionKey(key);
          const studentAns = result.answers[key];
          const correctAns = correctAnswers[normalizedKey];
          
          if (!studentAns) saStats[i-1].blank++;
          else if (studentAns.trim().toLowerCase() === String(correctAns || '').trim().toLowerCase()) saStats[i-1].correct++;
          else saStats[i-1].incorrect++;
        }
      });
    }

    const handleExportStats = () => {
      const wb = XLSX.utils.book_new();

      const generalData = [
        ['Thống kê chung', ''],
        ['Tổng số bài', validResultsCount],
        ['Điểm trung bình', averageScore],
        ['Điểm cao nhất', displayMax],
        ['Điểm thấp nhất', displayMin],
        [''],
        ['Phổ điểm', 'Số lượng'],
        ['Dưới 5', distribution['<5']],
        ['Từ 5 đến dưới 6.5', distribution['5-6.5']],
        ['Từ 6.5 đến dưới 8', distribution['6.5-8']],
        ['Từ 8 đến 10', distribution['8-10']],
      ];
      const wsGeneral = XLSX.utils.aoa_to_sheet(generalData);
      XLSX.utils.book_append_sheet(wb, wsGeneral, 'Thống kê chung');

      if (correctAnswers) {
        const questionData: any[][] = [
          ['Thống kê theo câu hỏi (Mã đề: ' + selectedStatsVersion + ')'],
          ['Loại câu hỏi', 'Câu', 'Ý', 'Đúng', 'Sai', 'Trống']
        ];

        mcStats.forEach((stat, idx) => {
          questionData.push(['Trắc nghiệm', idx + 1, '', stat.correct, stat.incorrect, stat.blank]);
        });

        tfStats.forEach((statArr, idx) => {
          ['a', 'b', 'c', 'd'].forEach((part, pIdx) => {
            questionData.push(['Đúng/Sai', idx + 1, part.toUpperCase(), statArr[pIdx].correct, statArr[pIdx].incorrect, statArr[pIdx].blank]);
          });
        });

        saStats.forEach((stat, idx) => {
          questionData.push(['Trả lời ngắn', idx + 1, '', stat.correct, stat.incorrect, stat.blank]);
        });

        const wsQuestions = XLSX.utils.aoa_to_sheet(questionData);
        XLSX.utils.book_append_sheet(wb, wsQuestions, 'Thống kê câu hỏi');
      }

      XLSX.writeFile(wb, `Thong_ke_ket_qua_${testName ? testName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'bai_kiem_tra'}.xlsx`);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-center text-blue-700">Thống kê kết quả</h2>
            
            <div className="overflow-y-auto flex-grow pr-2">
              <div className="space-y-4 mb-6">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600 font-medium">Tổng số bài nộp:</span>
                  <span className="font-bold">{validResultsCount}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600 font-medium">Điểm trung bình:</span>
                  <span className="font-bold text-blue-600">{averageScore}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600 font-medium">Điểm cao nhất:</span>
                  <span className="font-bold text-green-600">{displayMax}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600 font-medium">Điểm thấp nhất:</span>
                  <span className="font-bold text-red-600">{displayMin}</span>
                </div>
                
                <div className="pt-2">
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Phân bố điểm:</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <div className="flex justify-between bg-red-50 p-2 rounded">
                      <span>Dưới 5:</span>
                      <span className="font-bold">{distribution['<5']}</span>
                    </div>
                    <div className="flex justify-between bg-yellow-50 p-2 rounded">
                      <span>Từ 5 - 6.5:</span>
                      <span className="font-bold">{distribution['5-6.5']}</span>
                    </div>
                    <div className="flex justify-between bg-blue-50 p-2 rounded">
                      <span>Từ 6.5 - 8:</span>
                      <span className="font-bold">{distribution['6.5-8']}</span>
                    </div>
                    <div className="flex justify-between bg-green-50 p-2 rounded">
                      <span>Từ 8 - 10:</span>
                      <span className="font-bold">{distribution['8-10']}</span>
                    </div>
                  </div>
                  
                  <div className="h-64 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Dưới 5', count: distribution['<5'], fill: '#ef4444' },
                          { name: '5 - 6.5', count: distribution['5-6.5'], fill: '#eab308' },
                          { name: '6.5 - 8', count: distribution['6.5-8'], fill: '#3b82f6' },
                          { name: '8 - 10', count: distribution['8-10'], fill: '#22c55e' },
                        ]}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value) => [value, 'Số lượng']} />
                        <Bar dataKey="count" name="Số lượng" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="pt-4 border-t mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-700">Thống kê câu trả lời:</h3>
                    {testVersions.size > 1 && (
                      <select 
                        value={selectedStatsVersion} 
                        onChange={(e) => setSelectedStatsVersion(e.target.value)}
                        className="text-sm border-gray-300 rounded-md shadow-sm"
                      >
                        {Array.from(testVersions.keys()).map(v => (
                          <option key={v} value={v}>Mã đề {v}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {numMultipleChoice > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase">Trắc nghiệm</h4>
                        <div className="h-48 w-full mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={mcStats.map((stat, idx) => ({
                                name: `Câu ${idx + 1}`,
                                correct: stat.correct,
                                incorrect: stat.incorrect,
                                blank: stat.blank,
                              }))}
                              margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{fontSize: 10}} />
                              <YAxis allowDecimals={false} tick={{fontSize: 10}} />
                              <Tooltip />
                              <Legend wrapperStyle={{fontSize: '10px'}} />
                              <Bar dataKey="correct" stackId="a" name="Đúng" fill="#22c55e" />
                              <Bar dataKey="incorrect" stackId="a" name="Sai" fill="#ef4444" />
                              <Bar dataKey="blank" stackId="a" name="Trống" fill="#9ca3af" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {mcStats.map((stat, idx) => (
                            <div key={`mc-${idx}`} className="text-xs bg-gray-50 p-2 rounded border">
                              <div className="font-bold mb-1">Câu {idx + 1}</div>
                              <div className="flex justify-between text-green-600"><span>Đúng:</span> <span>{stat.correct}</span></div>
                              <div className="flex justify-between text-red-600"><span>Sai:</span> <span>{stat.incorrect}</span></div>
                              <div className="flex justify-between text-gray-500"><span>Trống:</span> <span>{stat.blank}</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {numTrueFalse > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase">Đúng/Sai</h4>
                        <div className="h-48 w-full mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={tfStats.flatMap((statArr, idx) => 
                                ['a', 'b', 'c', 'd'].map((part, pIdx) => ({
                                  name: `${idx + 1}${part.toUpperCase()}`,
                                  correct: statArr[pIdx].correct,
                                  incorrect: statArr[pIdx].incorrect,
                                  blank: statArr[pIdx].blank,
                                }))
                              )}
                              margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{fontSize: 10}} />
                              <YAxis allowDecimals={false} tick={{fontSize: 10}} />
                              <Tooltip />
                              <Legend wrapperStyle={{fontSize: '10px'}} />
                              <Bar dataKey="correct" stackId="a" name="Đúng" fill="#22c55e" />
                              <Bar dataKey="incorrect" stackId="a" name="Sai" fill="#ef4444" />
                              <Bar dataKey="blank" stackId="a" name="Trống" fill="#9ca3af" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {tfStats.map((statArr, idx) => (
                            <div key={`tf-${idx}`} className="text-xs bg-gray-50 p-2 rounded border">
                              <div className="font-bold mb-1">Câu {idx + 1}</div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                {['a', 'b', 'c', 'd'].map((part, pIdx) => (
                                  <div key={part} className="border-t pt-1 mt-1 first:border-0 first:pt-0 first:mt-0">
                                    <span className="font-semibold mr-1">Ý {part.toUpperCase()}:</span>
                                    <span className="text-green-600">{statArr[pIdx].correct}Đ</span> - <span className="text-red-600">{statArr[pIdx].incorrect}S</span> - <span className="text-gray-500">{statArr[pIdx].blank}T</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {numShortAnswer > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase">Trả lời ngắn</h4>
                        <div className="h-48 w-full mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={saStats.map((stat, idx) => ({
                                name: `Câu ${idx + 1}`,
                                correct: stat.correct,
                                incorrect: stat.incorrect,
                                blank: stat.blank,
                              }))}
                              margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{fontSize: 10}} />
                              <YAxis allowDecimals={false} tick={{fontSize: 10}} />
                              <Tooltip />
                              <Legend wrapperStyle={{fontSize: '10px'}} />
                              <Bar dataKey="correct" stackId="a" name="Đúng" fill="#22c55e" />
                              <Bar dataKey="incorrect" stackId="a" name="Sai" fill="#ef4444" />
                              <Bar dataKey="blank" stackId="a" name="Trống" fill="#9ca3af" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {saStats.map((stat, idx) => (
                            <div key={`sa-${idx}`} className="text-xs bg-gray-50 p-2 rounded border">
                              <div className="font-bold mb-1">Câu {idx + 1}</div>
                              <div className="flex justify-between text-green-600"><span>Đúng:</span> <span>{stat.correct}</span></div>
                              <div className="flex justify-between text-red-600"><span>Sai:</span> <span>{stat.incorrect}</span></div>
                              <div className="flex justify-between text-gray-500"><span>Trống:</span> <span>{stat.blank}</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-4 pt-4 border-t">
              <button onClick={handleExportStats} className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">Xuất file Excel</button>
              <button onClick={() => setIsStatsModalOpen(false)} className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium">Đóng</button>
            </div>
          </div>
        </div>
    );
  };
  
  const renderDeleteStudentModal = () => {
    if (!studentToDelete) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xóa Kết quả</h2>
            <p className="mb-4 text-sm text-gray-600">
              Bạn có chắc chắn muốn xóa kết quả làm bài của học sinh <strong>{studentToDelete.name}</strong> không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setStudentToDelete(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Hủy</button>
              <button onClick={handleConfirmDeleteStudent} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md">Xóa vĩnh viễn</button>
            </div>
          </div>
        </div>
    );
  };

  const renderDeleteParticipantModal = () => {
    if (!participantToDelete) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xóa Học sinh đang làm bài</h2>
            <p className="mb-4 text-sm text-gray-600">
              Bạn có chắc chắn muốn xóa học sinh <strong>{participantToDelete.name}</strong> khỏi danh sách đang làm bài không?
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setParticipantToDelete(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Hủy</button>
              <button onClick={handleConfirmDeleteParticipant} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md">Xóa</button>
            </div>
          </div>
        </div>
    );
  };

  const renderMultiDeleteModal = () => {
    if (!isMultiDeleteModalOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xóa Nhiều Kết quả</h2>
            <p className="mb-4 text-sm text-gray-600">
              Bạn có chắc chắn muốn xóa <strong>{selectedResultIds.length}</strong> kết quả đã chọn không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Hủy</button>
              <button onClick={handleConfirmMultiDelete} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md">Xóa vĩnh viễn</button>
            </div>
          </div>
        </div>
    );
  };

  const renderReviewModal = () => {
    if (!studentToReview) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Xác nhận Xem lại bài</h2>
            <p className="mb-4 text-sm text-gray-600">
              Vui lòng nhập mật khẩu giáo viên để xem lại bài của học sinh <strong>{studentToReview.name}</strong>.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Mật khẩu Giáo viên</label>
              <input 
                type="password" 
                value={reviewPasswordInput} 
                onChange={(e) => setReviewPasswordInput(e.target.value)} 
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" 
              />
              {reviewPasswordError && <p className="text-xs text-red-500 mt-1">{reviewPasswordError}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setStudentToReview(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Hủy</button>
              <button onClick={handleConfirmReview} className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md">Xác nhận</button>
            </div>
          </div>
        </div>
    );
  };
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        {renderStatsModal()}
        {renderDeleteStudentModal()}
        {renderDeleteParticipantModal()}
        {renderMultiDeleteModal()}
        {renderReviewModal()}
        <div className="w-full max-w-5xl p-8 space-y-6 bg-white rounded-2xl shadow-lg">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-blue-600">
                    {testName ? `${testName} - Kết quả tổng hợp` : "Kết quả tổng hợp"}
                </h1>
                <p className="mt-2 text-gray-600">Tổng hợp kết quả làm bài của các học sinh đã nộp bài.</p>
            </div>

            {/* Real-time Monitoring Section */}
            {renderActiveMonitoring()}

            {isAdmin && selectedResultIds.length > 0 && (
              <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg border border-blue-200">
                <span className="text-blue-700 font-medium">Đã chọn {selectedResultIds.length} kết quả</span>
                <button 
                  onClick={() => setIsMultiDeleteModalOpen(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 shadow-sm text-sm font-semibold"
                >
                  Xóa các mục đã chọn
                </button>
              </div>
            )}
            
            <div className="max-h-96 overflow-x-auto overflow-y-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left">
                              {isAdmin && (
                                <input 
                                  type="checkbox" 
                                  checked={results.length > 0 && selectedResultIds.length === results.length}
                                  onChange={toggleSelectAll}
                                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              )}
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">STT</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Số báo danh</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Họ và Tên</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Lớp</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Mã đề</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Thời gian nộp</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Điểm chấm tự động</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Vi phạm</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wider">Ghi chú</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-blue-600 uppercase tracking-wider">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {results.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="text-center py-10 text-gray-500">Chưa có học sinh nào nộp bài.</td>
                            </tr>
                        ) : results.map((result, index) => {
                            const correctAnswers = testVersions.get(result.testVersionId)?.correctAnswers;
                            if (!correctAnswers) return null; // Should not happen
                            
                            const score = calculateScore(result.answers, correctAnswers, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);
                            const submissionTime = result.submissionTime 
                                ? new Date(result.submissionTime).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                                : 'N/A';
                            const isSelected = result.id ? selectedResultIds.includes(result.id) : false;
                            
                            let note = '';
                            if (result.submissionType === 'auto_violation') note = 'Tự nộp (Vi phạm)';
                            else if (result.submissionType === 'auto_visibility') note = 'Tự nộp (Thoát màn hình)';
                            else if (result.submissionType === 'auto_timeout') note = 'Tự nộp (Hết giờ)';
                            else if (numFreeResponse > 0) note = 'Chưa tính điểm tự luận';

                            return (
                                <tr key={index} className={isSelected ? 'bg-blue-50' : ''}>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      {isAdmin && (
                                        <input 
                                          type="checkbox" 
                                          checked={isSelected}
                                          onChange={() => result.id && toggleSelectResult(result.id)}
                                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                      )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {editingStudentId === result.id ? (
                                        <div className="flex items-center gap-2">
                                          <input 
                                            value={editStudentIdValue} 
                                            onChange={e => setEditStudentIdValue(e.target.value)} 
                                            className="border px-2 py-1 rounded w-24" 
                                            placeholder="SBD mới"
                                          />
                                          <button 
                                            onClick={() => { 
                                              if (onEditStudentId && result.id && editStudentIdValue.trim()) {
                                                onEditStudentId(result.id, editStudentIdValue.trim()); 
                                              }
                                              setEditingStudentId(null); 
                                            }} 
                                            className="text-green-600 hover:text-green-800 font-medium"
                                          >Lưu</button>
                                          <button 
                                            onClick={() => setEditingStudentId(null)} 
                                            className="text-gray-500 hover:text-gray-700 font-medium"
                                          >Hủy</button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span>{result.studentId || ''}</span>
                                          {isAdmin && onEditStudentId && (
                                            <button 
                                              onClick={() => { 
                                                setEditingStudentId(result.id || null); 
                                                setEditStudentIdValue(result.studentId || ''); 
                                              }} 
                                              className="text-blue-500 hover:text-blue-700 text-xs"
                                              title="Sửa SBD"
                                            >
                                              ✏️
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{result.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.class}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.testVersionId}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{submissionTime}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{score.toFixed(2)} / {autoGradedMaxScore.toFixed(1)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.violationCount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{note}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                      <div className="flex justify-center items-center gap-2">
                                        {onReviewStudent && (
                                          <button
                                              onClick={() => handleReviewClick(result)}
                                              className="text-yellow-600 hover:text-yellow-900 font-medium px-3 py-1 rounded-md hover:bg-yellow-50 transition-colors"
                                          >
                                              Xem lại
                                          </button>
                                        )}
                                        <button
                                            onClick={() => onExportStudent(result)}
                                            className="text-blue-600 hover:text-blue-900 font-medium px-3 py-1 rounded-md hover:bg-blue-50 transition-colors"
                                        >
                                            Xuất PDF
                                        </button>
                                        {isAdmin && onDeleteStudentResult && (
                                            <button
                                                onClick={() => setStudentToDelete(result)}
                                                className="text-red-600 hover:text-red-900 font-medium px-3 py-1 rounded-md hover:bg-red-50 transition-colors"
                                            >
                                                Xóa
                                            </button>
                                        )}
                                      </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-4 pt-4">
                 <button onClick={onExport} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">Xuất kết quả tổng hợp</button>
                 <button onClick={() => setIsStatsModalOpen(true)} className="w-full sm:w-auto px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg shadow-md hover:bg-orange-600">Thống kê kết quả</button>
                 <button onClick={() => setIsAiModalOpen(true)} className="w-full sm:w-auto px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700">Phân tích AI</button>
                 <button onClick={onContinueSession} className="w-full sm:w-auto px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700">Đóng</button>
            </div>
            <AIAnalysisModal
              isOpen={isAiModalOpen}
              onClose={() => setIsAiModalOpen(false)}
              results={results}
              testVersions={testVersions}
              scoreConfig={scoreConfig}
            />
        </div>
    </div>
  );
};

export default AllResultsView;
