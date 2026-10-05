
import React, { useState, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UploadIcon, ChevronLeftIcon, CheckCircleIcon } from './icons';
import { AppState, ScoreConfig, Answers } from '../types';
import { GoogleGenAI } from '@google/genai';
import { parseAnswerKey, normalizeQuestionKey, sanitizeSessionCode } from '../utils';
import * as docx from 'docx';
import * as XLSX from 'xlsx';
import { marked } from 'marked';
import MarkdownViewer from './MarkdownViewer';

interface ControlPanelProps {
  mode: AppState.TEACHER_SETUP | AppState.STUDENT_ENTRY;
  onTeacherSetupComplete: (
    versions: { id: string; testFile?: File; testContent?: string; answerKeyFile?: File; correctAnswers?: Answers; isAIGenerated?: boolean }[],
    mc: number,
    tf: number,
    sa: number,
    fr: number,
    password: string,
    duration: number,
    testName: string,
    startTime: string,
    endTime: string,
    scoreConfig: ScoreConfig,
    allowedStudents?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
    additionalStudentFields?: string[],
    customSessionId?: string
  ) => void | Promise<void>;
  onStudentStart: (name: string, aClass: string, studentId: string, additionalData: Record<string, string>) => void | Promise<void>;
  onFinishSession: () => void;
  onExportSession: (
    versions: { id: string; testFile?: File; testContent?: string; answerKeyFile?: File; correctAnswers?: Answers; isAIGenerated?: boolean }[],
    mc: number,
    tf: number,
    sa: number,
    fr: number,
    duration: number,
    password: string,
    testName: string,
    startTime: string,
    endTime: string,
    scoreConfig: ScoreConfig,
    allowedStudents?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
    additionalStudentFields?: string[],
    customSessionId?: string
  ) => void;
  onExportAllResults?: () => void;
  onCreateShareableLink: (
    versions: { id: string; testFile?: File; testContent?: string; answerKeyFile?: File; correctAnswers?: Answers; isAIGenerated?: boolean }[],
    mc: number,
    tf: number,
    sa: number,
    fr: number,
    duration: number,
    password: string,
    testName: string,
    startTime: string,
    endTime: string,
    scoreConfig: ScoreConfig,
    allowedStudents?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[],
    additionalStudentFields?: string[],
    customSessionId?: string
  ) => Promise<void>;
  onReturnToRoleSelection?: () => void;
  activeParticipants?: { id?: string; name: string; class: string; studentId: string; testVersionId: string; joinTime: string }[];
  completedStudents: { name: string; class: string; studentId?: string; testVersionId: string; id?: string }[];
  onEditStudentId?: (oldId: string, newId: string) => void;
  onDeleteStudentResult?: (resultId: string) => void;
  onDeleteActiveParticipant?: (participantId: string) => void;
  existingVersions?: { id: string; testFile?: File; testContent?: string; answerKeyFile?: File; correctAnswers?: Answers; isAIGenerated?: boolean }[];
  existingConfig?: { mc: number; tf: number; sa: number; fr: number; duration: number; startTime?: string; endTime?: string; scoreConfig?: ScoreConfig; allowedStudents?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[]; additionalStudentFields?: string[] };
  existingTestName?: string;
  existingSessionId?: string;
  teacherPassword?: string;
  testInfo: {
    versions: { id: string; fileName: string; answerKeyFileName: string }[];
    mc: number;
    tf: number;
    sa: number;
    fr: number;
    duration: number;
    startTime?: string;
    endTime?: string;
    scoreConfig?: ScoreConfig;
    allowedStudents?: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[];
    additionalStudentFields?: string[];
  };
  isTeacher?: boolean;
  isAdmin?: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  mode,
  onTeacherSetupComplete,
  onStudentStart,
  onFinishSession,
  onExportSession,
  onExportAllResults,
  onCreateShareableLink,
  onReturnToRoleSelection,
  activeParticipants = [],
  completedStudents,
  onEditStudentId,
  onDeleteStudentResult,
  onDeleteActiveParticipant,
  existingVersions = [],
  existingConfig,
  existingTestName = '',
  existingSessionId = '',
  teacherPassword,
  testInfo,
  isTeacher = false,
  isAdmin = false,
}) => {
  const [versions, setVersions] = useState<{ id: string; testFile?: File; testContent?: string; answerKeyFile?: File; correctAnswers?: Answers; isAIGenerated?: boolean }[]>(existingVersions);

  const [studentName, setStudentName] = useState<string>('');
  const [studentClass, setStudentClass] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [additionalData, setAdditionalData] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState<string>(existingTestName);
  const [customSessionId, setCustomSessionId] = useState<string>(existingSessionId || '');

  useEffect(() => {
    if (existingSessionId) {
      setCustomSessionId(existingSessionId);
    }
  }, [existingSessionId]);
  
  const [startTime, setStartTime] = useState<string>(existingConfig?.startTime || '');
  const [endTime, setEndTime] = useState<string>(existingConfig?.endTime || '');

  // Default config updated to 40 MC, 0 others to align with "0.25 pts/question" context
  const [numMultipleChoice, setNumMultipleChoice] = useState<number>(existingConfig?.mc ?? 40);
  const [numTrueFalse, setNumTrueFalse] = useState<number>(existingConfig?.tf ?? 0);
  const [numShortAnswer, setNumShortAnswer] = useState<number>(existingConfig?.sa ?? 0);
  const [numFreeResponse, setNumFreeResponse] = useState<number>(existingConfig?.fr ?? 0);
  const [duration, setDuration] = useState<number>(existingConfig?.duration ?? 50);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [additionalStudentFields, setAdditionalStudentFields] = useState<string[]>(existingConfig?.additionalStudentFields ?? []);

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentIdValue, setEditStudentIdValue] = useState<string>('');
  
  const [mcPoints, setMcPoints] = useState<number>(existingConfig?.scoreConfig?.mcPoints ?? 0.25);
  const [tfPoints, setTfPoints] = useState<number>(existingConfig?.scoreConfig?.tfPoints ?? 0.25);
  const [saPoints, setSaPoints] = useState<number>(existingConfig?.scoreConfig?.saPoints ?? 0.25);
  const [frPoints, setFrPoints] = useState<number>(existingConfig?.scoreConfig?.frPoints ?? 1.0);
  const [totalScore, setTotalScore] = useState<number>(existingConfig?.scoreConfig?.totalScore ?? 10);
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState<boolean>(existingConfig?.scoreConfig?.allowMultipleAttempts ?? false);
  const [allowedStudents, setAllowedStudents] = useState<{studentId: string; name: string; class: string; additionalData?: Record<string, string>}[]>(existingConfig?.allowedStudents ?? []);
  
  const [newVersionId, setNewVersionId] = useState('');
  const [newVersionTestFile, setNewVersionTestFile] = useState<File | null>(null);
  const [newVersionAnswerFile, setNewVersionAnswerFile] = useState<File | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgressMsg, setGenerationProgressMsg] = useState("");
  const [generationCount, setGenerationCount] = useState(1);
  const [generationError, setGenerationError] = useState('');

  const handleGenerateAIVersions = async () => {
    if (versions.length === 0) {
      setGenerationError("Vui lòng thêm ít nhất một đề gốc trước khi tạo đề từ AI.");
      return;
    }

    const envKey1 = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    const envKey2 = (process as any).env?.GEMINI_API_KEY;
    const apiKey = envKey1 || envKey2;
    if (!apiKey) {
      setGenerationError("Vui lòng cấu hình VITE_GEMINI_API_KEY trong hệ thống (Settings -> Secrets).");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setGenerationProgressMsg("Đang chuẩn bị dữ liệu...");

    let currentLastId = versions[versions.length - 1].id;
    const generateNextId = (currentId: string) => {
        const match = currentId.match(/(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1];
            const numStr = match[2];
            const nextNum = parseInt(numStr, 10) + 1;
            return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
        }
        return `${currentId}-1`;
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      const baseVersion = versions[0];
      
      let baseText = "";
      if (baseVersion.testContent) {
          baseText = baseVersion.testContent;
      } else if (baseVersion.testFile) {
          baseText = await (await import('./PdfExtractor')).extractTextFromPdf(baseVersion.testFile);
      } else {
          throw new Error("Mã đề cơ sở không có nội dung.");
      }

      let baseAnswers;
      if (baseVersion.correctAnswers) {
          baseAnswers = baseVersion.correctAnswers;
      } else if (baseVersion.answerKeyFile) {
          baseAnswers = await parseAnswerKey(baseVersion.answerKeyFile);
      } else {
          throw new Error("Mã đề cơ sở không có đáp án.");
      }
      const baseAnswersStr = JSON.stringify(baseAnswers);

      for (let i = 0; i < generationCount; i++) {
          const nextId = generateNextId(currentLastId);
          setGenerationProgressMsg(`Đang tạo đề ${i + 1}/${generationCount} (Mã đề: ${nextId})... Vui lòng đợi (khoảng 30-60s)`);
          
          const prompt = `Bạn là một giáo viên kinh nghiệm cực kỳ am hiểu việc ra đề kiểm tra. Dưới đây là nội dung của một bài kiểm tra gốc và đáp án đi kèm. Bài kiểm tra gồm: 
${numMultipleChoice} câu trắc nghiệm (mã mc),
${numTrueFalse} câu đúng sai (mã tf),
${numShortAnswer} câu trả lời ngắn (mã sa), 
${numFreeResponse} câu tự luận (mã fr).

Nội dung đề gốc:
${baseText}

Đáp án gốc (JSON string):
${baseAnswersStr}

YÊU CẦU QUAN TRỌNG:
Hãy sinh ra CHÍNH XÁC 1 đề kiểm tra mới hoàn toàn tương đương cấu trúc với đề gốc. Đề mới cần có độ khó tương đương, thay đổi số liệu, thông tin, dữ kiện và đảo vị trí đáp án để hạn chế lộ đề.
CỰC KỲ QUAN TRỌNG: Hãy tìm MỌI CỤM TỪ biểu thị mã đề như "Mã đề: [chữ/số]", "Mã đề kiểm tra: [chữ/số]"... đang có trong đề gốc và THAY THẾ BẮT BUỘC bằng chính xác cụm: "Mã đề: {{MA_DE_KIEM_TRA}}" (sử dụng ngoặc nhọn). KHÔNG tự điền số cho mã đề.
Tuy nhiên, BẮT BUỘC PHẢI GIỮ NGUYÊN HOÀN TOÀN cấu trúc bố cục, định dạng (formatting), các tiêu đề phần (ví dụ: I. PHẦN TRẮC NGHIỆM, II. PHẦN TỰ LUẬN, v.v.), cách phân chia câu hỏi, văn phong và kiểu đánh số y hệt như MẪU ĐỀ GỐC. Chú ý sử dụng các cú pháp Markdown cơ bản như In đậm (**chữ**) cho tiêu đề và các thành phần nhấn mạnh trong đề gốc. Đề do AI tạo ra PHẢI KHỚP ĐỊNH DẠNG HOÀN TOÀN với đề chính thức, NGOẠI TRỪ việc đặt lại mã đề thành placeholder.
Mã ID trong "correctAnswers" phải tuân thủ chuẩn cấu trúc đã định diện trong ứng dụng.

Trả về CHỈ một chuỗi JSON hợp lệ với đúng cấu trúc sau, KHÔNG kèm markdown ticks \`\`\` hoặc giải thích nào khác:
{
  "testContent": "Nội dung đề kiểm tra mới ở dạng Markdown. QUAN TRỌNG: \n1. Các câu hỏi phải được ngắt đoạn, cách nhau một dòng trắng (thêm \\n\\n) hoặc dùng thẻ <br/> để tạo khoảng phân cách rõ ràng.\n2. VỚI CÁC CÂU TRẮC NGHIỆM, BẮT BUỘC phải đặt mỗi đáp án (A., B., C., D.) trên một dòng hoàn toàn khác nhau để học sinh dễ nhìn (ví dụ: \nA. Đáp án A\nB. Đáp án B\nC. Đáp án C\nD. Đáp án D).\n3. Dùng cú pháp Markdown (**text**) để bôi đậm các đề mục hoặc số thứ tự câu.",
  "correctAnswers": { 
     "mc-1": "A",
     "tf-1-a": "Đúng"
  }
}`;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              temperature: 0.7,
            }
          });

          if (!response.text) throw new Error("AI không trả về kết quả.");
          
          let responseText = response.text;
          
          let parsedData = null;
          try {
              const jsonStart = responseText.indexOf('{');
              const jsonEnd = responseText.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                  responseText = responseText.substring(jsonStart, jsonEnd + 1);
              }
              parsedData = JSON.parse(responseText);
          } catch (parseError) {
              console.error("Lỗi parse JSON từ AI:", responseText);
              throw new Error("AI trả về kết quả không đúng định dạng JSON.");
          }
          
          currentLastId = nextId;

          // Force replace "Mã đề" or similar in markdown content to ensure it matches nextId
          if (parsedData.testContent) {
              let content = parsedData.testContent;
              
              // 1. Phép thay thế ưu tiên số 1: AI đã tuân thủ prompt và sử dụng placeholder
              content = content.replace(/Mã\s+đề(?:\s+kiểm tra)?:\s*\{\{MA_DE_KIEM_TRA\}\}/gi, `Mã đề: **${nextId}**`);
              content = content.replace(/\{\{MA_DE_KIEM_TRA\}\}/g, nextId);
              
              // 2. Fallback: Trường hợp AI vẫn bướng bỉnh in mã đề ra dạng text thông thường (như "Mã đề: 001", "**Mã đề:** 101", "Đề số 02")
              content = content.replace(/(Mã\s+đề(?:\s+kiểm tra)?|Đề\s+số)([\s:*]+)(\d{1,8})(?=\s|\n|<|$|\*|\r|\.|,|;|\)|\]|\\n)/gi, `$1$2${nextId}`);
              
              parsedData.testContent = content;
          }
          
          let testFileObj: File | undefined = undefined;
          // Removed html2pdf generation because AI generated test should only rely on testContent (Markdown) to prevent clipping and text cut-off

          let normalizedAnswers: Answers = {};
          if (parsedData.correctAnswers) {
              for (const [key, value] of Object.entries(parsedData.correctAnswers)) {
                  const normalizedKey = normalizeQuestionKey(key);
                  if (normalizedKey) {
                      normalizedAnswers[normalizedKey] = String(value);
                  }
              }
          }

          setVersions(prev => [
             ...prev,
             {
                 id: nextId,
                 testContent: parsedData.testContent,
                 testFile: testFileObj,
                 correctAnswers: normalizedAnswers,
                 isAIGenerated: true
             }
          ]);
      }
      
    } catch (error: any) {
      console.error("Lỗi tạo đề:", error);
      setGenerationError(error?.message || "Không thể tạo đề bằng AI.");
    } finally {
      setIsGenerating(false);
      setGenerationProgressMsg("");
    }
  };

  const handleDownloadAIVersion = async (v: any) => {
    // 1. Download Test Content (.pdf or .docx)
    if (v.testFile) {
        const url = URL.createObjectURL(v.testFile);
        const link = document.createElement('a');
        link.href = url;
        link.download = v.testFile.name || `De_kiem_tra_AI_${v.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else if (v.testContent) {
        // Render the markdown using the exact same components students see
        const htmlContent = renderToStaticMarkup(<MarkdownViewer content={v.testContent} />);
        
        // Wrap the HTML properly for Word to recognize it
        const documentHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>De kiem tra</title>
            <!--[if gte mso 9]>
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:Zoom>100</w:Zoom>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
              body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 12px; }
              table, th, td { border: 1px solid black; }
              th, td { padding: 8px; text-align: left; vertical-align: top; }
              th { background-color: #f8f9fa; font-weight: bold; }
              img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
              h1 { font-family: 'Times New Roman', serif; font-size: 18pt; font-weight: bold; margin-bottom: 14pt; }
              h2 { font-family: 'Times New Roman', serif; font-size: 16pt; font-weight: bold; margin-bottom: 12pt; }
              h3 { font-family: 'Times New Roman', serif; font-size: 14pt; font-weight: bold; margin-bottom: 10pt; }
              p { margin-bottom: 10pt; }
              ul { margin-bottom: 10pt; }
              .katex-html { display: none; } /* Hide KaTeX HTML styling as Word uses the MathML element (.katex-mathml) perfectly */
            </style>
            </head><body>
            ${htmlContent}
            </body></html>
        `;

        try {
            const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `De_kiem_tra_${v.id}.doc`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Lỗi xuất DOCX", err);
        }
    }

    // 2. Download Answer Key (.xlsx)
    if (v.correctAnswers) {
        setTimeout(() => {
            try {
                const data = [];
                for (const [key, value] of Object.entries(v.correctAnswers)) {
                    let formattedKey = key;
                    if (key.startsWith('mc')) formattedKey = `mc-${key.slice(2)}`;
                    else if (key.startsWith('tf') && key.length > 3) formattedKey = `tf-${key.slice(2, -1)}-${key.slice(-1)}`;
                    else if (key.startsWith('sa')) formattedKey = `sa-${key.slice(2)}`;
                    else if (key.startsWith('fr')) formattedKey = `fr-${key.slice(2)}`;
                    
                    data.push({ "Câu hỏi": formattedKey, "Đáp án": value });
                }
                
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Đáp án");
                XLSX.writeFile(wb, `Dap_an_${v.id}.xlsx`);
            } catch (err) {
                console.error("Lỗi xuất XLSX", err);
            }
        }, 500); // Delay slightly for multiple downloads
    }
  };

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [participantToDelete, setParticipantToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setPasswordInput(teacherPassword || '');
  }, [teacherPassword]);
  
  useEffect(() => {
    if (existingVersions.length > 0) {
      setVersions(existingVersions);
    }
  }, [existingVersions]);

  const handleQuestionCountChange = (setter: React.Dispatch<React.SetStateAction<number>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(e.target.value, 10);
    setter(count >= 0 ? count : 0);
  };
  
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setDuration(value > 0 ? value : 1);
  };

  const handleAddVersion = () => {
    if (newVersionId.trim() && newVersionTestFile && newVersionAnswerFile && !versions.some(v => v.id === newVersionId.trim())) {
      setVersions([...versions, { id: newVersionId.trim(), testFile: newVersionTestFile, answerKeyFile: newVersionAnswerFile }]);
      // Reset form
      setNewVersionId('');
      setNewVersionTestFile(null);
      setNewVersionAnswerFile(null);
      // Clear file input elements visually
      const fileInput = document.getElementById('new-file-upload') as HTMLInputElement;
      const answerInput = document.getElementById('new-answer-key-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      if (answerInput) answerInput.value = '';
    } else if (versions.some(v => v.id === newVersionId.trim())) {
        alert('Mã đề này đã tồn tại. Vui lòng nhập mã đề khác.');
    } else {
        alert('Vui lòng điền đầy đủ thông tin cho mã đề.');
    }
  };
  
  const handleRemoveVersion = (id: string) => {
    setVersions(versions.filter(v => v.id !== id));
  };

  const handleStudentListUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as string;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<any>(sheet);
        
        const importedStudents: {studentId: string; name: string; class: string; additionalData?: Record<string, string>}[] = [];
        let missingCount = 0;

        data.forEach(row => {
          // Normalize row keys
          const normalizedRow: Record<string, any> = {};
          Object.keys(row).forEach(key => {
            if (key) normalizedRow[String(key).trim().toLowerCase()] = row[key];
          });

          const rawStudentId = normalizedRow['mã hs'] ?? normalizedRow['mã học sinh'] ?? normalizedRow['sbd'] ?? normalizedRow['số báo danh'] ?? normalizedRow['mã sv'] ?? normalizedRow['mã sinh viên'] ?? normalizedRow['studentid'] ?? normalizedRow['student id'] ?? normalizedRow['id'] ?? '';
          const rawName = normalizedRow['họ và tên'] ?? normalizedRow['họ tên'] ?? normalizedRow['tên'] ?? normalizedRow['name'] ?? normalizedRow['student name'] ?? normalizedRow['fullname'] ?? normalizedRow['full name'] ?? '';
          const rawClass = normalizedRow['lớp'] ?? normalizedRow['class'] ?? '';
          
          const studentId = String(rawStudentId || '').trim();
          const name = String(rawName || '').trim();
          const aClass = String(rawClass || '').trim();
          
          const additionalData: Record<string, string> = {};
          additionalStudentFields.forEach(field => {
              const fieldVal = normalizedRow[field.trim().toLowerCase()];
              if (fieldVal !== undefined) {
                  additionalData[field] = String(fieldVal).trim();
              }
          });

          if (name && !studentId) {
             missingCount++;
          }
          
          if (studentId || name) {
             importedStudents.push({
               studentId: studentId,
               name: name,
               class: aClass,
               additionalData: Object.keys(additionalData).length > 0 ? additionalData : undefined
             });
          }
        });

        if (missingCount > 0) {
           console.warn(`Upload danh sách: Có ${missingCount} học sinh bị thiếu Mã số/SBD.`);
        }

        if (importedStudents.length > 0) {
          setAllowedStudents(importedStudents);
          alert(`Đã tải lên danh sách ${importedStudents.length} học sinh thành công!`);
        } else {
          alert('Không tìm thấy dữ liệu học sinh trong file. Vui lòng đảm bảo file có các cột "Mã HS", "Họ và tên", "Lớp".');
        }
      } catch (err) {
        console.error("Lỗi đọc file Excel:", err);
        alert("Có lỗi xảy ra khi đọc file Excel.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const [isStartingSession, setIsStartingSession] = useState(false);

  const handleTeacherContinue = async () => {
    if (versions.length > 0) {
      setIsStartingSession(true);
      try {
        await onTeacherSetupComplete(versions, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, passwordInput, duration, testName, startTime, endTime, { mcPoints, tfPoints, saPoints, frPoints, totalScore, allowMultipleAttempts }, allowedStudents, additionalStudentFields, customSessionId);
      } finally {
        setIsStartingSession(false);
      }
    }
  };

  const handleExportSessionClick = () => {
    if (versions.length > 0) {
      onExportSession(versions, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, duration, passwordInput, testName, startTime, endTime, { mcPoints, tfPoints, saPoints, frPoints, totalScore, allowMultipleAttempts }, allowedStudents, additionalStudentFields, customSessionId);
    } else {
      alert("Vui lòng thêm ít nhất một mã đề trước khi tạo file.");
    }
  };

  const handleCreateShareableLinkClick = () => {
    if (versions.length > 0) {
      onCreateShareableLink(versions, numMultipleChoice, numTrueFalse, numShortAnswer, numFreeResponse, duration, passwordInput, testName, startTime, endTime, { mcPoints, tfPoints, saPoints, frPoints, totalScore, allowMultipleAttempts }, allowedStudents, additionalStudentFields, customSessionId);
    } else {
      alert("Vui lòng thêm ít nhất một mã đề trước khi tạo link.");
    }
  };

  const [isStarting, setIsStarting] = useState(false);

  const handleStudentBegin = async () => {
    if (studentName.trim() && studentClass.trim() && studentId.trim() && (!testInfo?.additionalStudentFields || testInfo.additionalStudentFields.every(field => additionalData[field] && additionalData[field].trim() !== ''))) {
      setIsStarting(true);
      try {
        await onStudentStart(studentName, studentClass, studentId, additionalData);
      } finally {
        setIsStarting(false);
      }
    }
  };

  const handleDownloadSample = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof (window as any).XLSX === 'undefined') {
        alert('Thư viện xử lý Excel chưa sẵn sàng hoặc gặp lỗi. Vui lòng tải lại trang.');
        return;
    }
    const sampleData = [
        ['Mã câu hỏi', 'Đáp án'],
        ['mc-1', 'A'], ['mc-2', 'B'], ['mc-3', 'C'], ['mc-4', 'D'], ['mc-5', 'A'], ['mc-6', 'B'], ['mc-7', 'A'], ['mc-8', 'D'], ['mc-9', 'C'], ['mc-10', 'B'], ['mc-11', 'A'], ['mc-12', 'D'],
        ['tf-1-a', 'Đúng'], ['tf-1-b', 'Sai'], ['tf-1-c', 'Đúng'], ['tf-1-d', 'Sai'],
        ['tf-2-a', 'Sai'], ['tf-2-b', 'Đúng'], ['tf-2-c', 'Sai'], ['tf-2-d', 'Đúng'],
        ['tf-3-a', 'Đúng'], ['tf-3-b', 'Đúng'], ['tf-3-c', 'Sai'], ['tf-3-d', 'Sai'],
        ['tf-4-a', 'Sai'], ['tf-4-b', 'Sai'], ['tf-4-c', 'Đúng'], ['tf-4-d', 'Đúng'],
        ['sa-1', 'Kết quả 1'], ['sa-2', 'Kết quả 2'],
        ['fr-1', ''], ['fr-2', ''], ['fr-3', ''],
      ];
    const worksheet = (window as any).XLSX.utils.aoa_to_sheet(sampleData);
    worksheet['!cols'] = [{ wch: 20 }, { wch: 20 }];
    const workbook = (window as any).XLSX.utils.book_new();
    (window as any).XLSX.utils.book_append_sheet(workbook, worksheet, 'Đáp án mẫu');
    (window as any).XLSX.writeFile(workbook, 'DapAn_Mau.xlsx');
  };
  
  const handleDownloadStudentListSample = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof (window as any).XLSX === 'undefined') {
        alert('Thư viện xử lý Excel chưa sẵn sàng hoặc gặp lỗi. Vui lòng tải lại trang.');
        return;
    }
    const headers = ['Số báo danh', 'Họ và tên', 'Lớp', ...additionalStudentFields];
    const sampleData = [
        headers,
        ['12A1001', 'Nguyễn Văn A', '12A1', ...additionalStudentFields.map(() => '')],
        ['12A1002', 'Trần Thị B', '12A1', ...additionalStudentFields.map(() => '')],
        ['12A2001', 'Lê Văn C', '12A2', ...additionalStudentFields.map(() => '')],
        ['SV0004', 'Phạm Thị D', '10C1', ...additionalStudentFields.map(() => '')],
    ];
    const worksheet = (window as any).XLSX.utils.aoa_to_sheet(sampleData);
    const cols = [{ wch: 15 }, { wch: 25 }, { wch: 10 }, ...additionalStudentFields.map(() => ({ wch: 15 }))];
    worksheet['!cols'] = cols;
    const workbook = (window as any).XLSX.utils.book_new();
    (window as any).XLSX.utils.book_append_sheet(workbook, worksheet, 'DS_HocSinh');
    (window as any).XLSX.writeFile(workbook, 'DanhSachHocSinh_Mau.xlsx');
  };
  
  const handleConfirmReturn = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsReturnModalOpen(false);
    if (onReturnToRoleSelection) {
        onReturnToRoleSelection();
    }
  };

  const handleConfirmDeleteParticipant = () => {
    if (participantToDelete && onDeleteActiveParticipant) {
      onDeleteActiveParticipant(participantToDelete.id);
    }
    setParticipantToDelete(null);
  };

  const handleOpenReturnModal = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsReturnModalOpen(true);
  };
  
  const renderReturnModal = () => {
    if (!isReturnModalOpen) return null;
    
    const isStudentMode = mode === AppState.STUDENT_ENTRY;
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">{isStudentMode ? 'Xác nhận Thoát' : 'Xác nhận Quay lại'}</h2>
            <p className="mb-4 text-sm text-gray-600">
              {isStudentMode 
                 ? (isTeacher ? 'Bạn có chắc chắn muốn quay lại danh sách đề kiểm tra? Phiên làm bài vẫn sẽ được lưu.' : 'Bạn có chắc chắn muốn thoát và quay lại màn hình chính? Dữ liệu phiên làm bài hiện tại sẽ bị xóa.')
                 : (isTeacher ? 'Bạn có chắc chắn muốn quay lại danh sách đề kiểm tra? Mọi dữ liệu phiên chưa lưu sẽ bị mất.' : 'Bạn có chắc chắn muốn quay lại màn hình chọn vai trò? Mọi dữ liệu phiên chưa lưu sẽ bị mất.')}
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={(e) => { e.preventDefault(); setIsReturnModalOpen(false); }} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Hủy</button>
              <button type="button" onClick={handleConfirmReturn} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md">Xác nhận</button>
            </div>
          </div>
        </div>
    );
  };

  const renderDeleteParticipantModal = () => {
    if (!participantToDelete) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
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
  
  const isTeacherStepValid = testName.trim() !== '' && versions.length > 0 && (numMultipleChoice + numTrueFalse + numShortAnswer + numFreeResponse) > 0 && duration > 0;
  const isStudentStepValid = studentName.trim() !== '' && studentClass.trim() !== '' && studentId.trim() !== '' && (!testInfo?.additionalStudentFields || testInfo.additionalStudentFields.every(field => additionalData[field] && additionalData[field].trim() !== ''));
  const isAddVersionValid = newVersionId.trim() !== '' && newVersionTestFile !== null && newVersionAnswerFile !== null;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      {renderReturnModal()}
      {renderDeleteParticipantModal()}
      <div className="w-full max-w-2xl p-8 space-y-6 bg-white rounded-2xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-600">
            Hệ thống kiểm tra<br />trực tuyến
          </h1>
           {mode === AppState.TEACHER_SETUP ? (
             <p className="mt-2 text-gray-600">Quy trình làm bài gồm 2 bước dành cho Giáo viên và Học sinh.</p>
           ) : (
             <p className="mt-2 text-gray-600">Học sinh điền thông tin và chọn mã đề để bắt đầu làm bài.</p>
           )}
        </div>
        
        {mode === AppState.TEACHER_SETUP ? (
          <fieldset className="border border-gray-300 p-4 rounded-lg">
            <legend className="text-lg font-semibold text-blue-600 px-2">Bước 1: Cài đặt bài kiểm tra</legend>
            <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="test-name" className="block text-sm font-medium text-gray-700">Tên đề kiểm tra</label>
                        <input id="test-name" type="text" value={testName} onChange={(e) => setTestName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" placeholder="Ví dụ: Kiểm tra 15 phút môn Toán"/>
                    </div>
                    <div>
                        <label htmlFor="custom-session-code" className="block text-sm font-medium text-gray-700 flex justify-between items-center">
                          <span>Mã phiên kiểm tra (Dễ nhớ)</span>
                          <span className="text-xs text-gray-400 font-normal">Tùy chọn</span>
                        </label>
                        <input 
                          id="custom-session-code" 
                          type="text" 
                          value={customSessionId} 
                          onChange={(e) => setCustomSessionId(sanitizeSessionCode(e.target.value).toUpperCase())} 
                          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm font-mono text-sm uppercase placeholder:normal-case placeholder:font-sans" 
                          placeholder="Ví dụ: TOAN10-HK1, KT15P, 12A1..."
                          maxLength={50}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Để trống hệ thống sẽ tự sinh mã 20 ký tự ngẫu nhiên.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:col-span-2">
                        <div>
                            <label htmlFor="start-time" className="block text-sm font-medium text-gray-700">Thời gian mở</label>
                            <input id="start-time" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm"/>
                        </div>
                        <div>
                            <label htmlFor="end-time" className="block text-sm font-medium text-gray-700">Thời gian đóng</label>
                            <input id="end-time" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm"/>
                        </div>
                    </div>
                </div>
                {/* Section to add new test versions */}
                <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <h3 className="font-semibold text-gray-800 mb-3">Thêm mã đề mới</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input type="text" placeholder="Nhập mã đề (ví dụ: 101)" value={newVersionId} onChange={e => setNewVersionId(e.target.value)} className="px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm"/>
                    <div/>
                    <label htmlFor="new-file-upload" className="w-full text-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">{newVersionTestFile ? `Đề: ${newVersionTestFile.name}` : 'Chọn File Đề (PDF)'}<input id="new-file-upload" type="file" className="sr-only" onChange={e => e.target.files && setNewVersionTestFile(e.target.files[0])} accept="application/pdf"/></label>
                    <label htmlFor="new-answer-key-upload" className="w-full text-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">{newVersionAnswerFile ? `Đáp án: ${newVersionAnswerFile.name}` : 'Chọn File Đáp án (XLSX)'}<input id="new-answer-key-upload" type="file" className="sr-only" onChange={e => e.target.files && setNewVersionAnswerFile(e.target.files[0])} accept=".xlsx"/></label>
                  </div>
                   <button type="button" onClick={handleAddVersion} disabled={!isAddVersionValid} className={`mt-3 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${!isAddVersionValid ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-600 hover:bg-gray-700'}`}>Thêm</button>
                </div>
                {/* AI Generate section */}
                <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 mt-4">
                  <h3 className="font-semibold text-blue-800 mb-2 flex items-center justify-between">
                    <span>Tạo đề tương tự bằng AI</span>
                    <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">Gemini 2.5 Pro</span>
                  </h3>
                  <div className="flex gap-2 items-center mb-3">
                    <label className="text-sm font-medium text-gray-700">Số lượng đề cần tạo:</label>
                    <input 
                      type="number" 
                      min="1" max="10" 
                      value={generationCount}
                      onChange={(e) => setGenerationCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))} 
                      className="w-20 px-3 py-1 bg-white border border-gray-300 rounded-md shadow-sm"
                    />
                  </div>
                  {generationError && <p className="text-sm text-red-500 mb-3">{generationError}</p>}
                  {generationProgressMsg && <p className="text-sm text-blue-600 mb-3 animate-pulse">{generationProgressMsg}</p>}
                  <button 
                    type="button" 
                    onClick={handleGenerateAIVersions} 
                    disabled={isGenerating || versions.length === 0} 
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isGenerating || versions.length === 0 ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {isGenerating ? 'Đang xử lý...' : 'Tạo đề mới'}
                  </button>
                  <p className="text-xs text-blue-600 mt-2 italic">Hệ thống sẽ dựa vào đề gốc đầu tiên trong danh sách để tạo ra các đề mới có độ khó tương đương.</p>
                </div>

                {/* List of current test versions */}
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Danh sách mã đề đã thêm ({versions.length})</h3>
                  <div className="max-h-40 overflow-y-auto space-y-2 p-2 border rounded-md bg-white">
                    {versions.length > 0 ? versions.map(v => (
                      <div key={v.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                        <span className="font-semibold">{v.id}</span>
                        <div className="text-xs text-gray-600 truncate max-w-xs px-2">
                            {v.isAIGenerated ? (
                                <>
                                    <p title={`Đề AI sinh: ${v.id}`}>Đề: (Tạo bằng AI)</p>
                                    <p title={`Đáp án tự động`}>Đáp án: (Tự động)</p>
                                </>
                            ) : (
                                <>
                                    <p title={v.testFile?.name}>Đề: {v.testFile?.name}</p>
                                    <p title={v.answerKeyFile?.name}>Đáp án: {v.answerKeyFile?.name}</p>
                                </>
                            )}
                        </div>
                        <div className="flex gap-3 items-center">
                          {v.isAIGenerated && (
                            <button type="button" onClick={() => handleDownloadAIVersion(v)} className="text-blue-500 hover:text-blue-700 text-sm font-bold" title="Tải Đề và Đáp án về máy">
                              Tải về
                            </button>
                          )}
                          <button type="button" onClick={() => handleRemoveVersion(v.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">Xóa</button>
                        </div>
                      </div>
                    )) : <p className="text-sm text-gray-500 text-center py-2">Chưa có mã đề nào.</p>}
                  </div>
                </div>
                <hr/>
                <h3 className="font-semibold text-gray-800">Cấu hình chung</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    <div><label htmlFor="num-mc" className="block text-sm font-medium text-gray-700">Trắc nghiệm</label><input id="num-mc" type="number" value={numMultipleChoice} onChange={handleQuestionCountChange(setNumMultipleChoice)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="num-tf" className="block text-sm font-medium text-gray-700">Đúng/Sai</label><input id="num-tf" type="number" value={numTrueFalse} onChange={handleQuestionCountChange(setNumTrueFalse)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="num-sa" className="block text-sm font-medium text-gray-700">Trả lời ngắn</label><input id="num-sa" type="number" value={numShortAnswer} onChange={handleQuestionCountChange(setNumShortAnswer)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="num-fr" className="block text-sm font-medium text-gray-700">Tự luận</label><input id="num-fr" type="number" value={numFreeResponse} onChange={handleQuestionCountChange(setNumFreeResponse)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="duration" className="block text-sm font-medium text-gray-700">Thời gian (phút)</label><input id="duration" type="number" value={duration} onChange={handleDurationChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="1"/></div>
                </div>
                <hr/>
                <h3 className="font-semibold text-gray-800">Cấu hình điểm</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    <div><label htmlFor="pt-mc" className="block text-sm font-medium text-gray-700">Điểm/câu TN</label><input id="pt-mc" type="number" step="0.1" value={mcPoints} onChange={(e) => setMcPoints(parseFloat(e.target.value) || 0)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="pt-tf" className="block text-sm font-medium text-gray-700">Điểm/ý Đ/S</label><input id="pt-tf" type="number" step="0.1" value={tfPoints} onChange={(e) => setTfPoints(parseFloat(e.target.value) || 0)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="pt-sa" className="block text-sm font-medium text-gray-700">Điểm/câu TLN</label><input id="pt-sa" type="number" step="0.1" value={saPoints} onChange={(e) => setSaPoints(parseFloat(e.target.value) || 0)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="pt-fr" className="block text-sm font-medium text-gray-700">Điểm/câu TL</label><input id="pt-fr" type="number" step="0.1" value={frPoints} onChange={(e) => setFrPoints(parseFloat(e.target.value) || 0)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="0"/></div>
                    <div><label htmlFor="pt-total" className="block text-sm font-medium text-gray-700">Điểm tổng</label><input id="pt-total" type="number" step="0.5" value={totalScore} onChange={(e) => setTotalScore(parseFloat(e.target.value) || 0)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" min="1"/></div>
                </div>
                <div className="grid grid-cols-1 gap-4 pt-2">
                    <div>
                        <label htmlFor="teacher-password" className="block text-sm font-medium text-gray-700">Mật khẩu Giáo viên <span className="text-gray-500">(Tùy chọn)</span></label>
                        <input id="teacher-password" type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" placeholder="Dùng để kết thúc phiên"/>
                    </div>
                    <div className="flex items-center mt-2">
                        <input
                            id="allow-multiple-attempts"
                            type="checkbox"
                            checked={allowMultipleAttempts}
                            onChange={(e) => setAllowMultipleAttempts(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="allow-multiple-attempts" className="ml-2 block text-sm text-gray-900">
                            Cho phép học sinh làm bài nhiều lần (chế độ ôn tập)
                        </label>
                    </div>
                </div>

                <hr/>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800">Danh sách học sinh (Tùy chọn tải lên)</h3>
                  <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm border border-blue-200">
                    <p>Giáo viên có thể tải lên file Excel danh sách học sinh. Khi học sinh đăng nhập, chỉ cần nhập đúng SBD, hệ thống sẽ tự động điền Họ tên và Lớp.</p>
                    <p className="mt-1 font-semibold">Cấu trúc file Excel yêu cầu có các cột: "Mã HS" (hoặc "SBD"), "Họ và tên", "Lớp".</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">Upload File Excel Danh Sách:</label>
                        <button onClick={handleDownloadStudentListSample} type="button" className="text-sm font-medium text-blue-600 hover:text-blue-500 underline">Tải file mẫu</button>
                    </div>
                    <input type="file" accept=".xlsx, .xls" onChange={handleStudentListUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  </div>
                  {allowedStudents.length > 0 && (
                    <div className="text-sm text-green-700 bg-green-50 p-2 rounded-md border border-green-200 font-medium flex justify-between items-center">
                      <span>Đã tải lên danh sách {allowedStudents.length} học sinh.</span>
                      <button onClick={() => setAllowedStudents([])} className="text-red-600 hover:text-red-800 text-xs underline">Xóa danh sách</button>
                    </div>
                  )}
                </div>

                <hr/>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800">Các trường thông tin học sinh thêm</h3>
                  <div className="bg-orange-50 text-orange-800 p-3 rounded-md text-sm border border-orange-200">
                    <p>Mặc định học sinh luôn phải nhập Số báo danh/Mã học sinh, Họ và tên, Lớp. Bạn có thể yêu cầu điền thêm các thông tin khác (Ngày sinh, Trường,...).</p>
                  </div>
                  {additionalStudentFields.map((field, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={field}
                        onChange={(e) => {
                          const newFields = [...additionalStudentFields];
                          newFields[index] = e.target.value;
                          setAdditionalStudentFields(newFields);
                        }}
                        placeholder="Tên trường (vd: Ngày sinh)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setAdditionalStudentFields(additionalStudentFields.filter((_, i) => i !== index))}
                        className="px-3 py-2 text-red-600 bg-red-100 rounded-md hover:bg-red-200"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdditionalStudentFields([...additionalStudentFields, ''])}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 flex items-center"
                  >
                    + Thêm trường thông tin
                  </button>
                </div>

                {/* Monitoring Section */}
                <div className="mt-6 border-t pt-4">
                  <h3 className="text-md font-semibold text-gray-600 mb-2 text-center">Học sinh đang làm bài ({activeParticipants.filter(p => !completedStudents.some(c => c.studentId === p.studentId)).length})</h3>
                  <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded border">
                      {activeParticipants.filter(p => !completedStudents.some(c => c.studentId === p.studentId)).length > 0 ? (
                          <ul className="divide-y divide-gray-200">
                              {activeParticipants.filter(p => !completedStudents.some(c => c.studentId === p.studentId)).map((s, i) => (
                                <li key={i} className="py-2 text-sm text-gray-700 flex justify-between items-center">
                                  <span>SBD: {s.studentId} - {s.name} - {s.class} (Mã đề: {s.testVersionId})</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{new Date(s.joinTime).toLocaleTimeString()}</span>
                                    {onDeleteActiveParticipant && s.id && (
                                      <button
                                        onClick={() => setParticipantToDelete({ id: s.id!, name: s.name })}
                                        className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                                        title="Xóa học sinh đang treo"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </li>
                              ))}
                          </ul>
                      ) : (
                          <p className="text-sm text-gray-500 text-center py-2">Chưa có học sinh nào đang làm bài.</p>
                      )}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-md font-semibold text-gray-600 mb-2 text-center">Học sinh đã nộp bài ({completedStudents.length})</h3>
                  <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded border">
                      {completedStudents.length > 0 ? (
                          <ul className="divide-y divide-gray-200">
                              {completedStudents.map((s, i) => (
                                <li key={i} className="py-2 text-sm text-gray-700 flex justify-between items-center">
                                  {editingStudentId === s.id ? (
                                    <div className="flex items-center gap-2">
                                      <input 
                                        value={editStudentIdValue} 
                                        onChange={e => setEditStudentIdValue(e.target.value)} 
                                        className="border px-2 py-1 rounded w-24" 
                                        placeholder="SBD mới"
                                      />
                                      <button 
                                        onClick={() => { 
                                          if (onEditStudentId && s.id && editStudentIdValue.trim()) {
                                            onEditStudentId(s.id, editStudentIdValue.trim()); 
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
                                    <span>SBD: {s.studentId || "N/A"} - {s.name} - {s.class} (Mã đề: {s.testVersionId})</span>
                                  )}
                                  {editingStudentId !== s.id && isAdmin && (
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={() => { 
                                          setEditingStudentId(s.id || null); 
                                          setEditStudentIdValue(s.studentId || ''); 
                                        }} 
                                        className="text-blue-500 hover:text-blue-700 font-medium"
                                      >Sửa SBD</button>
                                      <button 
                                        onClick={() => {
                                          if (onDeleteStudentResult && s.id) {
                                            if (window.confirm(`Bạn có chắc chắn muốn xóa bài nộp của SBD: ${s.studentId}?`)) {
                                              onDeleteStudentResult(s.id);
                                            }
                                          }
                                        }} 
                                        className="text-red-500 hover:text-red-700 font-medium"
                                      >Xóa</button>
                                    </div>
                                  )}
                                </li>
                              ))}
                          </ul>
                      ) : (
                          <p className="text-sm text-gray-500 text-center py-4">Chưa có học sinh nào nộp bài.</p>
                      )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                    <button type="button" onClick={handleTeacherContinue} disabled={!isTeacherStepValid || isStartingSession} className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${(!isTeacherStepValid || isStartingSession) ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {isStartingSession ? 'Đang thiết lập phiên chạy...' : 'Lưu & Tiếp tục'}
                    </button>
                    <button type="button" onClick={handleExportSessionClick} disabled={!isTeacherStepValid} className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${!isTeacherStepValid ? 'bg-orange-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}>Tạo file cho học sinh</button>
                    {onReturnToRoleSelection && (
                        <button type="button" onClick={handleOpenReturnModal} className="md:col-span-2 w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                           <ChevronLeftIcon /> <span className="ml-2">{isTeacher ? 'Quay lại danh sách đề kiểm tra' : 'Quay lại chọn vai trò'}</span>
                        </button>
                    )}
                </div>
                <div className="text-center text-sm text-gray-500">
                    Chưa có file đáp án?{' '}
                    <button onClick={handleDownloadSample} type="button" className="font-medium text-blue-600 hover:text-blue-500 underline">Tải file mẫu đáp án tại đây</button>
                </div>
            </div>
          </fieldset>
        ) : (
          <fieldset className="border border-gray-300 p-4 rounded-lg">
            <legend className="text-lg font-semibold text-blue-600 px-2">Bước 2: Dành cho Học sinh</legend>
            <div className="space-y-4 pt-2">
                <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
                    {testName && <p className="text-lg font-bold text-blue-700 mb-2">{testName}</p>}
                    <p className="text-sm text-gray-700"><b>Thời gian làm bài:</b> {testInfo.duration} phút.</p>
                    <p className="text-sm text-gray-700"><b>Cấu trúc:</b> {testInfo.mc} Trắc nghiệm, {testInfo.tf} Đúng/Sai, {testInfo.sa} Trả lời ngắn, {testInfo.fr} Tự luận.</p>
                    {testInfo.startTime && <p className="text-sm text-gray-700 mt-1"><b>Mở lúc:</b> {new Date(testInfo.startTime).toLocaleString()}</p>}
                    {testInfo.endTime && <p className="text-sm text-gray-700"><b>Đóng lúc:</b> {new Date(testInfo.endTime).toLocaleString()}</p>}
                </div>
              <div>
                <label htmlFor="student-id" className="block text-sm font-medium text-gray-700">Số báo danh/Mã học sinh <span className="text-red-500 ml-1">*</span></label>
                <input id="student-id" type="text" value={studentId} onChange={(e) => {
                  const newId = e.target.value;
                  setStudentId(newId);
                  
                  if (testInfo?.allowedStudents && testInfo.allowedStudents.length > 0) {
                    const normalizedInput = newId.trim().toLowerCase();
                    const found = testInfo.allowedStudents.find(s => String(s.studentId).trim().toLowerCase() === normalizedInput);
                    
                    if (found) {
                      setStudentName(found.name || '');
                      setStudentClass(found.class || '');
                      if (found.additionalData && Object.keys(found.additionalData).length > 0) {
                        setAdditionalData(found.additionalData);
                      } else {
                        setAdditionalData({});
                      }
                    } else {
                      setStudentName('');
                      setStudentClass('');
                      setAdditionalData({});
                    }
                  }
                }} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" placeholder="SBD001" required/>
                {testInfo?.allowedStudents && testInfo.allowedStudents.length > 0 && studentId.trim() !== '' && !studentName && (
                  <p className="text-xs text-red-500 mt-1">Không tìm thấy Số báo danh/Mã học sinh này trong danh sách.</p>
                )}
              </div>
              <div><label htmlFor="student-name" className="block text-sm font-medium text-gray-700">Họ và tên <span className="text-red-500 ml-1">*</span> {testInfo?.allowedStudents && testInfo.allowedStudents.length > 0 && <span className="text-xs text-green-600">(Đã cấu hình tự động điền)</span>}</label><input id="student-name" type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" placeholder="Nguyễn Văn A" required readOnly={testInfo?.allowedStudents && testInfo.allowedStudents.length > 0 && studentName !== ''}/></div>
              <div><label htmlFor="student-class" className="block text-sm font-medium text-gray-700">Lớp <span className="text-red-500 ml-1">*</span></label><input id="student-class" type="text" value={studentClass} onChange={(e) => setStudentClass(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm" placeholder="12C1" required readOnly={testInfo?.allowedStudents && testInfo.allowedStudents.length > 0 && studentClass !== ''}/></div>
              {testInfo?.additionalStudentFields?.map(field => (
                <div key={field}>
                  <label htmlFor={`student-${field}`} className="block text-sm font-medium text-gray-700">
                    {field} <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    id={`student-${field}`}
                    type="text"
                    value={additionalData[field] || ''}
                    onChange={(e) => setAdditionalData(prev => ({ ...prev, [field]: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm"
                    required
                  />
                </div>
              ))}
              
              {!isStudentStepValid && (
                <p className="text-sm text-red-500 mb-2 font-medium">Vui lòng điền đầy đủ các thông tin bắt buộc (*)</p>
              )}
               <p className="text-sm text-center text-gray-600 italic pt-2">
                Học sinh sẽ được nhận một mã đề ngẫu nhiên từ danh sách giáo viên đã cung cấp.
              </p>
              <button type="button" onClick={handleStudentBegin} disabled={!isStudentStepValid || isStarting} className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${(!isStudentStepValid || isStarting) ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
                {isStarting ? 'Đang xử lý...' : 'Bắt đầu làm bài'}
              </button>
               
               {onReturnToRoleSelection && (
                   <button type="button" onClick={handleOpenReturnModal} className="w-full mt-3 flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                       <ChevronLeftIcon /> <span className="ml-2">{isTeacher ? 'Quay lại danh sách đề kiểm tra' : 'Thoát / Chọn lại vai trò'}</span>
                   </button>
               )}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
