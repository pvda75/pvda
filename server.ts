import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));

// Initialize GoogleGenAI on server side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper with retry and fallback across supported flash models in case of temporary demand spikes
async function generateWithRetry(params: any, maxRetries = 2) {
  const models = [
    params.model || 'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('429')) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
  }
  throw lastError;
}

// API endpoint for AI Essay Grading
app.post('/api/gemini/grade-essay', async (req, res) => {
  try {
    const {
      studentName,
      studentClass,
      frCount = 1,
      pointsPerQuestion = 1.0,
      customQuestionPrompt = '',
      rubricText = '',
      studentEssayAnswers = {},
    } = req.body;

    const prompt = `
Bạn là giáo viên chuyên gia chấm thi tự luận.
Nhiệm vụ của bạn là chấm điểm bài làm tự luận của học sinh một cách công tâm, chính xác và có tính sư phạm cao.

Thông tin bài thi:
- Số lượng câu tự luận: ${frCount} câu (mã câu hỏi từ fr-1 đến fr-${frCount}).
- Thang điểm tối đa cho mỗi câu: ${pointsPerQuestion} điểm.
${customQuestionPrompt ? `- Đề bài hoặc nội dung câu hỏi tự luận:\n"""\n${customQuestionPrompt}\n"""` : ''}
${rubricText ? `- Đáp án mẫu hoặc Barem chấm thi của giáo viên:\n"""\n${rubricText}\n"""` : '- Chưa có barem riêng, hãy tự đối chiếu kiến thức chuẩn xác để chấm logic và tính đầy đủ của các bước.'}

Bài làm của học sinh "${studentName || 'Học sinh'}" (Lớp: ${studentClass || 'N/A'}):
${Object.entries(studentEssayAnswers).map(([k, ans]) => `[Câu ${k}]: ${ans}`).join('\n')}

Yêu cầu chấm:
1. Với mỗi câu hỏi (fr-1, fr-2,...):
   - Đánh giá câu trả lời của học sinh. Nếu bỏ trống hoặc ghi linh tinh thì cho 0 điểm.
   - Cho điểm từ 0.0 đến ${pointsPerQuestion} điểm (làm tròn đến 0.25 điểm, ví dụ 0, 0.25, 0.5, 0.75, 1.0,...).
   - Đưa ra lời nhận xét ngắn gọn, rõ ràng (Feedback): khen ngợi điểm đúng, chỉ ra ý còn thiếu hoặc sai sót (khoảng 1-2 câu).
2. Trả về kết quả ĐÚNG ĐỊNH DẠNG JSON sau (không thêm văn bản ngoài):
{
  "questions": [
    {
      "key": "fr-1",
      "score": 0.75,
      "maxScore": ${pointsPerQuestion},
      "feedback": "Học sinh nêu đúng khái niệm cơ bản nhưng thiếu ví dụ minh họa."
    }
  ],
  "totalEssayScore": 0.75
}
`;

    const response = await generateWithRetry({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '{}';
    let parsedData = {};
    try {
      parsedData = JSON.parse(rawText.trim());
    } catch {
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleaned);
    }

    res.json(parsedData);
  } catch (error: any) {
    console.error('Server error in /api/gemini/grade-essay:', error);
    res.status(500).json({ error: error.message || 'Lỗi khi chấm điểm tự luận bằng AI' });
  }
});

// API endpoint for AI results analysis
app.post('/api/gemini/analyze-results', async (req, res) => {
  try {
    const { totalStudents, avgScore, maxScore, minScore, scores } = req.body;

    const prompt = `
Bạn là một chuyên gia giáo dục và phân tích dữ liệu. Hãy phân tích kết quả bài kiểm tra của học sinh dựa trên dữ liệu sau:
- Tổng số học sinh tham gia: ${totalStudents}
- Điểm trung bình: ${Number(avgScore).toFixed(2)}
- Điểm cao nhất: ${Number(maxScore).toFixed(2)}
- Điểm thấp nhất: ${Number(minScore).toFixed(2)}
- Danh sách điểm cụ thể: ${Array.isArray(scores) ? scores.join(', ') : ''}

Yêu cầu:
1. Đánh giá tổng quan về phổ điểm và tình hình làm bài của lớp.
2. Chỉ ra các điểm nổi bật (nếu có).
3. Đưa ra lời khuyên cho giáo viên để cải thiện kết quả học tập của học sinh trong các bài kiểm tra tới.
Trình bày bằng tiếng Việt, định dạng Markdown rõ ràng, dễ đọc.
`;

    const response = await generateWithRetry({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    res.json({ analysis: response.text || 'Không có phản hồi từ AI.' });
  } catch (error: any) {
    console.error('Server error in /api/gemini/analyze-results:', error);
    res.status(500).json({ error: error.message || 'Lỗi khi phân tích kết quả bằng AI' });
  }
});

// API endpoint for generating new test variations
app.post('/api/gemini/generate-test', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const response = await generateWithRetry({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Server error in /api/gemini/generate-test:', error);
    res.status(500).json({ error: error.message || 'Lỗi khi tạo đề bằng AI' });
  }
});

// General generate endpoint for flexible server calls
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, model = 'gemini-3.8-flash', systemInstruction, responseMimeType } = req.body;
    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Server error in /api/gemini/generate:', error);
    res.status(500).json({ error: error.message || 'Lỗi xử lý AI' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Development vs Production serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer();
