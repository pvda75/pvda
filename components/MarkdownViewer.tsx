import React from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownViewerProps {
  content: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  return (
    <div className="w-full h-full bg-gray-100 overflow-y-auto overflow-x-hidden custom-scrollbar print:overflow-visible print:h-auto print:bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="w-full min-h-max p-4 md:p-8 lg:p-12 pb-24 print:p-0 print:m-0">
        <div className="bg-white mx-auto p-6 md:p-10 rounded-xl shadow-md border border-gray-200 print:shadow-none print:border-none print:max-w-none print:p-0 print:m-0" style={{ maxWidth: '900px' }}>
          <div 
            className="prose prose-slate prose-sm md:prose-base max-w-none break-words w-full text-left print:text-black"
            style={{ lineHeight: '1.2' }}
          >
            <Markdown 
              remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              components={{
                table: ({node, ...props}) => (
                  <div className="w-full overflow-x-auto my-4 border border-gray-300 rounded-md print:border-none print:overflow-visible">
                    <table className="w-full min-w-full divide-y divide-gray-200 m-0 print:break-inside-avoid" {...props} />
                  </div>
                ),
                tr: ({node, ...props}) => <tr className="print:break-inside-avoid" {...props} />,
                th: ({node, ...props}) => <th className="bg-gray-50 px-3 py-2 text-left text-sm font-bold text-gray-900 leading-snug print:bg-white print:border-b print:border-gray-300" {...props} />,
                td: ({node, ...props}) => <td className="px-3 py-2 text-sm text-gray-700 border-t border-gray-200 leading-snug align-top print:border-gray-300" {...props} />,
                p: ({node, ...props}) => <p className="mb-1 leading-[1.2] whitespace-pre-wrap break-words flow-root text-gray-800 print:break-inside-avoid print:text-black" {...props} />,
                li: ({node, ...props}) => <li className="mb-0 leading-[1.2] break-words text-gray-800 print:break-inside-avoid print:text-black" {...props} />,
                img: ({node, ...props}) => <img className="max-w-full h-auto rounded-md my-1 block object-contain mx-auto print:max-h-none print:break-inside-avoid" style={{maxHeight: '60vh'}} {...props} />,
                pre: ({node, ...props}) => <pre className="bg-gray-50 rounded-md p-2 overflow-x-auto border border-gray-200 my-2 print:break-inside-avoid print:bg-white print:border-gray-300 print:whitespace-pre-wrap" {...props} />,
                code: ({node, ...props}) => <code className="bg-gray-100 rounded px-1.5 py-0.5 text-sm font-mono text-pink-600 break-words print:bg-transparent print:text-black" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-xl md:text-2xl font-bold mb-2 mt-4 text-gray-900 border-b pb-1 leading-snug print:break-after-avoid" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-lg md:text-xl font-bold mt-4 mb-2 text-gray-800 leading-snug print:break-after-avoid" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-base md:text-lg font-bold mt-3 mb-1 text-gray-800 leading-snug print:break-after-avoid" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2 flow-root print:break-inside-avoid" {...props} />,
              }}
            >
              {content}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkdownViewer;
