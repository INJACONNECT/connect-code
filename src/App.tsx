import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  MessageSquare,
  Send,
  X,
  RefreshCw,
  Heart,
  UserCircle,
  LogOut,
  Home,
  Bell,
  Settings,
  CircleUserRound,
  Activity,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileText,
  UserCheck,
  ToggleLeft as Toggle,
  Scale,
  Phone,
  Lock,
  Bookmark,
  History,
  Check,
  CheckCheck,
  MoreVertical,
  Trash2,
  Ban,
  ImageIcon,
  Mic,
  Paperclip,
  ArrowUp,
  Download,
  Play,
  Pause,
  Camera,
  RotateCcw,
  Video,
  VideoOff
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Gender = 'male' | 'female' | 'other';
type AppState = 'login' | 'register' | 'setup' | 'matching' | 'chat' | 'forgot-password';
type Tab = 'home' | 'chats' | 'notifications' | 'settings' | 'profile';
type ProfileView = 'menu' | 'personal-details' | 'settings' | 'legal' | 'block-list';

interface Message {
  id: string;
  sender: 'me' | 'stranger';
  text: string;
  audio?: string;
  image?: string;
  video?: string;
  file?: string;
  fileName?: string;
  type?: 'text' | 'audio' | 'image' | 'video' | 'file';
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'seen';
  isDeleted?: boolean;
}

interface SavedChat {
  id: string;
  stranger: {
    userId: string;
    nickname: string;
    gender: Gender;
    isOnline?: boolean;
  };
  messages: Message[];
  lastActivity: Date;
  unreadCount: number;
  isCleared?: boolean;
}

interface UserProfile {
  nickname: string;
  gender: Gender;
  preference: Gender | 'any';
}

interface AppSettings {
  notifications: boolean;
  privateMode: boolean;
}

type AppNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
};

function VoiceMessage({ audioSrc, durationStr }: { audioSrc: string, durationStr: string }) {

  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const parseDuration = (str: string) => {
    const parts = str.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  };

  const initialSeconds = parseDuration(durationStr);

  useEffect(() => {
    setTimeLeft(initialSeconds);
  }, [durationStr, initialSeconds]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioSrc);
        audioRef.current.onended = () => {
          setIsPlaying(false);
          setTimeLeft(initialSeconds);
          if (intervalRef.current) clearInterval(intervalRef.current);
        };
      }
      audioRef.current.play();
      setIsPlaying(true);
      
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 px-3 bg-black/5 rounded-full min-w-[180px] border-[0.5px] border-black/5">
      <button 
        type="button"
        onClick={togglePlay} 
        className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-all active:scale-90 shadow-sm flex-shrink-0"
      >
        {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 h-[2px] bg-slate-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300" 
          style={{ width: `${((initialSeconds - timeLeft) / initialSeconds) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-slate-500 font-mono flex-shrink-0">
        {formatTime(timeLeft)}
      </span>
    </div>
  );
}

export default function App() {
  const [userId, setUserId] = useState(() => {
    const savedPhone = localStorage.getItem('user_phone');
    if (savedPhone) return savedPhone;
    let id = localStorage.getItem('app_user_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('app_user_id', id);
    }
    return id;
  });

  const [appState, setAppState] = useState<AppState>(() => {
    return localStorage.getItem('user_profile') ? 'setup' : 'login';
  });
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [profileView, setProfileView] = useState<ProfileView>('menu');
  const [loginType, setLoginType] = useState<'guest' | 'user'>('guest');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('user_profile');
    return saved ? JSON.parse(saved) : {
      nickname: '',
      gender: 'other',
      preference: 'any',
    };
  });
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : {
      notifications: true,
      privateMode: false,
    };
  });

  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: '1',
      title: 'Welcome to Connect!',
      message: 'Start chatting with strangers anonymously today.',
      time: 'Just now',
      unread: true
    },
    {
      id: '2',
      title: 'Safety Tip',
      message: 'Never share your personal information with strangers.',
      time: '2 hours ago',
      unread: false
    }
  ]);

  // Temporary state for editing profile
  const [editProfile, setEditProfile] = useState<UserProfile>(userProfile);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStrangerTyping, setIsStrangerTyping] = useState(false);
  const [isSavedChat, setIsSavedChat] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<{id: string, nickname: string, gender: Gender}[]> (() => {    const saved = localStorage.getItem('blocked_users');
    return saved ? JSON.parse(saved) : [];
  });

  const [matchedStranger, setMatchedStranger] = useState<{ userId: string; nickname: string; gender: string } | null>(null);
  const matchedStrangerRef = useRef(matchedStranger);

  useEffect(() => {
    matchedStrangerRef.current = matchedStranger;
  }, [matchedStranger]);

  // Sync typing status
  useEffect(() => {
    if (appState === 'chat' && currentChatId && socketRef.current) {
      const isTyping = inputValue.length > 0;
      socketRef.current.emit('typing', {
        toUserId: matchedStranger?.userId,
        isTyping
      });
    }
  }, [inputValue, appState, currentChatId, matchedStranger]);

  const [strangerOnline, setStrangerOnline] = useState(false);
  const [showStrangerProfile, setShowStrangerProfile] = useState(false);
  const [isBlockedByStranger, setIsBlockedByStranger] = useState(false);
  
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    const saved = localStorage.getItem('saved_chats');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return parsed.map((chat: any) => ({
        ...chat,
        messages: chat.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
        lastActivity: new Date(chat.lastActivity),
        unreadCount: chat.unreadCount || 0
      }));
    } catch (e) {
      return [];
    }
  });

  const [meRequestedSave, setMeRequestedSave] = useState(false);
  const [strangerRequestedSave, setStrangerRequestedSave] = useState(false);
    const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
    const [chatsMenuOpen, setChatsMenuOpen] = useState(false);
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [blockEntrySource, setBlockEntrySource] = useState<'chats' | 'settings' | null>(null);
  const [longPressedMessageId, setLongPressedMessageId] = useState<string | null>(null);
    const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
      const [voiceRecorded, setVoiceRecorded] = useState(false);
      const [audioBlob, setAudioBlob] = useState<string | null>(null);
      const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
      const mediaRecorderRef = useRef<MediaRecorder | null>(null);
      const audioChunksRef = useRef<Blob[]>([]);
      const shouldRecordRef = useRef(false);
      const imageInputRef = useRef<HTMLInputElement>(null);
      const fileInputRef = useRef<HTMLInputElement>(null);
      
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedMedia, setCapturedMedia] = useState<{type: 'image' | 'video', data: string} | null>(null);
  const [isRecordingCamera, setIsRecordingCamera] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const isCameraInitializingRef = useRef(false);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);

  const [liveCount, setLiveCount] = useState(0);
  const appStateRef = useRef(appState);
  const currentChatIdRef = useRef(currentChatId);
  const blockedUsersRef = useRef(blockedUsers);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    blockedUsersRef.current = blockedUsers;
  }, [blockedUsers]);

  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Initialize Socket.io
  useEffect(() => {
    // If we are in a sandbox or production environment where the server serves the frontend,
    // we should use relative path to avoid CORS and WebSocket issues across different domains.
    const backendUrl = ''; // Force relative path to use Vite proxy or same-origin server
    
    console.log('Initializing socket connection to relative origin');
    
    const socket = io({
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['polling', 'websocket'],
      forceNew: true,
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to backend successfully:', socket.id);
      setSocketConnected(true);
      
      // Auth with backend
      socket.emit('auth', {
        userId,
        nickname: userProfile.nickname,
        gender: userProfile.gender,
        preference: userProfile.preference,
        privateMode: settings.privateMode
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setSocketConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from backend:', reason);
      setSocketConnected(false);
    });

    socket.on('match_found', ({ sessionId, partner }) => {
      console.log('Match found!', sessionId);
      setMatchedStranger(partner);
      setStrangerOnline(true);
      setCurrentChatId(sessionId);
      setAppState('chat');
      setMatchingStatus('searching');
      setMessages([]);
      setMeRequestedSave(false);
      setStrangerRequestedSave(false);
      setIsSavedChat(false);
      
      if (matchingIntervalRef.current) {
        clearInterval(matchingIntervalRef.current);
        matchingIntervalRef.current = null;
      }
    });

    socket.on('pending_messages', (pending) => {
      pending.forEach((msg: any) => {
        // Skip if blocked
        if (blockedUsersRef.current.some(u => u.id === msg.sessionId)) return;

        const formattedMsg: Message = {
          id: msg.id,
          sender: 'stranger',
          text: msg.text,
          audio: msg.audio,
          image: msg.image,
          video: msg.video,
          file: msg.file,
          fileName: msg.fileName,
          type: msg.type,
          timestamp: new Date(msg.timestamp),
          status: msg.status
        };
        
        // Only update current messages if it belongs to active chat
        if (currentChatIdRef.current === msg.sessionId) {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, formattedMsg];
          });
        }

        // ALWAYS update saved chats if this belongs to one
        setSavedChats(prev => {
          const existing = prev.find(c => c.id === msg.sessionId);
          const isInThisChat = appStateRef.current === 'chat' && currentChatIdRef.current === msg.sessionId;

          if (existing) {
            return prev.map(c => {
              if (c.id !== msg.sessionId) return c;
              if (c.messages.find(m => m.id === msg.id)) return c;
              
              return {
                ...c,
                isCleared: false,
                unreadCount: isInThisChat ? (c.unreadCount || 0) : (c.unreadCount || 0) + 1,
                messages: [...c.messages, formattedMsg],
                lastActivity: new Date()
              };
            });
          } else if (currentChatIdRef.current === msg.sessionId && matchedStrangerRef.current) {
            // Auto-add active chat to list if a message is received (makes it appear in chat board)
            return [{
              id: msg.sessionId,
              stranger: {
                userId: matchedStrangerRef.current.userId,
                nickname: matchedStrangerRef.current.nickname,
                gender: matchedStrangerRef.current.gender as Gender,
                isOnline: true
              },
              messages: [formattedMsg],
              lastActivity: new Date(),
              unreadCount: isInThisChat ? 0 : 1,
              isCleared: false
            }, ...prev];
          }
          return prev;
        });

        // Mark seen if in chat
        if (appStateRef.current === 'chat' && currentChatIdRef.current === msg.sessionId) {
          socket.emit('mark_seen', { messageIds: [msg.id] });
        }
      });
    });

    socket.on('new_msg', (msg) => {
      // Skip if blocked
      if (blockedUsersRef.current.some(u => u.id === msg.sessionId)) return;

      const formattedMsg: Message = {
        id: msg.id,
        sender: 'stranger',
        text: msg.text,
        audio: msg.audio,
        image: msg.image,
        video: msg.video,
        file: msg.file,
        fileName: msg.fileName,
        type: msg.type,
        timestamp: new Date(msg.timestamp),
        status: msg.status
      };
      
      // Only update current messages if it belongs to active chat
      if (currentChatIdRef.current === msg.sessionId) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, formattedMsg];
        });
      }

      // ALWAYS update saved chats if this belongs to one
      setSavedChats(prev => {
        const existing = prev.find(c => c.id === msg.sessionId);
        const isInThisChat = appStateRef.current === 'chat' && currentChatIdRef.current === msg.sessionId;

        if (existing) {
          return prev.map(c => {
            if (c.id !== msg.sessionId) return c;
            if (c.messages.find(m => m.id === msg.id)) return c;
            
            return {
              ...c,
              isCleared: false,
              unreadCount: isInThisChat ? (c.unreadCount || 0) : (c.unreadCount || 0) + 1,
              messages: [...c.messages, formattedMsg],
              lastActivity: new Date()
            };
          });
        } else if (currentChatIdRef.current === msg.sessionId && matchedStrangerRef.current) {
          // Auto-add active chat to list if a message is received (makes it appear in chat board)
          return [{
            id: msg.sessionId,
            stranger: {
              userId: matchedStrangerRef.current.userId,
              nickname: matchedStrangerRef.current.nickname,
              gender: matchedStrangerRef.current.gender as Gender,
              isOnline: true
            },
            messages: [formattedMsg],
            lastActivity: new Date(),
            unreadCount: isInThisChat ? 0 : 1,
            isCleared: false
          }, ...prev];
        }
        return prev;
      });

      // Mark seen if in chat
      if (appStateRef.current === 'chat' && currentChatIdRef.current === msg.sessionId) {
        socket.emit('mark_seen', { messageIds: [msg.id] });
      }
    });

    socket.on('msg_sent', (msg) => {
      const formattedMsg: Message = {
        id: msg.id,
        sender: 'me',
        text: msg.text,
        audio: msg.audio,
        image: msg.image,
        video: msg.video,
        file: msg.file,
        fileName: msg.fileName,
        type: msg.type,
        timestamp: new Date(msg.timestamp),
        status: msg.status
      };
      
      if (currentChatIdRef.current === msg.sessionId) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, formattedMsg];
        });
      }

      // Update saved chats
      setSavedChats(prev => {
        const existing = prev.find(c => c.id === msg.sessionId);
        if (existing) {
          return prev.map(c => {
            if (c.id !== msg.sessionId) return c;
            if (c.messages.find(m => m.id === msg.id)) return c;
            return {
              ...c,
              isCleared: false, // Restore profile if I send a message too
              messages: [...c.messages, formattedMsg],
              lastActivity: new Date()
            };
          });
        } else if (currentChatIdRef.current === msg.sessionId && matchedStrangerRef.current) {
          return [{
            id: msg.sessionId,
            stranger: {
              userId: matchedStrangerRef.current.userId,
              nickname: matchedStrangerRef.current.nickname,
              gender: matchedStrangerRef.current.gender as Gender,
              isOnline: true
            },
            messages: [formattedMsg],
            lastActivity: new Date(),
            unreadCount: 0,
            isCleared: false
          }, ...prev];
        }
        return prev;
      });
    });

    socket.on('msg_status', ({ id, status }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
      setSavedChats(prev => prev.map(chat => ({
        ...chat,
        messages: chat.messages.map(m => m.id === id ? { ...m, status } : m)
      })));
    });

    socket.on('msg_deleted', ({ messageId, type }) => {
      if (type === 'everyone') {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, text: 'Message deleted' } : m));
        setSavedChats(prev => prev.map(chat => ({
          ...chat,
          messages: chat.messages.map(m => m.id === messageId ? { ...m, isDeleted: true, text: 'Message deleted' } : m)
        })));
      } else {
        // type === 'me'
        setMessages(prev => prev.filter(m => m.id !== messageId));
        setSavedChats(prev => prev.map(chat => ({
          ...chat,
          messages: chat.messages.filter(m => m.id !== messageId)
        })));
      }
    });

    socket.on('partner_typing', (isTyping) => {
      setIsStrangerTyping(isTyping);
    });

    socket.on('partner_status', ({ userId: pUserId, status, isBlockedByMe, isBlockedByPartner }) => {
      if (matchedStrangerRef.current?.userId === pUserId) {
        setStrangerOnline(status === 'online');
        if (isBlockedByPartner !== undefined) setIsBlockedByStranger(isBlockedByPartner);
      }
      setSavedChats(prev => prev.map(c => {
        return c.stranger.userId === pUserId ? {
          ...c,
          stranger: { ...c.stranger, isOnline: status === 'online' }
        } : c;
      }));
    });

    socket.on('partner_profile_updated', ({ userId: pUserId, nickname, gender }) => {
      if (matchedStrangerRef.current?.userId === pUserId) {
        setMatchedStranger(prev => prev ? { ...prev, nickname, gender } : null);
      }
      setSavedChats(prev => prev.map(c => {
        if (c.stranger.userId === pUserId) {
          return {
            ...c,
            stranger: { ...c.stranger, nickname, gender }
          };
        }
        return c;
      }));
    });

    socket.on('error', ({ message }) => {
      alert(message);
      if (message.includes('already in an active chat')) {
        setAppState('setup');
      }
    });

    socket.on('partner_saved_chat', ({ sessionId }) => {
      setStrangerRequestedSave(true);
      setMessages(prev => [...prev, {
        id: `system-save-request-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'stranger',
        text: 'Stranger requested to save this chat.',
        timestamp: new Date()
      }]);
    });

    socket.on('stats_update', ({ onlineCount }) => {
      setLiveCount(onlineCount);
    });

    socket.on('partner_disconnected', () => {
      setStrangerOnline(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [userId]); // Auth logic depends on profile but we'll re-auth on change below


  // Re-auth when profile or settings changes
  useEffect(() => {
    if (socketConnected && socketRef.current) {
      socketRef.current.emit('auth', {
        userId,
        nickname: userProfile.nickname,
        gender: userProfile.gender,
        preference: userProfile.preference,
        privateMode: settings.privateMode
      });
    }
  }, [userProfile, socketConnected, userId, settings.privateMode]);

  // Real-time presence and live count
  useEffect(() => {
    if (!userId) return;
    // liveCount is updated via socket stats_update
  }, [userId]);

  useEffect(() => {
    if (meRequestedSave && strangerRequestedSave && !isSavedChat && currentChatId && matchedStranger) {
      setIsSavedChat(true);
      const newSavedChat: SavedChat = {
        id: currentChatId,
        stranger: {
          userId: matchedStranger.userId,
          nickname: matchedStranger.nickname,
          gender: matchedStranger.gender as Gender,
          isOnline: true
        },
        messages: messages,
        lastActivity: new Date(),
        unreadCount: 0
      };
      
      setSavedChats(prev => {
        if (prev.find(c => c.id === currentChatId)) return prev;
        return [newSavedChat, ...prev];
      });
      setMessages(prev => [...prev, {
        id: `system-saved-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'stranger',
        text: 'Both parties agreed. Chat saved to your list!',
        timestamp: new Date()
      }]);
    }
  }, [meRequestedSave, strangerRequestedSave, isSavedChat, currentChatId, matchedStranger, messages]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('saved_chats', JSON.stringify(savedChats));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn('LocalStorage quota exceeded for saved_chats. Trimming oldest chat...');
        if (savedChats.length > 0) {
          setSavedChats(prev => prev.slice(0, -1));
        }
      }
    }
  }, [savedChats]);

  useEffect(() => {
    localStorage.setItem('blocked_users', JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  useEffect(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      const profile = JSON.parse(saved);
      setUserProfile(profile);
      setEditProfile(profile);
    }
  }, []);

  // Notifications logic
  useEffect(() => {
    // Real notifications can be added here
  }, []);

  const handleLogin = async () => {
    const backendUrl = ''; // Use relative path for proxy or same-origin connection
    if (loginType === 'guest') {
      if (!userProfile.nickname.trim()) {
        alert("Please enter a nickname");
        return;
      }

      // Check if nickname is unique
      try {
        const response = await fetch(`${backendUrl}/api/check-nickname?nickname=${encodeURIComponent(userProfile.nickname)}&userId=${userId}`);
        const data = await response.json();
        if (!data.available) {
          alert("Nickname is already taken. Please choose another one.");
          return;
        }
      } catch (err) {
        console.error("Error checking nickname:", err);
        alert("Could not verify nickname availability. Please try again.");
        return;
      }

      localStorage.setItem('user_profile', JSON.stringify(userProfile));
      localStorage.setItem('login_type', 'guest');
      setAppState('setup');
    } else {
      if (!phoneNumber || !password) {
        alert("Please enter phone number and password");
        return;
      }
      
      try {
        const response = await fetch(`${backendUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneNumber, password })
        });
        
        if (response.ok) {
          const data = await response.json();
          const user = data.user;
          setUserProfile({
            nickname: user.nickname,
            gender: user.gender,
            preference: user.preference || 'any'
          });
          localStorage.setItem('user_profile', JSON.stringify({
            nickname: user.nickname,
            gender: user.gender,
            preference: user.preference || 'any'
          }));
          localStorage.setItem('user_phone', phoneNumber);
          localStorage.setItem('login_type', 'user');
          setUserId(phoneNumber);
          setAppState('setup');
        } else {
          alert('Invalid credentials');
        }
      } catch (err: any) {
        console.error("Login error:", err);
        alert('Login failed. Connection error.');
      }
    }
  };

  const handleRegister = async () => {
    const backendUrl = ''; // Use relative path for proxy or same-origin connection
    if (!userProfile.nickname.trim() || !phoneNumber || !password) {
      alert("Please fill all fields");
      return;
    }
    
    try {
      const response = await fetch(`${backendUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phoneNumber, 
          password, 
          nickname: userProfile.nickname, 
          gender: userProfile.gender 
        })
      });
      
      if (response.ok) {
        alert('Registration successful! Please login.');
        setAuthMode('login');
      } else {
        const data = await response.json();
        alert(data.message || 'Registration failed');
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      alert('Registration failed. Connection error.');
    }
  };

  const handleForgotPassword = async () => {
    const backendUrl = ''; // Use relative path for proxy or same-origin connection
    if (!phoneNumber || !newPassword) {
      alert("Please enter phone number and new password");
      return;
    }
    
    try {
      const response = await fetch(`${backendUrl}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, newPassword })
      });
      
      if (response.ok) {
        alert("Password reset successful!");
        setAppState('login');
        setPassword(newPassword);
      } else {
        alert("User not found or reset failed.");
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      alert("Failed to reset password. Connection issue.");
    }
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const type = localStorage.getItem('login_type');
    if (type === 'user') {
      const phone = localStorage.getItem('user_phone');
      if (phone) {
        const users = JSON.parse(localStorage.getItem('registered_users') || '[]');
        const updatedUsers = users.map((u: any) => {
          if (u.phone === phone) {
            return {
              ...u,
              profile: userProfile,
              savedChats: savedChats,
              blockedUsers: blockedUsers,
              settings: settings
            };
          }
          return u;
        });
        try {
          localStorage.setItem('registered_users', JSON.stringify(updatedUsers));
        } catch (e) {
          console.error('Failed to save registered_users to localStorage:', e);
          // In case of quota error here, we don't have a simple way to trim, 
          // but at least we prevent the crash.
        }
      }
    }

    localStorage.removeItem('user_profile');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('app_user_id');
    localStorage.removeItem('login_type');
    localStorage.removeItem('saved_chats');
    localStorage.removeItem('blocked_users');
    localStorage.removeItem('app_settings');
    localStorage.removeItem('active_chat');

    const newGuestId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('app_user_id', newGuestId);
    setUserId(newGuestId);

    setUserProfile({
      nickname: '',
      gender: 'other',
      preference: 'any',
    });
    setEditProfile({
      nickname: '',
      gender: 'other',
      preference: 'any',
    });
    setSavedChats([]);
    setBlockedUsers([]);
    setSettings({
      notifications: true,
      privateMode: false,
    });
    setAppState('login');
    setProfileView('menu');
    setActiveTab('home');
    setPhoneNumber('');
    setPassword('');
  };

  const saveProfileChanges = async () => {
    const backendUrl = '';
    // Check if nickname is unique (if it changed)
    if (editProfile.nickname !== userProfile.nickname) {
      try {
        const response = await fetch(`${backendUrl}/api/check-nickname?nickname=${encodeURIComponent(editProfile.nickname)}&userId=${userId}`);
        const data = await response.json();
        if (!data.available) {
          alert("Nickname is already taken. Please choose another one.");
          return;
        }
      } catch (err) {
        console.error("Error checking nickname:", err);
        alert("Could not verify nickname availability.");
        return;
      }
    }

    setUserProfile(editProfile);
    localStorage.setItem('user_profile', JSON.stringify(editProfile));
    
    if (socketConnected && socketRef.current) {
      socketRef.current.emit('update_profile', {
        nickname: editProfile.nickname,
        gender: editProfile.gender
      });
    }
    
    setProfileView('menu');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (appState === 'chat') {
      scrollToBottom();
    }
  }, [messages, appState, isStrangerTyping]);

  useEffect(() => {
    if (appState === 'chat' && currentChatId && socketRef.current) {
      const unreadIds = messages
        .filter(m => m.sender === 'stranger' && m.status !== 'seen')
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        socketRef.current.emit('mark_seen', { messageIds: unreadIds });
        setMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, status: 'seen' } : m));
        setSavedChats(prev => prev.map(chat => chat.id === currentChatId ? {
          ...chat,
          messages: chat.messages.map(m => unreadIds.includes(m.id) ? { ...m, status: 'seen' } : m)
        } : chat));
      }
    }
  }, [appState, currentChatId, messages]);

  const [matchingTimer, setMatchingTimer] = useState<number>(0);
  const [matchingStatus, setMatchingStatus] = useState<'searching' | 'failed'>('searching');
  const matchingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeMatchRef = useRef<(() => void) | null>(null);
  const waitingDocRef = useRef<any>(null);
  const activeMatchingIdRef = useRef<number>(0);
  const isCanceledRef = useRef<boolean>(false);

  // Sync current messages to local storage for persistence across reloads
  useEffect(() => {
    if (appState === 'chat' && matchedStranger && !isSavedChat) {
      try {
        localStorage.setItem('active_chat', JSON.stringify({
          matchedStranger,
          currentChatId
        }));
      } catch (e) {
        console.error('Failed to save active_chat to localStorage:', e);
      }
    } else if (appState !== 'chat') {
      localStorage.removeItem('active_chat');
    }
  }, [appState, matchedStranger, isSavedChat, currentChatId]);

  // Restore active chat on mount
  useEffect(() => {
    const activeChat = localStorage.getItem('active_chat');
    if (activeChat) {
      try {
        const { matchedStranger: savedStranger, currentChatId: savedChatId } = JSON.parse(activeChat);
        if (savedChatId) {
          setMatchedStranger(savedStranger);
          setCurrentChatId(savedChatId);
          setAppState('chat');
          
          // Check if this chat was already saved
          const saved = localStorage.getItem('saved_chats');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.some((c: any) => c.id === savedChatId)) {
              setIsSavedChat(true);
              setMeRequestedSave(true);
              setStrangerRequestedSave(true);
            }
          }
        }
      } catch (e) {
        localStorage.removeItem('active_chat');
      }
    }
  }, []);

  const startMatching = async () => {
    if (!userProfile.nickname.trim()) return;
    
    if (!socketConnected || !socketRef.current) {
      alert("Connecting to server... Please wait.");
      return;
    }

    setAppState('matching');
    setMatchingStatus('searching');
    setMatchingTimer(30);
    
    setMeRequestedSave(false);
    setStrangerRequestedSave(false);
    setIsSavedChat(false);
    setStrangerOnline(false);
    setIsBlockedByStranger(false);
    setCurrentChatId(null);
    setMessages([]);

    if (matchingIntervalRef.current) {
      clearInterval(matchingIntervalRef.current);
    }

    // Emit start_matching to socket
    console.log("Emitting start_matching...");
    socketRef.current.emit('start_matching', {
      userId,
      nickname: userProfile.nickname,
      gender: userProfile.gender,
      preference: userProfile.preference,
      privateMode: settings.privateMode
    });

    matchingIntervalRef.current = setInterval(() => {
      setMatchingTimer((prev) => {
        if (prev <= 1) {
          if (matchingIntervalRef.current) {
            clearInterval(matchingIntervalRef.current);
            matchingIntervalRef.current = null;
          }
          setMatchingStatus('failed');
          // Remove from server pool
          if (socketRef.current) {
            socketRef.current.emit('cancel_matching');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelMatching = () => {
    console.log("Canceling matching process...");
    if (socketRef.current) {
      socketRef.current.emit('cancel_matching');
    }
    
    setAppState('setup');
    setMatchingStatus('searching');
    setMatchingTimer(0);
    
    if (matchingIntervalRef.current) {
      clearInterval(matchingIntervalRef.current);
      matchingIntervalRef.current = null;
    }
  };

  const disconnect = () => {
    if (socketRef.current && currentChatId) {
      socketRef.current.emit('leave_chat', { sessionId: currentChatId });
    }
    if ((window as any).unsubscribeSession) {
      (window as any).unsubscribeSession();
      (window as any).unsubscribeSession = null;
    }
    if ((window as any).unsubscribePresence) {
      (window as any).unsubscribePresence();
      (window as any).unsubscribePresence = null;
    }

    if (isSavedChat) {
      setActiveTab('chats');
    } else {
      setActiveTab('home');
    }
    setAppState('setup');
    setMessages([]);
    setMatchedStranger(null);
    setMeRequestedSave(false);
    setStrangerRequestedSave(false);
    setIsSavedChat(false);
    setCurrentChatId(null);
    setChatSettingsOpen(false);
  };

  const nextMatch = () => {
    if (socketRef.current && currentChatId) {
      socketRef.current.emit('leave_chat', { sessionId: currentChatId });
    }
    if ((window as any).unsubscribeSession) {
      (window as any).unsubscribeSession();
      (window as any).unsubscribeSession = null;
    }
    setAppState('matching');
    setActiveTab('home');
    setMessages([]);
    setMatchedStranger(null);
    setMeRequestedSave(false);
    setStrangerRequestedSave(false);
    setIsSavedChat(false);
    setCurrentChatId(null);
    setChatSettingsOpen(false);
    startMatching();
  };

  const handleSaveChat = async () => {
    if (meRequestedSave || isSavedChat || !currentChatId) return;
    if (socketRef.current) {
      socketRef.current.emit('save_chat', { sessionId: currentChatId });
      setMeRequestedSave(true);
      setMessages(prev => [...prev, {
        id: `system-me-save-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'stranger',
        text: 'You requested to save this chat.',
        timestamp: new Date()
      }]);
    }
  };

  const openSavedChat = (chat: SavedChat) => {
    setMatchedStranger({
      userId: chat.stranger.userId,
      nickname: chat.stranger.nickname,
      gender: chat.stranger.gender
    });
    setStrangerOnline(!!chat.stranger.isOnline);
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
    setIsSavedChat(true);
    setMeRequestedSave(true);
    setStrangerRequestedSave(true);
    setChatSettingsOpen(false);
    setAppState('chat');
    setActiveTab('home');
    
    // Clear unread count
    setSavedChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0, isCleared: false } : c));
  };

  const InfinityIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M7 9C4.79 9 3 10.79 3 13s1.79 4 4 4c1.46 0 2.74-.78 3.46-1.96.72 1.18 2 1.96 3.46 1.96 2.21 0 4-1.79 4-4s-1.79-4-4-4c-1.46 0-2.74.78-3.46 1.96C9.74 9.78 8.46 9 7 9z" 
        stroke="url(#infGradient)" strokeWidth="2.5" fill="none" />
      <defs>
        <linearGradient id="infGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="50%" stopColor="#EF4444" />
          <stop offset="50%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );

  const handleChatLongPress = (chatId: string) => {
    const timer = setTimeout(() => {
      setDeletingChatId(chatId);
    }, 600);
    setLongPressTimer(timer);
  };

  const handleChatPressRelease = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const startRecording = async () => {
    shouldRecordRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!shouldRecordRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setAudioBlob(reader.result as string);
          setVoiceRecorded(true);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setVoiceRecorded(false);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
      shouldRecordRef.current = false;
    }
  };

  const stopRecording = () => {
    shouldRecordRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
  };

  const processOutgoingMessage = async (newMessage: Message) => {
    if (!currentChatId || !socketRef.current) return;

    socketRef.current.emit('send_msg', {
      sessionId: currentChatId,
      text: newMessage.text,
      audio: newMessage.audio,
      image: newMessage.image,
      video: newMessage.video,
      file: newMessage.file,
      fileName: newMessage.fileName,
      toUserId: matchedStranger?.userId,
      type: newMessage.type || 'text'
    });
  };

  const handleSendVoice = () => {
    if (!voiceRecorded || !audioBlob) return;

    const minutes = Math.floor(recordingTime / 60);
    const seconds = recordingTime % 60;
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const newMessage: Message = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
      sender: 'me',
      text: `Voice message (${durationStr})`,
      audio: audioBlob,
      type: 'audio',
      timestamp: new Date(),
      status: 'sent'
    };

    processOutgoingMessage(newMessage);
    setVoiceRecorded(false);
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const handleClearChat = () => {
    if (currentChatId) {
      setMessages([]);
      setSavedChats(prev => {
        const existing = prev.find(c => c.id === currentChatId);
        if (existing) {
          return prev.map(c => 
            c.id === currentChatId ? { ...c, messages: [], isCleared: true, unreadCount: 0 } : c
          );
        } else if (matchedStranger) {
          // If not in saved chats, add it as a cleared chat so it can reappear on new message
          return [{
            id: currentChatId,
            stranger: {
              userId: matchedStranger.userId,
              nickname: matchedStranger.nickname,
              gender: matchedStranger.gender as Gender,
              isOnline: true
            },
            messages: [],
            lastActivity: new Date(),
            unreadCount: 0,
            isCleared: true
          }, ...prev];
        }
        return prev;
      });
    }
    setChatSettingsOpen(false);
    setAppState('setup');
    setActiveTab('chats');
    setCurrentChatId(null);
    setMatchedStranger(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentChatId) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const isVideo = file.type.startsWith('video/');
      const newMessage: Message = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
        sender: 'me',
        text: isVideo ? "🎥 Video sent" : "📷 Image sent",
        image: isVideo ? undefined : base64,
        video: isVideo ? base64 : undefined,
        type: isVideo ? 'video' : 'image',
        timestamp: new Date(),
        status: 'sent'
      };
      processOutgoingMessage(newMessage);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentChatId) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const newMessage: Message = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
        sender: 'me',
        text: `📄 Document: ${file.name}`,
        file: base64,
        fileName: file.name,
        type: 'file',
        timestamp: new Date(),
        status: 'sent'
      };
      processOutgoingMessage(newMessage);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMedia = (type: 'image' | 'camera') => {
    if (currentChatId && (blockedUsers.some(u => u.id === currentChatId) || isBlockedByStranger)) {
      alert("Chat is locked. You cannot send messages.");
      return;
    }

    if (type === 'image') {
      imageInputRef.current?.click();
    } else {
      setIsCameraOpen(true);
      // Removed direct startCamera call, now handled by useEffect
    }
  };

  const startCamera = async (mode: 'user' | 'environment') => {
    if (isCameraInitializingRef.current) return;
    
    isCameraInitializingRef.current = true;

    try {
      // Stop any existing tracks first to ensure hardware is released
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }

      // Small delay to ensure hardware is released by the OS/browser
      await new Promise(resolve => setTimeout(resolve, 250));

      let stream: MediaStream | null = null;
      let lastError: any = null;

      // Define constraints from most specific to most generic
      const constraintsList = [
        { 
          video: { 
            facingMode: mode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true 
        },
        { 
          video: { facingMode: mode },
          audio: true 
        },
        { 
          video: true,
          audio: true 
        },
        { 
          video: { facingMode: mode }
          // No audio
        },
        {
          video: true
          // No audio, no facing mode
        }
      ];

      for (const constraints of constraintsList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err) {
          lastError = err;
          console.warn("Retrying camera with different constraints...", err);
        }
      }

      if (!stream) {
        throw lastError || new Error("Could not start video source");
      }
      
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        try {
          await cameraVideoRef.current.play();
        } catch (e) {
          console.error("Video play error:", e);
        }
      } else if (!isCameraOpen) {
        // Cleanup if camera was closed while waiting for stream
        stream.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      // Only show alert if camera is still supposed to be open
      if (isCameraOpen) {
        alert("Error accessing camera: " + (err instanceof Error ? err.message : "Could not start video source"));
        setIsCameraOpen(false);
      }
    } finally {
      isCameraInitializingRef.current = false;
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCapturedMedia(null);
    setIsRecordingCamera(false);
  };

  const switchCamera = () => {
    const newMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(newMode);
  };

  useEffect(() => {
    let isMounted = true;
    if (isCameraOpen && !capturedMedia) {
      const init = async () => {
        // Wait for video element to mount
        for (let i = 0; i < 20; i++) {
          if (cameraVideoRef.current) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (isMounted && isCameraOpen && !capturedMedia && cameraVideoRef.current) {
          startCamera(cameraFacingMode);
        }
      };
      init();
    }
    return () => {
      isMounted = false;
      // We should also ensure tracks are stopped when this effect cleans up
      // to avoid "Could not start video source" on re-mount or mode change
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
    };
  }, [isCameraOpen, cameraFacingMode, capturedMedia]);

  const captureImage = () => {
    if (cameraVideoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = cameraVideoRef.current.videoWidth;
      canvas.height = cameraVideoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(cameraVideoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedMedia({ type: 'image', data: dataUrl });
      
      // Stop camera stream after capture
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
    }
  };

  const startCameraRecording = () => {
    if (cameraVideoRef.current?.srcObject) {
      const stream = cameraVideoRef.current.srcObject as MediaStream;
      const recorder = new MediaRecorder(stream);
      cameraRecorderRef.current = recorder;
      cameraChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) cameraChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(cameraChunksRef.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setCapturedMedia({ type: 'video', data: reader.result as string });
        };
        reader.readAsDataURL(blob);
        
        // Stop tracks
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach(track => track.stop());
          cameraStreamRef.current = null;
        }
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = null;
        }
      };

      recorder.start();
      setIsRecordingCamera(true);
    }
  };

  const stopCameraRecording = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state === 'recording') {
      cameraRecorderRef.current.stop();
      setIsRecordingCamera(false);
    }
  };

  const sendCapturedMedia = () => {
    if (!capturedMedia || !currentChatId) return;

    const newMessage: Message = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
      sender: 'me',
      text: capturedMedia.type === 'video' ? "🎥 Video sent" : "📷 Image sent",
      image: capturedMedia.type === 'image' ? capturedMedia.data : undefined,
      video: capturedMedia.type === 'video' ? capturedMedia.data : undefined,
      type: capturedMedia.type,
      timestamp: new Date(),
      status: 'sent'
    };
    processOutgoingMessage(newMessage);
    stopCamera();
  };

  const handleDeleteMessage = (messageId: string, type: 'me' | 'everyone' = 'me') => {
    if (!currentChatId || !socketRef.current) return;

    socketRef.current.emit('delete_msg', {
      messageId,
      sessionId: currentChatId,
      toUserId: matchedStranger?.userId,
      type
    });
    setLongPressedMessageId(null);
  };

  const handleDownload = (dataUrl: string, fileName: string) => {
    if (!dataUrl) return;
    
    // For data URLs, converting to Blob URL is more robust for "Save As" behavior in many browsers
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);
      })
      .catch((err) => {
        console.error('Download error:', err);
        // Fallback to direct link
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.click();
      });
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    
    // Prevent sending if blocked
    if (currentChatId && (blockedUsers.some(u => u.id === currentChatId) || isBlockedByStranger)) {
      alert("Chat is locked. You cannot send messages.");
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
      sender: 'me',
      text: inputValue,
      timestamp: new Date(),
      status: 'sent'
    };

    processOutgoingMessage(newMessage);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-background text-foreground shadow-xl overflow-hidden italic">
      {appState === 'login' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 bg-white overflow-y-auto">
          <div className="w-full max-w-sm space-y-8 py-10">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-full shadow-sm">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Blue Human Icon */}
                    <circle cx="8.5" cy="7.5" r="3.5" stroke="#3B82F6" strokeWidth="1.5" />
                    <path d="M3.5 21c0-3.5 2.5-6 5-6s4 1.5 5 4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
                    
                    {/* Red Human Icon */}
                    <circle cx="15.5" cy="7.5" r="3.5" stroke="#EF4444" strokeWidth="1.5" />
                    <path d="M10.5 19c1-2.5 2.5-4 5-4s5 2.5 5 6" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <h1 className="text-3xl font-black tracking-tighter text-primary italic transform -skew-x-3">Co<span className="text-red-600">nn</span>ect</h1>
            </div>

            <div className="space-y-6 pt-4">
              {/* Connect As Selector */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Connect As</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['guest', 'user'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setLoginType(type)}
                      className={cn(
                        "py-2.5 rounded-xl font-bold capitalize transition-all border flex items-center justify-center gap-2",
                        loginType === type 
                          ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                          : "bg-blue-50 text-blue-400 border-blue-100 hover:border-blue-200"
                      )}
                    >
                      {type === 'guest' ? <CircleUserRound size={18} /> : <UserCheck size={18} />}
                      {type === 'user' ? 'Login' : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nick Name / Name Field for Guest */}
              {loginType === 'guest' && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-blue-900 ml-1">Nick Name</label>
                  <div className="relative">
                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                    <input
                      type="text"
                      placeholder="Enter your nickname..."
                      className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                      value={userProfile.nickname}
                      onChange={(e) => {
                        const newProfile = { ...userProfile, nickname: e.target.value };
                        setUserProfile(newProfile);
                        setEditProfile(newProfile);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Gender Field for Guest */}
              {loginType === 'guest' && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-blue-900 ml-1">Gender</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['male', 'female', 'other'] as Gender[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => {
                          const newProfile = { ...userProfile, gender: g };
                          setUserProfile(newProfile);
                          setEditProfile(newProfile);
                        }}
                        className={cn(
                          "py-2 rounded-xl font-bold capitalize transition-all border",
                          userProfile.gender === g 
                            ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                            : "bg-blue-50 text-blue-400 border-blue-100 hover:border-blue-200"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Login Fields */}
              {loginType === 'user' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-blue-900 ml-1">Phone No</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                      <input
                        type="tel"
                        placeholder="Enter your phone number..."
                        className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-blue-900 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                      <input
                        type="password"
                        placeholder="Enter your password..."
                        className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={handleLogin}
                disabled={
                  (loginType === 'guest' && !userProfile.nickname.trim()) || 
                  (loginType === 'user' && (!phoneNumber || !password))
                }
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-black text-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-primary/25 mt-4"
              >
                Continue
              </button>

              {/* Register and Forgot Password Links */}
              {loginType === 'user' && (
                <div className="flex items-center justify-between px-2 pt-2">
                  <button 
                    onClick={() => {
                      setAppState('register');
                      setAuthMode('register');
                    }}
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    Register
                  </button>
                  <button 
                    onClick={() => setAppState('forgot-password')}
                    className="text-sm font-bold text-blue-300 hover:text-blue-400 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : appState === 'forgot-password' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 bg-white overflow-y-auto">
          <div className="w-full max-w-sm space-y-8 py-10">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-3xl font-black tracking-tighter text-primary italic transform -skew-x-3">Reset Password</h1>
              <p className="text-blue-300 font-bold text-sm">Enter your phone number and new password</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Phone No</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="tel"
                    placeholder="Enter your phone number..."
                    className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="password"
                    placeholder="Enter new password..."
                    className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={handleForgotPassword}
                disabled={!phoneNumber || !newPassword}
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-black text-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-primary/25 mt-4"
              >
                Reset Password
              </button>

              <button 
                onClick={() => setAppState('login')}
                className="w-full text-center text-sm font-bold text-blue-300 hover:text-primary transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      ) : appState === 'register' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 bg-white overflow-y-auto">
          <div className="w-full max-w-sm space-y-8 py-10">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-3xl font-black tracking-tighter text-primary italic transform -skew-x-3">Registration</h1>
              <p className="text-blue-300 font-bold text-sm">Create your account to join Co<span className="text-red-600">nn</span>ect</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Name</label>
                <div className="relative">
                  <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="text"
                    placeholder="Enter your name..."
                    className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                    value={userProfile.nickname}
                    onChange={(e) => setUserProfile({ ...userProfile, nickname: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Gender</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['male', 'female', 'other'] as Gender[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => setUserProfile({ ...userProfile, gender: g })}
                      className={cn(
                        "py-2 rounded-xl font-bold capitalize transition-all border",
                        userProfile.gender === g 
                          ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                          : "bg-blue-50 text-blue-400 border-blue-100 hover:border-blue-200"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Phone No</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="tel"
                    placeholder="Enter your phone number..."
                    className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-blue-900 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input
                    type="password"
                    placeholder="Enter your password..."
                    className="w-full pl-12 pr-4 py-2.5 bg-blue-50 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-medium not-italic"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={handleRegister}
                disabled={!userProfile.nickname.trim() || !phoneNumber || !password}
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-black text-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-primary/25 mt-4"
              >
                Register
              </button>

              <button 
                onClick={() => setAppState('login')}
                className="w-full text-center text-sm font-bold text-blue-300 hover:text-primary transition-colors"
              >
                Already have an account? Login
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          {appState !== 'chat' && appState !== 'matching' && (
            <header className={cn(
              "flex flex-col sticky top-0 z-20 transition-all duration-300",
              (activeTab === 'notifications' || activeTab === 'profile') ? "bg-[#e0f2fe]" : 
              (activeTab === 'home') ? "bg-[#e0f2fe]" :
              (activeTab === 'chats') ? "bg-[#e0f2fe]" : "bg-white"
            )}>
              {activeTab === 'notifications' || activeTab === 'profile' || activeTab === 'chats' ? (
                <div className={cn(
                  "flex items-center justify-between px-4",
                  activeTab === 'chats' ? "py-3" : "py-4"
                )}>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        if (activeTab === 'profile') {
                          if (profileView === 'block-list') {
                            if (blockEntrySource === 'chats') {
                              setActiveTab('chats');
                              setProfileView('menu'); // Reset profile view for next time
                            } else {
                              setProfileView('settings');
                            }
                            setBlockEntrySource(null);
                            return;
                          }
                          if (profileView !== 'menu') {
                            setProfileView('menu');
                            return;
                          }
                        }
                        setActiveTab('home');
                        setChatsMenuOpen(false);
                      }}
                      className={cn(
                        "p-1 rounded-full transition-colors",
                        activeTab === 'chats' ? "text-slate-800 hover:bg-black/5" : "text-slate-600 hover:bg-blue-200/50"
                      )}
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <h1 className={cn(
                      "text-xl font-black tracking-tight italic",
                      activeTab === 'chats' ? "text-slate-800" : "text-slate-800"
                    )}>
                      {activeTab === 'notifications' ? 'Notification' : 
                       activeTab === 'chats' ? 'Chat' : 
                       profileView === 'menu' ? 'Profile' : 
                       profileView === 'personal-details' ? 'Personal Details' : 
                       profileView === 'settings' ? 'Settings' :
                       profileView === 'legal' ? 'Legal' :
                       profileView === 'block-list' ? 'Block List' : 'Profile'}
                    </h1>
                  </div>
                  
                  {activeTab === 'notifications' && (
                    <button 
                      onClick={() => setNotifications([])}
                      className="text-[11px] font-black text-primary uppercase tracking-widest hover:underline pr-2"
                    >
                      Clear All
                    </button>
                  )}

                  {activeTab === 'chats' && (
                    <div className="relative">
                      <button 
                        onClick={() => setChatsMenuOpen(!chatsMenuOpen)}
                        className={cn(
                          "p-1.5 rounded-full transition-colors",
                          activeTab === 'chats' ? "text-slate-800 hover:bg-black/5" : "text-slate-300 hover:bg-white/10"
                        )}
                      >
                        <MoreVertical size={20} />
                      </button>
                      
                      {chatsMenuOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-20"
                            onClick={() => setChatsMenuOpen(false)}
                          />
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                            <button 
                              onClick={() => {
                                setProfileView('block-list');
                                setBlockEntrySource('chats');
                                setActiveTab('profile');
                                setChatsMenuOpen(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-between border-b border-slate-50"
                            >
                              <div className="flex items-center gap-2">
                                <Ban size={14} /> Block List
                              </div>
                              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full italic">{blockedUsers.length}</span>
                            </button>
                            <button 
                              onClick={() => {
                                setSettings(prev => ({ ...prev, privateMode: !prev.privateMode }));
                              }}
                              className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <ShieldCheck size={14} /> Private Mode
                              </div>
                              <div className={cn(
                                "w-8 h-4 rounded-full relative transition-colors",
                                settings.privateMode ? "bg-primary" : "bg-slate-200"
                              )}>
                                <div className={cn(
                                  "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                                  settings.privateMode ? "right-0.5" : "left-0.5"
                                )} />
                              </div>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="8.5" cy="7.5" r="3.5" stroke="#3B82F6" strokeWidth="1.5" />
                          <path d="M3.5 21c0-3.5 2.5-6 5-6s4 1.5 5 4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
                          <circle cx="15.5" cy="7.5" r="3.5" stroke="#EF4444" strokeWidth="1.5" />
                          <path d="M10.5 19c1-2.5 2.5-4 5-4s5 2.5 5 6" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <h1 className="text-[32px] font-black tracking-tight text-blue-900 italic transform -skew-x-2">Co<span className="text-red-600">nn</span>ect</h1>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center gap-2 transition-all",
                        settings.privateMode ? "text-blue-900/40" : "text-blue-900"
                      )}>
                        <span className={cn(
                          "text-[10px] font-bold whitespace-nowrap opacity-80",
                          settings.privateMode ? "text-blue-900/60" : "text-blue-900"
                        )}>
                          {settings.privateMode ? "Private Mode" : `${liveCount} Online`}
                        </span>
                        {!settings.privateMode && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400"></span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Navigation Line */}
                  <nav className="flex items-center justify-around px-2 pb-0.5 relative">
                    <button 
                      onClick={() => { setActiveTab('home'); setAppState('setup'); }}
                      className={cn(
                        "flex flex-col items-center p-1.5 rounded-xl transition-all duration-200 flex-1",
                        activeTab === 'home' ? "text-blue-600" : "text-blue-400 hover:text-blue-600"
                      )}
                    >
                      <Home size={20} fill={activeTab === 'home' ? "currentColor" : "none"} />
                      <span className="text-[9px] font-medium mt-0.5">Home</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('chats')}
                      className={cn(
                        "flex flex-col items-center p-1.5 rounded-xl transition-all duration-200 flex-1 relative",
                        (activeTab as any) === 'chats' ? "text-blue-600" : "text-blue-400 hover:text-blue-600"
                      )}
                    >
                      <MessageSquare size={20} fill={(activeTab as any) === 'chats' ? "currentColor" : "none"} />
                      <span className="text-[9px] font-medium mt-0.5">Chats</span>
                      {savedChats.some(c => c.unreadCount > 0) && (
                        <span className="absolute top-1 right-6 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                      )}
                    </button>
                    <button 
                      onClick={() => { setActiveTab('profile'); setProfileView('menu'); }}
                      className={cn(
                        "flex flex-col items-center p-1.5 rounded-xl transition-all duration-200 flex-1",
                        (activeTab as string) === 'profile' ? "text-blue-600" : "text-blue-400 hover:text-blue-600"
                      )}
                    >
                      <div className="relative">
                        <User size={20} className={cn(
                          (activeTab as string) === 'profile' 
                            ? "text-blue-600"
                            : "text-blue-400"
                        )} />
                      </div>
                      <span className="text-[9px] font-medium mt-0.5">Profile</span>
                    </button>
                    <button 
                      onClick={() => {
                        setActiveTab('notifications');
                      }}
                      className={cn(
                        "flex flex-col items-center p-1.5 rounded-xl transition-all duration-200 flex-1 relative",
                        (activeTab as string) === 'notifications' ? "text-blue-600" : "text-blue-400 hover:text-blue-600"
                      )}
                    >
                      <Bell size={20} fill={(activeTab as string) === 'notifications' ? "currentColor" : "none"} />
                      <span className="text-[9px] font-medium mt-0.5">Notification</span>
                      {notifications.some(n => n.unread) && (
                        <span className="absolute top-1 right-6 w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                      )}
                    </button>
                    
                    {/* Animated Indicator Line */}
                    <div 
                      className="absolute bottom-0 left-2 right-2 h-[2px] pointer-events-none"
                    >
                      <div 
                        className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                        style={{
                          width: '25%',
                          transform: `translateX(${['home', 'chats', 'profile', 'notifications'].indexOf(activeTab as any) * 100}%)`,
                          padding: '0 12px',
                          backgroundClip: 'content-box'
                        }}
                      />
                    </div>
                  </nav>
                </>
              )}
            </header>
          )}

          <main className="flex-1 overflow-hidden relative bg-white">
            {activeTab === 'profile' ? (
              <div className="h-full overflow-y-auto bg-white">
                {profileView === 'menu' && (
                  <div className="px-6 py-2 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex flex-col items-center gap-2 py-4 mt-2">
                      <div className="w-20 h-20 flex items-center justify-center bg-blue-50 rounded-full mb-2">
                        <div className="transform -translate-y-1">
                          <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="7" r="4" fill={userProfile.gender === 'male' ? "#3B82F6" : userProfile.gender === 'female' ? "#EF4444" : "#22C55E"} />
                            <path d="M5 20C5 16.134 8.13401 13 12 13C15.866 13 19 16.134 19 20" 
                              stroke={userProfile.gender === 'male' ? "#3B82F6" : userProfile.gender === 'female' ? "#EF4444" : "#22C55E"} 
                              strokeWidth="2.5" 
                              strokeLinecap="round" 
                            />
                          </svg>
                        </div>
                      </div>
                      <div className="text-center">
                        <h2 className="text-xl font-black text-blue-900">{userProfile.nickname}</h2>
                        <p className="text-[10px] text-blue-800 font-bold uppercase tracking-widest">{userProfile.gender}</p>
                      </div>
                    </div>

                    <div className="space-y-0 pt-4">
                      {/* Personal Details Button */}
                      <button 
                        onClick={() => { setEditProfile(userProfile); setProfileView('personal-details'); }}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all group border-b border-slate-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400 group-hover:text-primary transition-colors">
                            <UserCheck size={20} />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold text-slate-700 text-sm">Personal Details</h4>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>

                      {/* Settings Button */}
                      <button 
                        onClick={() => setProfileView('settings')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all group border-b border-slate-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400 group-hover:text-primary transition-colors">
                            <Settings size={20} />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold text-slate-700 text-sm">Settings</h4>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>

                      {/* Legal Button */}
                      <button 
                        onClick={() => setProfileView('legal')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all group border-b border-slate-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400 group-hover:text-primary transition-colors">
                            <Scale size={20} />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold text-slate-700 text-sm">Legal</h4>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>

                      {/* Logout Button */}
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between p-4 hover:bg-red-50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-red-500 transition-colors">
                            <LogOut size={20} />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold text-red-600 text-sm transition-colors">Logout</h4>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-red-200" />
                      </button>
                    </div>
                  </div>
                )}

                {profileView === 'personal-details' && (
                  <div className="px-6 py-2 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-6 pt-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-900 uppercase tracking-wider ml-1">Nickname</label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full px-4 py-3 bg-blue-50 border-b border-blue-100 focus:border-primary transition-all outline-none font-medium not-italic"
                            value={editProfile.nickname}
                            onChange={(e) => setEditProfile({ ...editProfile, nickname: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-900 uppercase tracking-wider ml-1">Gender</label>
                        <div className="grid grid-cols-3 gap-3">
                          {(['male', 'female', 'other'] as Gender[]).map((g) => (
                            <button
                              key={g}
                              onClick={() => setEditProfile({ ...editProfile, gender: g })}
                              className={cn(
                                "py-2.5 rounded-xl font-bold capitalize transition-all border",
                                editProfile.gender === g 
                                  ? "bg-primary text-white border-primary" 
                                  : "bg-blue-50 text-blue-400 border-blue-100 hover:border-blue-200"
                              )}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={saveProfileChanges}
                        className="w-full py-4 bg-primary text-white rounded-2xl font-black hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 mt-4"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}

                {profileView === 'settings' && (
                  <div className="px-6 py-2 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-0 pt-4">
                      <div className="w-full p-4 flex items-center justify-between border-b border-slate-50">
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400">
                            <Bell size={20} />
                          </div>
                          <div className="text-left">
                            <h5 className="font-bold text-slate-700 text-sm">Notifications</h5>
                          </div>
                        </div>
                        <button onClick={() => setSettings(prev => ({ ...prev, notifications: !prev.notifications }))}>
                          <div className={cn("transition-all", settings.notifications ? "text-primary" : "text-slate-300")}>
                            <Toggle className={cn("transition-transform duration-300", settings.notifications && "rotate-180")} size={28} />
                          </div>
                        </button>
                      </div>

                      <div className="w-full p-4 flex items-center justify-between border-b border-slate-50">
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400">
                            <ShieldCheck size={20} />
                          </div>
                          <div className="text-left">
                            <h5 className="font-bold text-slate-700 text-sm">Private Mode</h5>
                          </div>
                        </div>
                        <button onClick={() => setSettings(prev => ({ ...prev, privateMode: !prev.privateMode }))}>
                          <div className={cn("transition-all", settings.privateMode ? "text-primary" : "text-slate-300")}>
                            <Toggle className={cn("transition-transform duration-300", settings.privateMode && "rotate-180")} size={28} />
                          </div>
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          setProfileView('block-list');
                          setBlockEntrySource('settings');
                        }}
                        className="w-full p-4 flex items-center justify-between border-b border-slate-50 hover:bg-slate-50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400 group-hover:text-red-500 transition-colors">
                            <Ban size={20} />
                          </div>
                          <div className="text-left">
                            <h5 className="font-bold text-slate-700 text-sm">Block List</h5>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">{blockedUsers.length}</span>
                          <ChevronRight size={16} className="text-slate-300" />
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {profileView === 'block-list' && (
                  <div className="px-6 py-2 h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex-1 overflow-y-auto -mx-6 px-6 pt-4">
                      {blockedUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                          <Ban size={40} className="text-slate-100" />
                          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">No blocked users</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {blockedUsers.map((user) => (
                            <div key={user.id} className="flex items-center justify-between py-3 border-b border-slate-50">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center",
                                  user.gender === 'male' ? "bg-blue-100 text-blue-600" : 
                                  user.gender === 'female' ? "bg-red-100 text-red-600" : 
                                  "bg-green-100 text-green-600"
                                )}>
                                  <User size={20} fill="currentColor" />
                                </div>
                                <div>
                                  <h5 className="font-bold text-slate-800 text-sm italic">{user.nickname}</h5>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{user.gender}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    setBlockedUsers(prev => prev.filter(u => u.id !== user.id));
                                    socketRef.current?.emit('unblock_user', { targetUserId: user.id });
                                  }}
                                  className="px-3 py-1.5 bg-blue-50 text-[#3B82F6] rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all"
                                >
                                  Unblock
                                </button>
                                <button 
                                  onClick={() => {
                                    setBlockedUsers(prev => prev.filter(u => u.id !== user.id));
                                    socketRef.current?.emit('unblock_user', { targetUserId: user.id });
                                    setSavedChats(prev => prev.filter(c => c.id !== user.id));
                                  }}
                                  className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  title="Delete from list and remove chat"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {profileView === 'legal' && (
                  <div className="px-6 py-2 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-8 pb-10 pt-4">
                      <section className="space-y-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">1. Terms of Service</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          By accessing and using Connect, you acknowledge that you have read, understood, and agreed to be bound by these Terms. Connect provides a platform for anonymous real-time communication. You agree to use the service only for lawful purposes and in a way that does not infringe the rights of, restrict or inhibit anyone else's use and enjoyment of Connect.
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          We reserve the right to modify or terminate the service for any reason, without notice, at any time. We also reserve the right to change these Terms of Service from time to time without notice.
                        </p>
                      </section>

                      <section className="space-y-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">2. Privacy Policy</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          Your privacy is our core value. Connect is designed to require minimal personal information. We do not track your real-world identity, nor do we store persistent logs of your conversations.
                        </p>
                        <ul className="text-xs text-slate-500 leading-relaxed font-medium not-italic list-disc ml-4 space-y-1">
                          <li>No registration required: You can use the app without an account.</li>
                          <li>Minimal data collection: We only store your temporary nickname and gender preference locally on your device.</li>
                          <li>End-to-end focus: While we facilitate the connection, we strive to keep your data as private as possible.</li>
                        </ul>
                      </section>

                      <section className="space-y-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">3. User Guidelines</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          Help us keep Connect a friendly place. Prohibited behavior includes but is not limited to:
                        </p>
                        <ul className="text-xs text-slate-500 leading-relaxed font-medium not-italic list-disc ml-4 space-y-1">
                          <li>Harassment, bullying, or intimidation of other users.</li>
                          <li>Sharing of sexually explicit or violent content.</li>
                          <li>Spamming or advertising of commercial services.</li>
                          <li>Impersonating others or misrepresenting your identity.</li>
                        </ul>
                      </section>

                      <section className="space-y-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">4. Safety & Age Restriction</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          Users must be at least 18 years of age to use Connect. The service is intended for adult audiences only. We do not knowingly collect information from children under 18. If we become aware that a child under 18 has provided us with personal information, we will delete such information from our records immediately.
                        </p>
                      </section>

                      <section className="space-y-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">5. Disclaimer of Warranties</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium not-italic">
                          The service is provided "as is" and "as available" without any warranties of any kind, either express or implied. Connect does not guarantee that the service will be uninterrupted or error-free.
                        </p>
                      </section>

                      <section className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">System Status (Live)</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Total Logins</p>
                            <p className="text-lg font-black text-slate-700">{JSON.parse(localStorage.getItem('app_stats') || '{"totalLogins":0}').totalLogins || 0}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Guest Entries</p>
                            <p className="text-lg font-black text-slate-700">{JSON.parse(localStorage.getItem('app_stats') || '{"guestCount":0}').guestCount || 0}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Real-time Pool</p>
                            <p className="text-lg font-black text-green-600">{JSON.parse(localStorage.getItem('online_users_pool') || '[]').length} Active Matchers</p>
                          </div>
                        </div>
                      </section>

                      <div className="pt-6 border-t border-slate-100 flex flex-col items-center gap-1">
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Connect Legal Framework v2.5</p>
                        <p className="text-[9px] text-slate-300 font-medium italic">Updated: January 17, 2026</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'notifications' ? (
              <div className="h-full overflow-y-auto bg-white px-6 py-2 animate-in fade-in duration-300">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <p className="text-slate-300 font-bold text-sm uppercase tracking-widest">No notifications yet</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {notifications.map((notif) => (
                      <div 
                        key={notif.id}
                        onClick={() => {
                          setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
                        }}
                        className={cn(
                          "w-full flex items-center py-3 border-b border-slate-50 gap-3 transition-all cursor-pointer active:bg-slate-50",
                          notif.unread && "bg-slate-50/30"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full transition-all shrink-0",
                          notif.unread ? "bg-primary/10 text-primary" : "bg-transparent text-slate-300"
                        )}>
                          <Bell size={16} fill={notif.unread ? "currentColor" : "none"} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className={cn("font-bold text-xs truncate transition-colors", notif.unread ? "text-slate-800" : "text-slate-400")}>{notif.title}</h5>
                            <span className="text-[8px] text-slate-400 font-bold shrink-0">{notif.time}</span>
                          </div>
                          <p className={cn("text-[10px] leading-tight font-medium not-italic mt-0.5 line-clamp-1 transition-colors", notif.unread ? "text-slate-600" : "text-slate-300")}>{notif.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'chats' ? (
              <div className="h-full flex flex-col bg-white animate-in fade-in duration-300">
                {savedChats.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
                    <div className="text-center">
                      <p className="text-xs text-slate-400 font-medium">No saved chats yet. Match with people and save your favorite conversations!</p>
                    </div>
                    <button 
                      onClick={() => { setActiveTab('home'); setAppState('setup'); }}
                      className="px-6 py-2 border border-slate-100 rounded-xl font-bold text-[10px] uppercase tracking-widest text-primary hover:bg-slate-50 transition-colors"
                    >
                      Start Matching
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {[...savedChats]
                      .filter(chat => !chat.isCleared && !blockedUsers.some(u => u.id === chat.id))
                      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
                      .map((chat) => {
                        const lastMessage = chat.messages[chat.messages.length - 1];
                      const isLastMessageFromMe = lastMessage?.sender === 'me';
                      const isDeleting = deletingChatId === chat.id;
                      
                      return (
                        <div key={chat.id} className="relative">
                          <button
                            onClick={() => {
                              if (deletingChatId) {
                                setDeletingChatId(null);
                              } else {
                                openSavedChat(chat);
                              }
                            }}
                            onPointerDown={() => handleChatLongPress(chat.id)}
                            onPointerUp={handleChatPressRelease}
                            onPointerLeave={handleChatPressRelease}
                            className={cn(
                              "w-full flex items-center py-1.5 px-3 hover:bg-slate-50/80 transition-all text-left group",
                              isDeleting && "opacity-50 grayscale-[0.5]"
                            )}
                          >
                            <div className="relative shrink-0">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shadow-sm",
                                chat.stranger.gender === 'male' ? "bg-blue-100 text-blue-600" : 
                                chat.stranger.gender === 'female' ? "bg-red-100 text-red-600" : 
                                "bg-green-100 text-green-600"
                              )}>
                                <User size={20} fill="currentColor" />
                              </div>
                              <div className={cn(
                                "absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full transition-colors duration-300",
                                chat.stranger.isOnline ? "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.3)]" : "bg-slate-400"
                              )}></div>
                            </div>
                            
                            <div className="ml-3 flex-1 min-w-0 border-b border-slate-50 pb-1.5 h-full">
                              <div className="flex items-center justify-between mb-0.5">
                                <h4 className="font-bold text-slate-900 text-[14px] truncate not-italic">{chat.stranger.nickname}</h4>
                                <div className="flex flex-col items-end gap-1">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-tighter transition-all duration-300",
                                    chat.unreadCount > 0 
                                      ? "text-[#3B82F6] [text-shadow:0_0_8px_rgba(59,130,246,0.6)] animate-pulse"
                                      : "text-slate-400"
                                  )}>
                                    {chat.lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {chat.unreadCount > 0 && !isLastMessageFromMe && (
                                    <div className="min-w-[18px] h-[18px] px-1 bg-[#3B82F6] rounded-full shadow-lg shadow-blue-200 flex items-center justify-center animate-in zoom-in duration-300">
                                      <span className="text-[10px] text-white font-black">{chat.unreadCount}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  {isLastMessageFromMe ? (
                                    <div className="shrink-0 mt-0.5">
                                      {lastMessage.status === 'seen' ? (
                                        <CheckCheck size={14} strokeWidth={3} className="text-blue-500" />
                                      ) : lastMessage.status === 'delivered' ? (
                                        <CheckCheck size={14} strokeWidth={3} className="text-slate-400" />
                                      ) : (
                                        <Check size={14} strokeWidth={3} className="text-slate-400" />
                                      )}
                                    </div>
                                  ) : null}
                                  <p className={cn(
                                    "text-[12px] not-italic line-clamp-1 truncate flex-1 transition-colors",
                                    chat.unreadCount > 0 ? "text-slate-950 font-black" : "text-slate-500 font-medium"
                                  )}>
                                    {lastMessage?.text || "No messages yet"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </button>

                          {isDeleting && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-2xl shadow-xl border border-slate-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // According to user: delete chat -> profile erase (hide until new msg)
                                    setSavedChats(prev => prev.map(c => 
                                      c.id === chat.id ? { ...c, messages: [], isCleared: true, unreadCount: 0 } : c
                                    ));
                                    setDeletingChatId(null);
                                  }}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
                                >
                                  <Trash2 size={14} /> Delete Chat
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingChatId(null);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-slate-600"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                {appState === 'setup' && (
                  <div className="h-full overflow-y-auto px-6 py-6 bg-white">
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="text-center space-y-1 pt-10">
                        <div className="flex flex-col items-center justify-center gap-0 font-black tracking-tighter italic transform -skew-x-2">
                          <div className="text-black text-2xl">Ready to Chat<span className="text-red-600">?</span></div>
                        </div>
                      </div>

                      <div className="w-full space-y-4 p-5 border border-green-500/20 rounded-[2.5rem]">
                        <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border border-purple-100 rounded-2xl">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">Me:</span>
                            <span className="text-sm font-bold text-purple-800">{userProfile.nickname}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">Gender:</span>
                            <span className="text-sm font-bold text-purple-800 capitalize">{userProfile.gender}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-purple-900 uppercase tracking-wider ml-1">Connect with</label>
                          <div className="relative">
                            <select
                              className="w-full px-4 py-3 bg-purple-50 border border-purple-100 rounded-2xl focus:ring-1 focus:ring-purple-200 focus:border-purple-400 outline-none appearance-none font-medium text-sm text-purple-900"
                              value={userProfile.preference}
                              onChange={(e) => {
                                const newProfile = { ...userProfile, preference: e.target.value as Gender | 'any' };
                                setUserProfile(newProfile);
                                setEditProfile(newProfile);
                              }}
                            >
                              <option value="any">Anyone</option>
                              <option value="male">Males</option>
                              <option value="female">Females</option>
                              <option value="other">Others</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-purple-400">
                              <ChevronRight size={16} className="rotate-90" />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                          <button
                            onClick={startMatching}
                            disabled={!userProfile.nickname.trim()}
                            className="w-auto px-10 py-3 bg-[#b8a5fe] text-white rounded-xl font-black text-3xl hover:bg-[#a78bfa] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center mt-0 shadow-lg shadow-violet-400/20"
                          >
                            {!socketConnected ? (
                              <span className="flex items-center gap-2 text-2xl">
                                <RefreshCw className="animate-spin" size={24} />
                                Connecting...
                              </span>
                            ) : (
                              <>Co<span className="text-red-600">nn</span>ect</>
                            )}
                          </button>
                          
                          {matchedStranger && messages.length > 0 && !isSavedChat && (
                            <button
                              onClick={() => setAppState('chat')}
                              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <MessageSquare size={14} /> Resume active chat
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center gap-2 pt-4">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] opacity-60">Secure Co<span className="text-red-600">nn</span>ection</div>
                        <div className="flex gap-1.5">
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse [animation-delay:200ms]"></span>
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse [animation-delay:400ms]"></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {appState === 'matching' && (
                  <div className="h-full flex flex-col bg-white overflow-hidden">
                    <div className="flex-1 flex flex-col items-center justify-start pt-16 px-6 space-y-12 animate-in fade-in duration-500">
                      <div className="relative shrink-0 mt-4">
                        <div className="w-48 h-48 border-4 border-slate-100 rounded-full"></div>
                        <svg className="absolute inset-0 w-48 h-48 -rotate-90">
                          <circle
                            cx="96"
                            cy="96"
                            r="94"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className={cn(
                              "text-primary transition-all duration-1000 ease-linear",
                              matchingStatus !== 'searching' && "opacity-20"
                            )}
                            strokeDasharray={590}
                            strokeDashoffset={590 * (1 - matchingTimer / 30)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-20 h-20 transform translate-y-1">
                            <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                              {/* Blue Human Icon */}
                              <circle cx="8.5" cy="7.5" r="3.5" stroke="#3B82F6" strokeWidth="1.5" />
                              <path d="M3.5 21c0-3.5 2.5-6 5-6s4 1.5 5 4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
                              
                              {/* Red Human Icon */}
                              <circle cx="15.5" cy="7.5" r="3.5" stroke="#EF4444" strokeWidth="1.5" />
                              <path d="M10.5 19c1-2.5 2.5-4 5-4s5 2.5 5 6" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
                        <div className="space-y-2 text-center">
                          <h2 className="text-2xl font-black italic text-slate-800">
                            {matchingStatus === 'searching' ? 'Finding your match...' : 'Connection Failed'}
                          </h2>
                          <p className="text-slate-400 font-bold text-sm">
                            {matchingStatus === 'searching' 
                              ? `Hang tight, we're looking for someone special (${matchingTimer}s)` 
                              : "No one is available right now. Try again later."}
                          </p>
                        </div>

                        {matchingStatus === 'failed' ? (
                          <button
                            onClick={startMatching}
                            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                          >
                            <RefreshCw size={20} /> TRY AGAIN
                          </button>
                        ) : null}

                        <button
                          onClick={cancelMatching}
                          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                          <ChevronLeft size={24} /> CANCEL SEARCH
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {appState === 'chat' && (
                  <div className="h-full flex flex-col bg-white">
                    <header className="px-4 py-3 bg-[#e0f2fe] border-b border-black/5 flex items-center justify-between sticky top-0 z-20">
                      <div className="flex items-center gap-3 min-w-0">
                        <button 
                          onClick={disconnect}
                          className="p-1 text-slate-800 hover:bg-black/5 rounded-full transition-colors shrink-0"
                        >
                          <ChevronLeft size={24} />
                        </button>
                        
                        <div 
                          onClick={() => setShowStrangerProfile(true)}
                          className="flex items-center gap-2 cursor-pointer min-w-0"
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            matchedStranger?.gender === 'male' ? "bg-blue-500/20 text-[#3B82F6]" : 
                            matchedStranger?.gender === 'female' ? "bg-red-500/20 text-[#EF4444]" : 
                            "bg-green-500/20 text-[#22C55E]"
                          )}>
                            <User size={18} fill="currentColor" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <h1 className="text-xl font-black tracking-tight text-slate-800 italic truncate leading-none">
                              {matchedStranger?.nickname}
                            </h1>
                            <div className="flex items-center gap-1 mt-0.5">
                              {(() => {
                                const isOnline = strangerOnline;
                                return (
                                  <>
                                    <div className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      isOnline ? "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" : "bg-slate-500"
                                    )}></div>
                                    <span className={cn(
                                      "text-[9px] font-bold not-italic uppercase tracking-tight",
                                      isOnline ? "text-blue-500" : "text-slate-500"
                                    )}>
                                      {isOnline ? 'online' : 'offline'}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isSavedChat ? (
                          <>
                            <button 
                              onClick={handleSaveChat}
                              disabled={meRequestedSave}
                              className={cn(
                                "flex items-center gap-1 p-1.5 rounded-lg transition-all",
                                meRequestedSave ? "text-primary bg-primary/10" : "text-slate-600 hover:text-slate-900 hover:bg-black/5"
                              )}>
                              <Bookmark size={18} fill={meRequestedSave ? "currentColor" : "none"} />
                            </button>

                            <button 
                              onClick={nextMatch}
                              className="flex items-center gap-1 px-2 py-1 text-primary hover:bg-primary/5 rounded-full transition-all font-black text-[10px] italic border border-primary/20"
                            >
                              NEXT <InfinityIcon />
                            </button>
                          </>
                        ) : (
                          <div className="relative">
                            <button 
                              onClick={() => setChatSettingsOpen(!chatSettingsOpen)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg transition-all"
                            >
                              <MoreVertical size={20} />
                            </button>
                            
                            {chatSettingsOpen && (
                              <>
                                <div 
                                  className="fixed inset-0 z-20"
                                  onClick={() => setChatSettingsOpen(false)}
                                />
                                <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <button 
                                    onClick={handleClearChat}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Trash2 size={14} /> Clear Chat
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (currentChatId && matchedStranger) {
                                        const isBlocked = blockedUsers.some(u => u.id === currentChatId);
                                        if (isBlocked) {
                                          setBlockedUsers(prev => prev.filter(u => u.id !== currentChatId));
                                          socketRef.current?.emit('unblock_user', { targetUserId: matchedStranger.userId });
                                        } else {
                                          setBlockedUsers(prev => [...prev, { 
                                            id: currentChatId, 
                                            nickname: matchedStranger.nickname, 
                                            gender: matchedStranger.gender as Gender 
                                          }]);
                                          socketRef.current?.emit('block_user', { targetUserId: matchedStranger.userId });
                                        }
                                      }
                                      setChatSettingsOpen(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 border-t border-slate-50"
                                  >
                                    <Ban size={14} /> {blockedUsers.some(u => u.id === currentChatId) ? 'Unblock' : 'Block'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </header>

                    {/* Save Chat Popup Notification */}
                    {!isSavedChat && !meRequestedSave && (
                      <div className="relative h-0 z-30">
                        <div className="absolute top-2 right-12 animate-in fade-in slide-in-from-top-2 duration-500">
                          <div className="bg-blue-600 text-white text-[10px] font-black px-3 py-2 rounded-xl shadow-xl relative whitespace-nowrap flex items-center gap-2">
                            Press this to save the chat
                            <ArrowUp size={14} className="animate-bounce" />
                            <div className="absolute -top-1 right-10 w-2 h-2 bg-blue-600 rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex flex-col relative",
                            msg.id.startsWith('system') ? "w-full items-center" : (msg.sender === 'me' ? "ml-auto items-end max-w-[85%]" : "mr-auto items-start max-w-[85%]")
                          )}
                        >
                          {/* Long Press Menu */}
                          {longPressedMessageId === msg.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40 bg-black/5 backdrop-blur-[0.5px]"
                                onClick={(e) => { 
                                  e.preventDefault();
                                  e.stopPropagation(); 
                                  setLongPressedMessageId(null); 
                                }}
                              />
                              <div 
                                className={cn(
                                  "absolute z-50 bottom-full mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200",
                                  msg.sender === 'me' ? "right-0" : "left-0"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLongPressedMessageId(null);
                                }}
                              >
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMessage(msg.id, 'me');
                                  }}
                                  className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-600 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 active:bg-slate-100 transition-colors"
                                >
                                  <Trash2 size={14} className="text-slate-400" /> DELETE MESSAGE
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMessage(msg.id, 'everyone');
                                  }}
                                  className="w-full px-4 py-3 text-left text-[11px] font-black text-red-500 hover:bg-red-50 flex items-center gap-3 active:bg-red-100 transition-colors"
                                >
                                  <RefreshCw size={14} className="text-red-400" /> DELETE FROM BOTH
                                </button>
                              </div>
                            </>
                          )}

                          <div
                            onPointerDown={() => {
                              if (!msg.id.startsWith('system') && !msg.isDeleted) {
                                const timer = setTimeout(() => {
                                  setLongPressedMessageId(msg.id);
                                  // Vibrate on mobile if supported
                                  if ('vibrate' in navigator) navigator.vibrate(50);
                                }, 500);
                                setLongPressTimer(timer);
                              }
                            }}
                            onPointerUp={() => {
                              if (longPressTimer) {
                                clearTimeout(longPressTimer);
                                setLongPressTimer(null);
                              }
                            }}
                            onPointerLeave={() => {
                              if (longPressTimer) {
                                clearTimeout(longPressTimer);
                                setLongPressTimer(null);
                              }
                            }}
                            onPointerMove={() => {
                              if (longPressTimer) {
                                clearTimeout(longPressTimer);
                                setLongPressTimer(null);
                              }
                            }}
                            className={cn(
                              "px-3 py-2 rounded-2xl text-[13px] md:text-sm shadow-sm relative group transition-all",
                              msg.id.startsWith('system') 
                                ? "bg-slate-100 text-slate-500 italic text-center w-full max-w-full text-xs"
                                : msg.isDeleted
                                ? "bg-slate-50 text-slate-300 italic border-[0.5px] border-slate-100 min-w-[120px]"
                                : msg.sender === 'me'
                                ? "bg-[#dcf8c6] text-slate-800 rounded-tr-none min-w-[80px] border-[0.5px] border-black/5"
                                : "bg-white text-slate-800 rounded-tl-none border-[0.5px] border-slate-200/50 min-w-[80px]",
                              longPressedMessageId === msg.id && "scale-95 opacity-80"
                            )}
                          >
                            <div className="flex flex-col">
                              <div className={cn("mb-1", (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio') && "mb-0")}>
                                {msg.isDeleted ? (
                                  'Message deleted'
                                ) : msg.type === 'audio' && msg.audio ? (
                                  <div className="relative">
                                    <VoiceMessage audioSrc={msg.audio} durationStr={msg.text.match(/\((.*?)\)/)?.[1] || "0:00"} />
                                    <div className="absolute bottom-0.5 right-3 flex items-center gap-1 opacity-60">
                                      <span className="text-[7px] font-bold text-slate-500">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {msg.sender === 'me' && (
                                        <div className="shrink-0">
                                          {msg.status === 'seen' ? (
                                            <CheckCheck size={9} strokeWidth={3} className="text-blue-500" />
                                          ) : msg.status === 'delivered' ? (
                                            <CheckCheck size={9} strokeWidth={3} className="text-slate-400" />
                                          ) : (
                                            <Check size={9} strokeWidth={3} className="text-slate-400" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : msg.type === 'image' && msg.image ? (
                                  <div className="relative group rounded-lg overflow-hidden max-w-[240px] border-[0.5px] border-black/10">
                                    <img src={msg.image} alt="Sent image" className="w-full h-auto block" />
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(msg.image!, `image-${Date.now()}.png`);
                                      }}
                                      className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-md text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                                      title="Save to device"
                                    >
                                      <Download size={14} />
                                    </button>
                                    <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                      <span className="text-[8px] font-bold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {msg.sender === 'me' && (
                                        <div className="shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                          {msg.status === 'seen' ? (
                                            <CheckCheck size={11} strokeWidth={3} className="text-blue-400" />
                                          ) : msg.status === 'delivered' ? (
                                            <CheckCheck size={11} strokeWidth={3} className="text-white/70" />
                                          ) : (
                                            <Check size={11} strokeWidth={3} className="text-white/70" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : msg.type === 'video' && msg.video ? (
                                  <div className="relative group rounded-lg overflow-hidden max-w-[240px] bg-black border-[0.5px] border-white/10">
                                    <video src={msg.video} controls className="w-full h-auto block" />
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(msg.video!, `video-${Date.now()}.mp4`);
                                      }}
                                      className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-md text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 z-10"
                                      title="Save to device"
                                    >
                                      <Download size={14} />
                                    </button>
                                    <div className="absolute bottom-1 right-1 flex items-center gap-1 z-10 pointer-events-none">
                                      <span className="text-[8px] font-bold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {msg.sender === 'me' && (
                                        <div className="shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                                          {msg.status === 'seen' ? (
                                            <CheckCheck size={11} strokeWidth={3} className="text-blue-400" />
                                          ) : msg.status === 'delivered' ? (
                                            <CheckCheck size={11} strokeWidth={3} className="text-white/70" />
                                          ) : (
                                            <Check size={11} strokeWidth={3} className="text-white/70" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : msg.type === 'file' && msg.file ? (
                                  <div className="flex flex-col gap-1 min-w-[180px]">
                                    <div 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(msg.file!, msg.fileName || 'document');
                                      }}
                                      className="flex items-center gap-3 p-3 bg-black/5 rounded-2xl border-[0.5px] border-black/5 cursor-pointer hover:bg-black/10 transition-colors"
                                    >
                                      <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                                        <FileText size={20} />
                                      </div>
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-bold truncate text-slate-800">{msg.fileName || 'Document'}</span>
                                        <span className="text-[9px] uppercase font-black opacity-40">Document</span>
                                      </div>
                                      <div 
                                        className="w-8 h-8 shrink-0 rounded-lg bg-white border border-slate-100 text-primary flex items-center justify-center hover:bg-slate-50 transition-all active:scale-90 shadow-sm"
                                        title="Download"
                                      >
                                        <Download size={16} />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  msg.text
                                )}
                              </div>
                              {!msg.id.startsWith('system') && !msg.isDeleted && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'audio' && (
                                <div className={cn(
                                  "flex items-center gap-1 justify-end -mb-0.5 opacity-70",
                                  msg.sender === 'me' ? "text-slate-500" : "text-slate-400"
                                )}>
                                  <span className="text-[9px] font-bold">
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {msg.sender === 'me' && (
                                    <div className="shrink-0">
                                      {msg.status === 'seen' ? (
                                        <CheckCheck size={13} strokeWidth={3} className="text-blue-500" />
                                      ) : msg.status === 'delivered' ? (
                                        <CheckCheck size={13} strokeWidth={3} className="text-slate-400" />
                                      ) : (
                                        <Check size={13} strokeWidth={3} className="text-slate-400" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {currentChatId && blockedUsers.some(u => u.id === currentChatId) && (
                        <div className="w-full flex justify-center mt-4">
                          <div className="bg-red-50 text-red-500 text-[11px] font-bold px-4 py-2 rounded-xl border border-red-100 italic flex items-center gap-2">
                            <Ban size={14} /> You have blocked this user
                          </div>
                        </div>
                      )}
                      {isBlockedByStranger && (
                        <div className="w-full flex justify-center mt-4">
                          <div className="bg-slate-100 text-slate-500 text-[11px] font-bold px-4 py-2 rounded-xl border border-slate-200 italic flex items-center gap-2">
                            <Ban size={14} /> You are blocked by this user
                          </div>
                        </div>
                      )}
                      {isStrangerTyping && (
                        <div className="flex flex-col items-start max-w-[80%] mr-auto">
                          <div className="bg-slate-100 text-slate-500 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200/50">
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <form 
                      onSubmit={handleSendMessage}
                      className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center"
                    >
                      {!isRecording && !voiceRecorded && isSavedChat && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            type="button"
                            onClick={() => handleSendMedia('image')}
                            className="p-2 text-primary hover:bg-primary/5 rounded-full transition-all"
                            title="Send Image/Video"
                          >
                            <ImageIcon size={20} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleSendMedia('camera')}
                            className="p-2 text-primary hover:bg-primary/5 rounded-full transition-all"
                            title="Open Camera"
                          >
                            <Camera size={20} />
                          </button>
                        </div>
                      )}

                      <div className="flex-1 relative">
                        {isRecording ? (
                          <div className="w-full py-3 px-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center justify-between animate-pulse">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-red-600 rounded-full animate-ping"></div>
                              <span className="font-bold text-xs">Recording...</span>
                            </div>
                            <span className="font-mono text-xs">
                              {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        ) : voiceRecorded ? (
                          <div className="w-full py-3 px-4 bg-primary/5 text-primary rounded-2xl border border-primary/10 flex items-center justify-between">
                            <span className="font-bold text-xs italic">Voice message recorded</span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs">
                                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                              </span>
                              <button 
                                type="button" 
                                onClick={() => { setVoiceRecorded(false); setRecordingTime(0); }}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder={currentChatId && (blockedUsers.some(u => u.id === currentChatId) || isBlockedByStranger) ? "Chat Locked" : "Say something nice..."}
                            className="w-full py-3 px-4 bg-slate-50 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium disabled:opacity-50 text-[13px]"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            disabled={!!(currentChatId && (blockedUsers.some(u => u.id === currentChatId) || isBlockedByStranger))}
                          />
                        )}
                      </div>

                      {voiceRecorded ? (
                        <button
                          type="button"
                          onClick={handleSendVoice}
                          disabled={isBlockedByStranger || (currentChatId ? blockedUsers.some(u => u.id === currentChatId) : false)}
                          className="p-3 bg-primary text-white rounded-2xl hover:bg-primary/90 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg shadow-primary/20 active:scale-95 shrink-0"
                        >
                          <Send size={18} />
                        </button>
                      ) : (inputValue.trim() || !isSavedChat) && !isRecording ? (
                        <button
                          type="submit"
                          disabled={!inputValue.trim() || !!(currentChatId && (blockedUsers.some(u => u.id === currentChatId) || isBlockedByStranger))}
                          className="p-3 bg-primary text-white rounded-2xl hover:bg-primary/90 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg shadow-primary/20 active:scale-95 shrink-0"
                        >
                          <Send size={18} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBlockedByStranger || (currentChatId ? blockedUsers.some(u => u.id === currentChatId) : false)}
                          onPointerDown={() => {
                            if (!isBlockedByStranger && !(currentChatId && blockedUsers.some(u => u.id === currentChatId))) {
                              const timer = setTimeout(() => {
                                startRecording();
                              }, 500);
                              setLongPressTimer(timer);
                            }
                          }}
                          onPointerUp={() => {
                            handleChatPressRelease();
                            if (isRecording) {
                              stopRecording();
                            }
                          }}
                          onPointerLeave={() => {
                            handleChatPressRelease();
                            if (isRecording) {
                              stopRecording();
                            }
                          }}
                          className={cn(
                            "p-3 rounded-2xl transition-all shadow-lg active:scale-95 shrink-0",
                            isRecording 
                              ? "bg-red-600 text-white shadow-red-200 scale-110"
                              : "bg-primary text-white shadow-primary/20"
                          )}
                          title="Hold to record voice message"
                        >
                          <Mic size={18} />
                        </button>
                      )}
                    </form>

                    {/* Stranger Profile Modal */}
                    {showStrangerProfile && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div 
                          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                          onClick={() => setShowStrangerProfile(false)}
                        />
                        <div className="bg-white w-full rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                          <div className={cn(
                            "h-32 flex items-end justify-center pb-6",
                            matchedStranger?.gender === 'male' ? "bg-blue-500" : 
                            matchedStranger?.gender === 'female' ? "bg-red-500" : 
                            "bg-green-500"
                          )}>
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg transform translate-y-12">
                              <User size={48} className={cn(
                                matchedStranger?.gender === 'male' ? "text-blue-500" : 
                                matchedStranger?.gender === 'female' ? "text-red-500" : 
                                "text-green-500"
                              )} fill="currentColor" />
                            </div>
                          </div>
                          
                          <div className="pt-16 pb-8 px-8 text-center space-y-4">
                            <div>
                              <h2 className="text-2xl font-black text-slate-800 italic">{matchedStranger?.nickname}</h2>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{matchedStranger?.gender}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 pt-4">
                              <div className="bg-slate-50 p-3 rounded-2xl">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</div>
                                {(() => {
                                  const isOnline = strangerOnline;
                                  return (
                                    <div className={cn(
                                      "font-bold text-sm italic",
                                      isOnline ? "text-blue-600" : "text-slate-400"
                                    )}>
                                      {isOnline ? 'Online' : 'Offline'}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div className="bg-slate-50 p-3 rounded-2xl">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Identity</div>
                                <div className="text-slate-700 font-bold text-sm italic">Stranger</div>
                              </div>
                            </div>

                            <div className="pt-4">
                              <button 
                                onClick={() => setShowStrangerProfile(false)}
                                className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
                        )}
                      </main>
                    </>
                  )}
            
                  {/* Camera Overlay */}
                  {isCameraOpen && (
                    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
                      <div className="p-4 flex justify-between items-center bg-black/50 backdrop-blur-md text-white">
                        <button onClick={stopCamera} className="p-2 hover:bg-white/10 rounded-full">
                          <X size={24} />
                        </button>
                        <div className="font-bold italic">Co<span className="text-red-600">nn</span>ect Camera</div>
                        <button onClick={switchCamera} className="p-2 hover:bg-white/10 rounded-full">
                          <RotateCcw size={24} />
                        </button>
                      </div>
            
                      <div className="flex-1 relative bg-slate-900 flex items-center justify-center overflow-hidden">
                        {!capturedMedia ? (
                          <video 
                            ref={cameraVideoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className={cn(
                              "w-full h-full object-cover",
                              cameraFacingMode === 'user' && "-scale-x-100"
                            )}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                            {capturedMedia.type === 'image' ? (
                              <img src={capturedMedia.data} className="max-w-full max-h-full object-contain" alt="Captured" />
                            ) : (
                              <video src={capturedMedia.data} controls className="max-w-full max-h-full object-contain" autoPlay loop />
                            )}
                          </div>
                        )}
            
                        {isRecordingCamera && (
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-2">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                            RECORDING
                          </div>
                        )}
                      </div>
            
                      <div className="p-8 bg-black/50 backdrop-blur-md flex justify-center items-center gap-8">
                        {!capturedMedia ? (
                          <>
                            <button 
                              onClick={captureImage}
                              className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-110 transition-transform active:scale-90"
                            >
                              <div className="w-12 h-12 bg-white rounded-full"></div>
                            </button>
                            <button 
                              onClick={isRecordingCamera ? stopCameraRecording : startCameraRecording}
                              className={cn(
                                "w-16 h-16 rounded-full border-4 flex items-center justify-center hover:scale-110 transition-transform active:scale-90",
                                isRecordingCamera ? "border-red-500" : "border-white"
                              )}
                            >
                              <div className={cn(
                                "transition-all",
                                isRecordingCamera ? "w-6 h-6 bg-red-500 rounded-sm" : "w-12 h-12 bg-red-500 rounded-full"
                              )}></div>
                            </button>
                          </>
                        ) : (
                          <div className="flex gap-4 w-full px-4">
                            <button 
                              onClick={() => {
                                setCapturedMedia(null);
                                // Removed direct startCamera call, now handled by useEffect
                              }}
                              className="flex-1 py-3 bg-white/10 text-white rounded-2xl font-bold hover:bg-white/20 transition-all"
                            >
                              Retake
                            </button>
                            <button 
                              onClick={sendCapturedMedia}
                              className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                            >
                              <Send size={18} /> Send
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
            
                  <input 
                    type="file" 
                    ref={imageInputRef} 
                    onChange={handleImageChange} 
                    accept="image/*,video/*" 
                    className="hidden" 
                  />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".pdf,.doc,.docx,.txt,.zip" 
        className="hidden" 
      />
    </div>
  );
}
