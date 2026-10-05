import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Đã xảy ra lỗi không xác định.";
      let errorDetails = "";

      if (this.state.error) {
        try {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError && parsedError.error) {
            errorMessage = "Lỗi quyền truy cập cơ sở dữ liệu (Firestore).";
            errorDetails = JSON.stringify(parsedError, null, 2);
          } else {
            errorMessage = this.state.error.message;
          }
        } catch (e) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Đã xảy ra lỗi</h1>
            <p className="text-gray-700 mb-4">{errorMessage}</p>
            {errorDetails && (
              <pre className="bg-gray-100 p-4 rounded text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap">
                {errorDetails}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
