import React, { useState, useEffect, useCallback } from "react";
import { EnterFullscreenIcon, ExitFullscreenIcon } from "./icons";

const FullscreenToggle: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ),
  );

  const handleFullscreenChange = useCallback(() => {
    setIsFullscreen(
      !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ),
    );
  }, []);

  useEffect(() => {
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
    };
  }, [handleFullscreenChange]);

  const toggleFullscreen = () => {
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
    if (!isCurrentlyFullscreen) {
      const docEl = document.documentElement as any;
      const requestFS =
        docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.msRequestFullscreen;
      if (requestFS) {
        try {
          const promise = requestFS.call(docEl);
          if (promise && promise.catch) {
            promise.catch((err: any) => {
              alert(`Không thể bật chế độ toàn màn hình: ${err.message}`);
            });
          }
        } catch (err) {
          console.log(`Lỗi khi gọi requestFullscreen:`, err);
        }
      } else {
        alert("Trình duyệt không hỗ trợ chế độ toàn màn hình.");
      }
    } else {
      const doc = document as any;
      const exitFS =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen;
      if (exitFS) {
        exitFS.call(doc);
      }
    }
  };

  return (
    <button
      onClick={toggleFullscreen}
      className="fixed top-4 right-4 z-[100] p-2 bg-white rounded-full shadow-lg hover:bg-gray-200 transition-colors"
      aria-label={isFullscreen ? "Thoát toàn màn hình" : "Bật toàn màn hình"}
      title={isFullscreen ? "Thoát toàn màn hình" : "Bật toàn màn hình"}
    >
      {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
    </button>
  );
};

export default FullscreenToggle;
