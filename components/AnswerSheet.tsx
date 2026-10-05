
import React from 'react';
import { Answers } from '../types';
import { CheckCircleIcon, XCircleIcon } from './icons';
import { normalizeAnswer, normalizeQuestionKey } from '../utils';

interface AnswerSheetProps {
  title: string;
  numMultipleChoice: number;
  numTrueFalse: number;
  numShortAnswer: number;
  numFreeResponse: number;
  answers: Answers;
  onAnswerChange?: (question: string, answer: string) => void;
  disabled?: boolean;
  correctAnswers?: Answers;
  isReview?: boolean;
  displaySection?: 'mc' | 'tf' | 'sa' | 'fr' | 'all';
  onNext?: () => void;
  onPrevious?: () => void;
  isFirstSection?: boolean;
  isLastSection?: boolean;
}

const AnswerSheet: React.FC<AnswerSheetProps> = ({ 
  title, 
  numMultipleChoice,
  numTrueFalse,
  numShortAnswer,
  numFreeResponse,
  answers, 
  onAnswerChange, 
  disabled = false,
  correctAnswers,
  isReview = false,
  displaySection = 'all',
  onNext,
  onPrevious,
  isFirstSection = false,
  isLastSection = false,
}) => {
  const mcOptions = ['A', 'B', 'C', 'D'];
  const tfOptions = ['Đúng', 'Sai'];

  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4 text-blue-600 border-b pb-2">{title}</h2>
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
        {(displaySection === 'all' || displaySection === 'mc') && numMultipleChoice > 0 && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-4 border-b-2 border-gray-800 pb-2">Phần I: Trắc nghiệm nhiều phương án lựa chọn</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
              {Array.from({ length: numMultipleChoice }, (_, i) => i + 1).map((qNum) => {
                const qKey = `mc-${qNum}`;
                const studentAnswer = answers[qKey];
                const correctAnswer = correctAnswers ? correctAnswers[normalizeQuestionKey(qKey)] : undefined;
                const isCorrect = studentAnswer !== undefined && correctAnswer !== undefined && normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer);
                
                return (
                  <div key={qKey} className="flex flex-col py-1 border-b border-gray-100 border-dashed last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-14 font-bold text-gray-800 text-right">Câu {qNum}</div>
                      <div className="flex space-x-2">
                        {mcOptions.map((option) => (
                          <label key={option} className="relative flex items-center justify-center cursor-pointer">
                            <input 
                              type="radio" 
                              name={`question-${title}-${qKey}`} 
                              value={option} 
                              checked={answers[qKey] === option} 
                              onChange={() => onAnswerChange && onAnswerChange(qKey, option)} 
                              disabled={disabled || isReview} 
                              className="peer sr-only"
                            />
                            <div className={`w-7 h-7 rounded-full border-[1.5px] flex items-center justify-center text-xs font-bold transition-all
                              ${answers[qKey] === option 
                                ? 'bg-blue-600 border-blue-600 text-white shadow-inner' 
                                : 'border-gray-400 text-gray-700 peer-hover:border-blue-500 peer-hover:bg-blue-50 peer-disabled:bg-gray-100 peer-disabled:border-gray-300 peer-disabled:text-gray-400'
                              }`}>
                              {option}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    {isReview && correctAnswer !== undefined && (
                        <div className="mt-1 pl-[68px] text-xs">
                            {isCorrect ? (
                                <p className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircleIcon /> Đúng</p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <p className="flex items-center gap-1 text-red-600 font-semibold"><XCircleIcon /> Sai.</p>
                                    <p className="text-gray-700">Đáp án: <span className="font-bold text-blue-600">{correctAnswer}</span></p>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {(displaySection === 'all' || displaySection === 'tf') && numTrueFalse > 0 && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-4 border-b-2 border-gray-800 pb-2">Phần II: Trắc nghiệm đúng sai</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-6">
              {Array.from({ length: numTrueFalse }, (_, i) => i + 1).map((qNum) => {
                const subParts = ['a', 'b', 'c', 'd'];
                return (
                  <div key={`tf-group-${qNum}`} className="rounded-lg border border-gray-300 bg-white overflow-hidden shadow-sm">
                    <div className="bg-gray-100 px-3 py-2 font-bold text-gray-800 border-b border-gray-300 text-center">
                      Câu {qNum}
                    </div>
                    <div className="p-3 space-y-3">
                      {subParts.map((part) => {
                        const qKey = `tf-${qNum}-${part}`;
                        const studentAnswer = answers[qKey];
                        const correctAnswer = correctAnswers ? correctAnswers[normalizeQuestionKey(qKey)] : undefined;
                        const isCorrect = studentAnswer !== undefined && correctAnswer !== undefined && normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer);

                        return (
                          <div key={qKey} className="flex flex-col">
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-700 w-6">{part})</span>
                                <div className="flex items-center space-x-2">
                                  {['Đ', 'S'].map((option, idx) => {
                                    const fullOption = idx === 0 ? 'Đúng' : 'Sai';
                                    return (
                                      <label key={option} className="relative flex items-center justify-center cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`question-${title}-${qKey}`}
                                          value={fullOption}
                                          checked={answers[qKey] === fullOption}
                                          onChange={() => onAnswerChange && onAnswerChange(qKey, fullOption)}
                                          disabled={disabled || isReview}
                                          className="peer sr-only"
                                        />
                                        <div className={`w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center text-sm font-bold transition-all
                                          ${answers[qKey] === fullOption 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-inner' 
                                            : 'border-gray-400 text-gray-700 peer-hover:border-blue-500 peer-hover:bg-blue-50 peer-disabled:bg-gray-100 peer-disabled:border-gray-300 peer-disabled:text-gray-400'
                                          }`}>
                                          {option}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                            </div>
                             {isReview && correctAnswer !== undefined && (
                                <div className="mt-1 pl-[36px] text-xs">
                                    {isCorrect ? (
                                        <p className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircleIcon /> Đúng</p>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <p className="flex items-center gap-1 text-red-600 font-semibold"><XCircleIcon /> Sai.</p>
                                            <p className="text-gray-700">Đáp án: <span className="font-bold text-blue-600">{correctAnswer === 'Đúng' ? 'Đ' : 'S'}</span></p>
                                        </div>
                                    )}
                                </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(displaySection === 'all' || displaySection === 'sa') && numShortAnswer > 0 && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-4 border-b-2 border-gray-800 pb-2">Phần III: Trắc nghiệm trả lời ngắn</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-4">
              {Array.from({ length: numShortAnswer }, (_, i) => i + 1).map((qNum) => {
                const qKey = `sa-${qNum}`;
                const studentAnswer = answers[qKey];
                const correctAnswer = correctAnswers ? correctAnswers[normalizeQuestionKey(qKey)] : undefined;
                // Với short answer, so sánh case-insensitive
                const isCorrect = studentAnswer && correctAnswer !== undefined && studentAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();

                return (
                  <div key={qKey} className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-800 w-14 text-right">Câu {qNum}</span>
                      <input
                          type="text"
                          name={`question-${title}-${qKey}`}
                          value={answers[qKey] || ''}
                          onChange={(e) => onAnswerChange && onAnswerChange(qKey, e.target.value)}
                          disabled={disabled || isReview}
                          className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 font-semibold text-blue-800 text-center uppercase tracking-widest"
                          placeholder=".........."
                      />
                    </div>
                    {isReview && correctAnswer !== undefined && (
                        <div className="mt-1 pl-[68px] text-xs">
                            {isCorrect ? (
                                <p className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircleIcon /> Đúng</p>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    <p className="flex items-center gap-1 text-red-600 font-semibold"><XCircleIcon /> Sai</p>
                                    <p className="text-gray-700">Đáp án: <span className="font-bold text-blue-600">{correctAnswer}</span></p>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {(displaySection === 'all' || displaySection === 'fr') && numFreeResponse > 0 && (
          <section>
            <h3 className="text-xl font-semibold text-blue-600 mb-3 border-b pb-2">Phần {numShortAnswer > 0 ? 'IV' : 'III'}: Tự luận</h3>
            <div className="space-y-4">
              {Array.from({ length: numFreeResponse }, (_, i) => i + 1).map((qNum) => {
                const qKey = `fr-${qNum}`;
                return (
                  <div key={qKey} className="p-3 rounded-md bg-gray-50 border border-gray-200">
                    <span className="font-semibold text-gray-800">Câu {qNum}</span>
                     <textarea
                          name={`question-${title}-${qKey}`}
                          value={answers[qKey] || ''}
                          onChange={(e) => onAnswerChange && onAnswerChange(qKey, e.target.value)}
                          disabled={disabled || isReview}
                          className="mt-2 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                          rows={4}
                      />
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
      {(onNext && displaySection !== 'all') || (onPrevious && !isFirstSection) ? (
        <div className="pt-4 mt-4 border-t">
          <div className="flex gap-4">
            {onPrevious && !isFirstSection && (
              <button 
                onClick={onPrevious}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700"
              >
                Lùi lại
              </button>
            )}
            {onNext && displaySection !== 'all' && (
              <button 
                onClick={onNext}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                {isLastSection ? 'Xem lại toàn bộ bài' : 'Tiếp tục'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AnswerSheet;
