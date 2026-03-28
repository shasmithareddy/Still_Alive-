import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { communicationService, ChatMessage } from '@/services/communicationService';

const TerminalChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [debugMode, setDebugMode] = useState(false);
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

  const addSystemMessage = (content: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'SYSTEM',
      content,
      timestamp: Date.now(),
      type: 'system',
    };
    setMessages(prev => [...prev, msg]);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const trimmedInput = input.trim();

    if (trimmedInput === '/help') {
      addSystemMessage('📖 Available commands:');
      addSystemMessage('  /connect <peer-id>   - Connect to a peer');
      addSystemMessage('  /peers               - List connected peers');
      addSystemMessage('  /status              - Show connection status');
      addSystemMessage('  /zone                - Show current zone');
      addSystemMessage('  /sos                 - Send SOS signal');
      addSystemMessage('  /debug               - Toggle debug mode');
      addSystemMessage('  /clear               - Clear messages');
      addSystemMessage('  /help                - Show this message');
    }
    else if (trimmedInput === '/peers') {
      const peers = communicationService.getConnectedPeers();
      if (peers.length === 0) {
        addSystemMessage('❌ No peers connected');
      } else {
        addSystemMessage(`📡 Connected peers (${peers.length}):`);
        peers.forEach((peerId, idx) => {
          addSystemMessage(`  ${idx + 1}. ${peerId}`);
        });
      }
    }
    else if (trimmedInput === '/zone') {
      const room = communicationService.getCurrentRoom();
      addSystemMessage(`📍 Current zone: ${room || 'not joined yet'}`);
    }
    else if (trimmedInput === '/status') {
      const peerId = communicationService.getPeerId();
      const peers = communicationService.getConnectedPeers();
      const room = communicationService.getCurrentRoom();
      addSystemMessage(`📊 Status Report:`);
      addSystemMessage(`  Node ID: ${peerId}`);
      addSystemMessage(`  Zone: ${room || 'none'}`);
      addSystemMessage(`  WebRTC Peers: ${peers.length}`);
      addSystemMessage(`  Messages: ${communicationService.getMessageHistory().length}`);
      if (debugMode) addSystemMessage(`  Debug Mode: ON`);
    }
    else if (trimmedInput === '/debug') {
      setDebugMode(!debugMode);
      addSystemMessage(`🐛 Debug mode ${!debugMode ? 'enabled' : 'disabled'}`);
    }
    else if (trimmedInput === '/clear') {
      setMessages([]);
    }
    else if (trimmedInput.startsWith('/connect ')) {
      const peerId = trimmedInput.split(' ')[1];
      if (!peerId) {
        addSystemMessage('❌ Usage: /connect <peer-id>');
        setInput('');
        return;
      }
      addSystemMessage(`🔗 Connecting to ${peerId.slice(0, 8)}...`);
      communicationService.connectToPeer(peerId)
        .then(() => addSystemMessage(`✅ Connected to ${peerId.slice(0, 8)}...`))
        .catch((err) => {
          addSystemMessage(`❌ Connection failed: ${err.message}`);
          if (debugMode) console.error('Connection error:', err);
        });
    }
    else if (trimmedInput === '/sos') {
      communicationService.sendSOS();
    }
    else {
      communicationService.sendMessage(trimmedInput);
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
    return new Date(ts).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full border border-border bg-card rounded-sm" style={{ boxShadow: 'var(--terminal-glow)' }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-foreground glow-text">
          MESH://CHAT {debugMode && '🐛'}
        </span>
        <span className="text-xs text-muted-foreground">{messages.length} msgs</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
        {messages.length === 0 && (
          <div className="text-muted-foreground">
            {'>'} Type /help for commands. /connect &lt;peer-id&gt; to link nodes
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
            {msg.type !== 'system' && (
              <span className={msg.sender === communicationService.getUsername() ? 'text-primary' : 'text-secondary-foreground'}>
                {msg.sender}:
              </span>
            )}{' '}
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
          placeholder="Type /help for commands"
          autoFocus
        />
      </form>
    </div>
  );
};

export default TerminalChat;
