
import React, { useState } from 'react';
import { StudentResult, Answers, ScoreConfig } from '../types';
import PdfViewer from './PdfViewer';
import MarkdownViewer from './MarkdownViewer';
import AnswerSheet from './AnswerSheet';
import { calculateScore, calculateMaxScore, calculateTotalScoreWithEssay } from '../utils';

interface StudentResultViewProps {
    result: StudentResult;
    testFile?: File;
    testContent?: string;
    correctAnswers: Answers;
    numMultipleChoice: number;
    numTrueFalse: number;
    numShortAnswer: number;
    numFreeResponse: number;
    scoreConfig?: ScoreConfig;
    onBack: () => void;
    testName?: string;
}

const StudentResultView: React.FC<StudentResultViewProps> = ({
    result,
    testFile,
    testContent,
    correctAnswers,
    numMultipleChoice,
    numTrueFalse,
    numShortAnswer,
    numFreeResponse,
    scoreConfig,
    onBack,
    testName
}) => {
    const scoreData = calculateTotalScoreWithEssay(result, correctAnswers, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, scoreConfig);
    const [activeMobileTab, setActiveMobileTab] = useState<'pdf' | 'answers'>('pdf');

    return (
        <div className="fixed inset-0 flex flex-col p-2 md:p-4 bg-gray-100 gap-2 md:gap-4 font-sans print:static print:min-h-0 print:h-auto print:overflow-visible print:bg-white print:p-0">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-2 border-b-2 border-gray-300 gap-2 print:hidden">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-blue-600">
                        {testName ? `${testName} - Xem lại bài làm` : "Xem lại bài làm"}
                    </h1>
                    <div className="text-xs md:text-sm text-gray-600">
                        <p>
                            SBD: <span className="font-semibold">{result.studentId || "N/A"}</span> - Họ và tên: <span className="font-semibold">{result.name}</span> - Lớp: <span className="font-semibold">{result.class}</span> - Mã đề: <span className="font-semibold">{result.testVersionId}</span>
                        </p>
                        {result.additionalData && Object.keys(result.additionalData).length > 0 && (
                            <p>
                                {Object.entries(result.additionalData).map(([key, value]) => (
                                    <span key={key} className="mr-4">
                                        {key}: <span className="font-semibold">{value}</span>
                                    </span>
                                ))}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                            <span className="font-medium text-gray-700 bg-gray-200/80 px-2 py-0.5 rounded text-xs">
                                Điểm Trắc nghiệm: <strong className="text-blue-700">{scoreData.autoScore.toFixed(2)}</strong>
                            </span>
                            {numFreeResponse > 0 && (
                                <span className="font-medium text-purple-800 bg-purple-100 px-2 py-0.5 rounded text-xs border border-purple-200">
                                    Điểm Tự luận (AI): <strong className="text-purple-700">{scoreData.essayScore.toFixed(2)}</strong>
                                </span>
                            )}
                            <span className="font-bold text-white bg-blue-600 px-3 py-0.5 rounded text-xs shadow-sm">
                                Tổng điểm: {scoreData.totalScore.toFixed(2)} / {scoreData.maxScore.toFixed(1)}
                            </span>
                        </div>
                    </div>
                </div>
                <button onClick={onBack} className="px-4 py-2 md:px-6 md:py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 text-sm md:text-base self-end md:self-auto print:hidden cursor-pointer">Quay lại</button>
            </header>
            <main className="flex-grow flex flex-col lg:flex-row gap-4 overflow-hidden print:overflow-visible print:block print:h-auto" style={{minHeight: 0}}>
                {/* Mobile Tabs */}
                <div className="lg:hidden flex border-b border-gray-300 shrink-0 print:hidden">
                    <button 
                        className={`flex-1 py-2 font-semibold text-sm ${activeMobileTab === 'pdf' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                        onClick={() => setActiveMobileTab('pdf')}
                    >
                        Đề thi
                    </button>
                    <button 
                        className={`flex-1 py-2 font-semibold text-sm ${activeMobileTab === 'answers' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                        onClick={() => setActiveMobileTab('answers')}
                    >
                        Đáp án chi tiết
                    </button>
                </div>

                {(testContent || testFile) && (
                    <div className={`h-full lg:flex-[2] ${activeMobileTab === 'pdf' ? 'block' : 'hidden'} lg:block overflow-hidden print:overflow-visible print:block print:h-auto print:w-full`} style={{ minHeight: 0 }}>
                        {testContent ? (
                            <div className="flex-1 min-h-0 border border-gray-300 rounded-lg overflow-hidden bg-gray-100 relative w-full h-full print:border-none print:overflow-visible print:h-auto print:block print:bg-white">
                                <MarkdownViewer content={testContent} />
                            </div>
                        ) : testFile ? (
                            <div className="relative w-full h-full print:hidden">
                                <PdfViewer file={testFile} />
                            </div>
                        ) : null}
                    </div>
                )}
                <div className={`h-full lg:flex-[1] ${activeMobileTab === 'answers' ? 'block' : 'hidden'} lg:block print:hidden`} style={{ minHeight: 0 }}>
                    <AnswerSheet
                        title="Đáp án chi tiết"
                        numMultipleChoice={numMultipleChoice}
                        numTrueFalse={numTrueFalse}
                        numShortAnswer={numShortAnswer}
                        numFreeResponse={numFreeResponse}
                        answers={result.answers}
                        correctAnswers={correctAnswers}
                        isReview={true}
                        essayGrading={result.essayGrading}
                    />
                </div>
            </main>
        </div>
    );
};

export default StudentResultView;
