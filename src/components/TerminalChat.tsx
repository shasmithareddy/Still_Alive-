import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { communicationService, ChatMessage } from '@/services/communicationService';

const TerminalChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(communicationService.getMessageHistory());
    const unsub = communicationService.onMessage((msg) => {
      setMessages(prev => [...prev, msg]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (input.startsWith('/connect ')) {
      const peerId = input.split(' ')[1];
      communicationService.connectToPeer(peerId).catch(console.error);
    } else if (input === '/sos') {
      communicationService.sendSOS();
    } else {
      communicationService.sendMessage(input.trim());
    }
    setInput('');
  };

  const getMessageStyle = (msg: ChatMessage) => {
    if (msg.type === 'system') return 'text-muted-foreground italic';
    if (msg.type === 'sos') return 'text-destructive glow-text-red font-bold';
    if (msg.sender === communicationService.getUsername()) return 'text-foreground';
    return 'text-secondary-foreground';
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full border border-border bg-card rounded-sm" style={{ boxShadow: 'var(--terminal-glow)' }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-foreground glow-text">MESH://CHAT</span>
        <span className="text-xs text-muted-foreground">{messages.length} msgs</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
        {messages.length === 0 && (
          <div className="text-muted-foreground">
            {'>'} Waiting for traffic... Type /connect &lt;peer-id&gt; to link nodes
          </div>
        )}
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            className={getMessageStyle(msg)}
          >
            <span className="text-muted-foreground">[{formatTime(msg.timestamp)}]</span>{' '}
            {msg.type !== 'system' && <span className="text-secondary-foreground">{msg.sender}:</span>}{' '}
            {msg.content}
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-border px-3 py-2 flex gap-2">
        <span className="text-foreground glow-text text-sm">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-foreground font-mono text-xs caret-primary"
          placeholder="message or /connect <peer-id> or /sos"
        />
      </form>
    </div>
  );
};

export default TerminalChat;
