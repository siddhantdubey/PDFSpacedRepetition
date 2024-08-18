import React, { useRef } from 'react';
import { Button } from './ui/button';

interface FileSelectorProps {
  onFileSelect: (file: File) => void;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#525659]">
      <h1 className="text-2xl font-bold mb-4 text-white">PDF Spaced Repetition</h1>
      <div className="mb-4">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
          ref={fileInputRef}
        />
        <Button variant="outline" onClick={handleButtonClick} className="cursor-pointer">
          Select PDF File
        </Button>
      </div>
    </div>
  );
};

export default FileSelector;