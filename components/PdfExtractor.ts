// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';

export const extractTextFromPdf = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.onload = async function() {
            try {
                if (this.result) {
                    const typedarray = new Uint8Array(this.result as ArrayBuffer);
                    
                    // Use pdfjsLib from window if not imported correctly
                    const pdfjs = (window as any).pdfjsLib;
                    if (!pdfjs) {
                        throw new Error("PDF.js not loaded");
                    }

                    const pdf = await pdfjs.getDocument(typedarray).promise;
                    let fullText = "";

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map((item: any) => item.str).join(" ");
                        fullText += pageText + "\n\n";
                    }

                    resolve(fullText);
                }
            } catch (err) {
                reject(err);
            }
        };

        fileReader.onerror = () => {
            reject(new Error("Lỗi đọc file"));
        };

        fileReader.readAsArrayBuffer(file);
    });
};
