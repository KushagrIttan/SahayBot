import React, { useRef, useEffect } from 'react';
import './ChatWindow.css';

interface Message {
  text: string;
  sender: 'user' | 'bot';
  sources?: string[];
}

interface ChatWindowProps {
  messages: Message[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chat-window">
      {messages.map((message, index) => (
        <div key={index} className={`message-container ${message.sender}`}>
          <div className="message-bubble">
            <p>{message.text}</p>
            {message.sources && message.sources.length > 0 && (
              <div className="message-sources">
                <strong>Sources:</strong>
                <ul>
                  {message.sources.map((source, srcIndex) => (
                    <li key={srcIndex}>{source.split('/').pop()}</li> // Display just the filename
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatWindow;