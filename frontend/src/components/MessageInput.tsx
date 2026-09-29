import React, { useState, useRef, useEffect } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSendMessage: (text: string, isVoiceInput?: boolean) => void;
  onIngestPdfs: (files: FileList) => void;
  currentLanguage: 'en' | 'hi';
  isBotSpeaking: boolean;
  isIngesting: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onIngestPdfs,
  currentLanguage,
  isBotSpeaking,
  isIngesting,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = currentLanguage === 'en' ? 'en-US' : 'hi-IN';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        onSendMessage(transcript, true);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    } else {
      console.warn('Speech Recognition API not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [currentLanguage, onSendMessage]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const handleSendClick = () => {
    onSendMessage(inputText);
    setInputText('');
  };

  const handleMicClick = () => {
    if (recognitionRef.current) {
      if (isListening) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
        setInputText('');
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onIngestPdfs(event.target.files);
      event.target.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="message-input-container">
      <input
        type="text"
        value={inputText}
        onChange={handleTextChange}
        onKeyPress={(e) => e.key === 'Enter' && handleSendClick()}
        placeholder={
          currentLanguage === 'en' ? 'Type your message...' : 'अपना संदेश लिखें...'
        }
        disabled={isListening || isBotSpeaking || isIngesting}
      />
      <button onClick={handleSendClick} disabled={inputText.trim() === '' || isBotSpeaking || isIngesting}>
        {currentLanguage === 'en' ? 'Send' : 'भेजें'}
      </button>
      <button onClick={handleMicClick} className={isListening ? 'listening' : ''} disabled={isBotSpeaking || isIngesting}>
        {isListening ? '🎙️ Stop' : '🎙️ Speak'}
      </button>
      <input
        type="file"
        multiple
        accept=".pdf"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={isIngesting}
      />
      <button onClick={triggerFileInput} disabled={isIngesting}>
        {isIngesting ? 'Ingesting...' : 'Upload PDFs'}
      </button>
    </div>
  );
};

export default MessageInput;