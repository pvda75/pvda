
import { Answers, ScoreConfig } from './types';

/**
 * Parses an answer key from an Excel file.
 */
export const parseAnswerKey = (file: File): Promise<Answers> => {
  return new Promise<Answers>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof (window as any).XLSX === "undefined") {
          throw new Error("Thư viện XLSX chưa được tải.");
        }
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = (window as any).XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: any[] = (window as any).XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        });
        const answers: Answers = {};
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (row && row[0] && row[1] !== undefined) {
            const key = normalizeQuestionKey(String(row[0]));
            if (key) answers[key] = String(row[1]).trim();
          }
        }
        resolve(answers);
      } catch (error) {
        console.error("Error processing Excel file:", error);
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Lỗi đọc file đáp án"));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Chuẩn hóa mã câu hỏi để so khớp.
 */
export const normalizeQuestionKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Chuẩn hóa một chuỗi câu trả lời để so sánh.
 */
export const normalizeAnswer = (answer: string | undefined): string => {
  if (!answer) return '';
  const lower = answer.trim().toLowerCase();
  if (['đúng', 'd', 'true', 't'].includes(lower)) return 'đúng';
  if (['sai', 's', 'false', 'f'].includes(lower)) return 'sai';
  return lower.toUpperCase();
};

/**
 * Tính điểm tối đa dựa trên cấu hình số lượng câu hỏi.
 */
export const calculateMaxScore = (
    numMultipleChoice: number,
    numTrueFalse: number,
    numShortAnswer: number,
    numFreeResponse: number,
    scoreConfig?: ScoreConfig
): number => {
    if (scoreConfig) {
        return scoreConfig.totalScore;
    }

    // Trường hợp 1: Không có Tự luận (FR) và Trả lời ngắn (SA) -> Thang điểm 10
    if (numShortAnswer === 0 && numFreeResponse === 0) {
         if (numMultipleChoice > 0 || numTrueFalse > 0) return 10;
         return 0;
    }

    // Trường hợp 2: Có SA hoặc FR -> Tính theo điểm cố định tích lũy
    const mcPoints = numMultipleChoice * 0.25;
    const tfPoints = (numTrueFalse * 4) * 0.25; // Mỗi câu Đúng/Sai có 4 ý
    const saPoints = numShortAnswer * 0.25;
    const frPoints = numFreeResponse * 1.0;

    return mcPoints + tfPoints + saPoints + frPoints;
};

/**
 * Tính điểm thực tế dựa trên bài làm.
 */
export const calculateScore = (
    studentAnswers: Answers, 
    correctAnswers: Answers,
    numMultipleChoice: number,
    numTrueFalse: number,
    numShortAnswer: number = 0,
    numFreeResponse: number = 0,
    scoreConfig?: ScoreConfig
): number => {
    let correctMcCount = 0;
    let correctTfCount = 0;
    let correctSaCount = 0;

    // 1. Chấm Trắc nghiệm (MC)
    if (numMultipleChoice > 0) {
        for (let i = 1; i <= numMultipleChoice; i++) {
            const key = `mc-${i}`;
            const normalizedKey = normalizeQuestionKey(key);
            if (studentAnswers[key] && correctAnswers[normalizedKey] !== undefined && normalizeAnswer(studentAnswers[key]) === normalizeAnswer(correctAnswers[normalizedKey])) {
                correctMcCount++;
            }
        }
    }

    // 2. Chấm Đúng/Sai (TF)
    const totalTfItems = numTrueFalse * 4;
    if (totalTfItems > 0) {
        for (let i = 1; i <= numTrueFalse; i++) {
            ['a', 'b', 'c', 'd'].forEach(part => {
                const key = `tf-${i}-${part}`;
                const normalizedKey = normalizeQuestionKey(key);
                if (studentAnswers[key] && correctAnswers[normalizedKey] !== undefined && normalizeAnswer(studentAnswers[key]) === normalizeAnswer(correctAnswers[normalizedKey])) {
                    correctTfCount++;
                }
            });
        }
    }

    // 3. Chấm Trả lời ngắn (SA)
    if (numShortAnswer > 0) {
        for (let i = 1; i <= numShortAnswer; i++) {
            const key = `sa-${i}`;
            const normalizedKey = normalizeQuestionKey(key);
            if (studentAnswers[key] && correctAnswers[normalizedKey] !== undefined) {
                if (studentAnswers[key].trim().toLowerCase() === String(correctAnswers[normalizedKey]).trim().toLowerCase()) {
                    correctSaCount++;
                }
            }
        }
    }

    if (scoreConfig) {
        const rawScore = (correctMcCount * scoreConfig.mcPoints) + 
                         (correctTfCount * scoreConfig.tfPoints) + 
                         (correctSaCount * scoreConfig.saPoints);
        
        const maxRawScore = (numMultipleChoice * scoreConfig.mcPoints) + 
                            (totalTfItems * scoreConfig.tfPoints) + 
                            (numShortAnswer * scoreConfig.saPoints) + 
                            (numFreeResponse * scoreConfig.frPoints);

        if (maxRawScore === 0) return 0;
        
        // Scale to totalScore
        return (rawScore / maxRawScore) * scoreConfig.totalScore;
    }

    // Fallback to old logic
    const isScaleTo10 = numShortAnswer === 0 && numFreeResponse === 0;
    let mcScore = 0;
    let tfScore = 0;
    let saScore = correctSaCount * 0.25;

    if (numMultipleChoice > 0) {
        if (isScaleTo10) {
            const mcWeight = numTrueFalse > 0 ? 6 : 10;
            mcScore = (correctMcCount / numMultipleChoice) * mcWeight;
        } else {
            mcScore = correctMcCount * 0.25;
        }
    }

    if (totalTfItems > 0) {
        if (isScaleTo10) {
            const tfWeight = numMultipleChoice > 0 ? 4 : 10;
            tfScore = (correctTfCount / totalTfItems) * tfWeight;
        } else {
            tfScore = correctTfCount * 0.25;
        }
    }

    return mcScore + tfScore + saScore;
};

/**
 * Chuẩn hóa mã phiên kiểm tra: thay khoảng trắng bằng '-', loại bỏ ký tự không hợp lệ
 */
export const sanitizeSessionCode = (code: string): string => {
  return code
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '');
};

/**
 * Kiểm tra mã phiên kiểm tra hợp lệ: 3-50 ký tự gồm chữ cái, chữ số, '-' hoặc '_'
 */
export const isValidSessionCode = (code: string): boolean => {
  return /^[a-zA-Z0-9_-]{3,50}$/.test(code);
};

/**
 * Gợi ý mã phiên dễ nhớ từ tên đề kiểm tra
 */
export const suggestSessionCode = (testName?: string): string => {
  if (!testName || !testName.trim()) {
    return 'KT-' + Math.floor(1000 + Math.random() * 9000);
  }
  const nonAccent = testName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

  let slug = nonAccent
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length > 20) {
    slug = slug.substring(0, 20).replace(/-$/, '');
  }
  return slug || ('KT-' + Math.floor(1000 + Math.random() * 9000));
};
