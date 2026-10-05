import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface PdfViewerProps {
  file: File;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.5);

  const renderPage = useCallback(
    async (num: number, currentScale: number) => {
      if (!pdfDoc) return;

      setIsLoading(true);
      try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: currentScale });
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
        }
      } catch (err) {
        setError("Không thể hiển thị trang.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    },
    [pdfDoc],
  );

  useEffect(() => {
    const loadPdf = async () => {
      try {
        const fileReader = new FileReader();
        fileReader.onload = async function () {
          try {
            if (this.result) {
              const typedarray = new Uint8Array(this.result as ArrayBuffer);

              // Wait for pdfjsLib to load
              let retries = 0;
              while (!(window as any).pdfjsLib && retries < 20) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                retries++;
              }

              if (!(window as any).pdfjsLib) {
                setError("Thư viện PDF chưa được tải. Vui lòng tải lại trang.");
                setIsLoading(false);
                return;
              }

              const pdf = await (window as any).pdfjsLib.getDocument({ data: typedarray })
                .promise;
              setPdfDoc(pdf);
              setNumPages(pdf.numPages);
              setPageNum(1);
            }
          } catch (err) {
            setError("Không thể tải file PDF. File có thể bị lỗi.");
            console.error("Error loading PDF document:", err);
            setIsLoading(false);
          }
        };
        fileReader.onerror = () => {
          setError("Lỗi khi đọc file PDF.");
          setIsLoading(false);
        };
        fileReader.readAsArrayBuffer(file);
      } catch (err) {
        setError("Không thể tải file PDF.");
        console.error(err);
        setIsLoading(false);
      }
    };
    loadPdf();
  }, [file]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNum, scale);
    }
  }, [pdfDoc, pageNum, scale, renderPage]);

  const onPrevPage = () => {
    if (pageNum <= 1) return;
    setPageNum(pageNum - 1);
  };

  const onNextPage = () => {
    if (pageNum >= numPages) return;
    setPageNum(pageNum + 1);
  };

  const onZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const onZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 text-white rounded-lg shadow-inner overflow-hidden">
      <div className="flex flex-wrap items-center justify-between p-2 bg-gray-900 rounded-t-lg gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevPage}
            disabled={pageNum <= 1}
            className="p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-sm">
            Trang {pageNum} / {numPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={pageNum >= numPages || numPages === 0}
            className="p-2 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onZoomOut}
            disabled={scale <= 0.5}
            className="p-1 px-3 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 font-bold text-lg"
          >
            -
          </button>
          <span className="text-sm w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            disabled={scale >= 3.0}
            className="p-1 px-3 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 font-bold text-lg"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex-grow overflow-auto p-4 flex justify-center items-start">
        {error && <div className="text-red-400">{error}</div>}
        <div style={{ position: "relative", minHeight: "100px" }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          )}
          <canvas ref={canvasRef} className="rounded shadow-lg" />
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
