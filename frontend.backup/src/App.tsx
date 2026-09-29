import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import { ingestPdfs, queryBot } from './services/api';
import './App.css';

interface Message {
  text: string;
  sender: 'user' | 'bot';
  sources?: string[];
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'hi'>('en');
  const [isBotSpeaking, setIsBotSpeaking] = useState<boolean>(false);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);

  // Web Speech Synthesis for bot responses
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = currentLanguage === 'en' ? 'en-US' : 'hi-IN'; // Set language for speech
      utterance.onstart = () => setIsBotSpeaking(true);
      utterance.onend = () => setIsBotSpeaking(false);
      utterance.onerror = () => setIsBotSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn('Speech Synthesis API not supported in this browser.');
    }
  };

  const handleSendMessage = async (text: string, isVoiceInput: boolean = false) => {
    if (text.trim() === '') return;

    const userMessage: Message = { text, sender: 'user' };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await queryBot(text);
      const botAnswer = response.answer;
      const sources = response.sources;

      const botMessage: Message = {
        text: botAnswer,
        sender: 'bot',
        sources: sources,
      };
      setMessages((prev) => [...prev, botMessage]);

      if (isVoiceInput) {
        speak(botAnswer);
      }
    } catch (error) {
      console.error('Error querying bot:', error);
      setMessages((prev) => [
        ...prev,
        { text: 'Error: Could not get a response from the bot.', sender: 'bot' },
      ]);
    }
  };

  const handleIngestPdfs = async (files: FileList) => {
    if (files.length === 0) return;

    setIsIngesting(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await ingestPdfs(formData);
      alert('PDFs ingested successfully!');
    } catch (error) {
      console.error('Error ingesting PDFs:', error);
      alert('Error ingesting PDFs.');
    } finally {
      setIsIngesting(false);
    }
  };

  const toggleLanguage = () => {
    setCurrentLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  useEffect(() => {
    // Optional: Add a welcome message when the component mounts
    setMessages([
      {
        text:
          currentLanguage === 'en'
            ? "Hello! How can I assist you with cooperative laws and schemes today?"
            : "नमस्ते! आज मैं सहकारिता कानूनों और योजनाओं में आपकी कैसे मदद कर सकता हूँ?",
        sender: 'bot',
      },
    ]);
  }, [currentLanguage]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>SahayBot</h1>
        <button onClick={toggleLanguage} className="language-toggle">
          {currentLanguage === 'en' ? 'Switch to Hindi' : 'अंग्रेजी में बदलें'}
        </button>
      </header>
      <ChatWindow messages={messages} />
      <MessageInput
        onSendMessage={handleSendMessage}
        onIngestPdfs={handleIngestPdfs}
        currentLanguage={currentLanguage}
        isBotSpeaking={isBotSpeaking}
        isIngesting={isIngesting}
      />
    </div>
  );
};

export default App;