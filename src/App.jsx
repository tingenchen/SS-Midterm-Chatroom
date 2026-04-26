import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, 
  collection, onSnapshot, addDoc 
} from 'firebase/firestore';

// --- 1. Firebase 初始化 ---
const firebaseConfig = {
  apiKey: "AIzaSyBp8qvEOmyTM5cIl36JpE9wnbXKD-fOMR0",
  authDomain: "software-studio-7a874.firebaseapp.com",
  databaseURL: "https://software-studio-7a874-default-rtdb.firebaseio.com",
  projectId: "software-studio-7a874",
  storageBucket: "software-studio-7a874.firebasestorage.app",
  messagingSenderId: "1095518903414",
  appId: "1:1095518903414:web:a5f8b3c83bf5d050449357",
  measurementId: "G-61GRW4JF86"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', phone: '', address: '', photoURL: '' });
  
  const [allUsers, setAllUsers] = useState([]); 
  const [chatrooms, setChatrooms] = useState([]); 
  const [currentRoom, setCurrentRoom] = useState(null); 
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState(''); 
  const [sidebarTab, setSidebarTab] = useState('chats'); 
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserData(null);
        setAllUsers([]);
        setChatrooms([]);
        setCurrentRoom(null);
        setMessages([]);
        setEmail('');
        setPassword('');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; 

    const fetchUserData = async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserData(userDoc.data());
          setProfileForm(userDoc.data());
        } else {
          const defaultData = {
            email: user.email,
            username: user.displayName || user.email?.split('@')[0] || 'Unknown',
            address: '',
            phone: '',
            photoURL: user.photoURL || '',
            createdAt: Date.now()
          };
          await setDoc(userDocRef, defaultData);
          setUserData(defaultData);
          setProfileForm(defaultData);
        }
      } catch (err) {
        console.error("抓取個人資料失敗:", err);
      }
    };
    fetchUserData();

    const usersUnsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList = [];
      snapshot.forEach(d => {
        if (d.id !== user.uid) {
          usersList.push({ id: d.id, ...d.data() });
        }
      });
      setAllUsers(usersList);
    });

    const roomsUnsub = onSnapshot(collection(db, "chatrooms"), (snapshot) => {
      const roomsList = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.members && data.members.includes(user.uid)) {
          roomsList.push({ id: d.id, ...data });
        }
      });
      roomsList.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      setChatrooms(roomsList);
    });

    return () => {
      usersUnsub();
      roomsUnsub();
    };
  }, [user]);

  useEffect(() => {
    if (!currentRoom) {
      setMessages([]);
      return;
    }

    const messagesUnsub = onSnapshot(collection(db, `chatrooms/${currentRoom.id}/messages`), (snapshot) => {
      const msgs = [];
      snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => messagesUnsub();
  }, [currentRoom]);

  // --- 輔助函數 ---
  const startPrivateChat = async (targetUser) => {
    const existingRoom = chatrooms.find(room => 
      room.type === 'private' && room.members.includes(targetUser.id)
    );

    if (existingRoom) {
      setCurrentRoom(existingRoom);
    } else {
      const newRoom = {
        type: 'private',
        members: [user.uid, targetUser.id],
        names: { [user.uid]: userData.username, [targetUser.id]: targetUser.username },
        createdAt: Date.now(),
        lastMessage: '',
        lastMessageTime: Date.now()
      };
      const docRef = await addDoc(collection(db, "chatrooms"), newRoom);
      setCurrentRoom({ id: docRef.id, ...newRoom });
    }
    setSidebarTab('chats');
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentRoom) return;

    const msgText = newMessage.trim();
    setNewMessage(''); 

    await addDoc(collection(db, `chatrooms/${currentRoom.id}/messages`), {
      text: msgText,
      senderId: user.uid,
      senderName: userData.username,
      senderPhoto: userData.photoURL || '',
      createdAt: Date.now()
    });

    await updateDoc(doc(db, "chatrooms", currentRoom.id), {
      lastMessage: msgText,
      lastMessageTime: Date.now()
    });
  };

  const getRoomName = (room) => {
    if (room.type === 'private') {
      const otherId = room.members.find(id => id !== user.uid);
      // 從 allUsers 中抓取最新的名稱，如果沒抓到才用備用的
      const otherUser = allUsers.find(u => u.id === otherId);
      return otherUser ? otherUser.username : (room.names[otherId] || '未知用戶');
    }
    return room.name || '群組聊天';
  };

  // 【新增】取得聊天室對方的頭貼
  const getRoomPhoto = (room) => {
    if (room.type === 'private') {
      const otherId = room.members.find(id => id !== user.uid);
      const otherUser = allUsers.find(u => u.id === otherId);
      return otherUser ? otherUser.photoURL : null;
    }
    return null; // 未來群組聊天可以放預設群組圖片
  };

  const handleAuth = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          email: cred.user.email, username: email.split('@')[0],
          address: '', phone: '', photoURL: '', createdAt: Date.now()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) { 
      if (err.code === 'auth/invalid-credential') setError('帳號或密碼錯誤！');
      else setError("認證錯誤：" + err.message); 
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email,
          username: result.user.displayName || result.user.email.split('@')[0],
          photoURL: result.user.photoURL || '',
          address: '',
          phone: '',
          createdAt: Date.now()
        });
      }
    } catch (err) {
      setError('Google 登入失敗：' + err.message);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), profileForm);
    setUserData(prev => ({...prev, ...profileForm}));
    setIsProfileOpen(false); 
  };

  // ================= 渲染畫面 =================
  if (!user || !userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md">
          <h1 className="text-3xl font-black text-center mb-6">{isRegistering ? '註冊帳號' : '會員登入'}</h1>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-bold">{error}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" placeholder="電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">{isRegistering ? '註冊' : '登入'}</button>
          </form>
          <button onClick={() => { setIsRegistering(!isRegistering); setError(''); }} className="mt-4 text-blue-600 w-full text-center text-sm font-bold hover:underline">
            {isRegistering ? '已有帳號？切換登入' : '沒有帳號？立即註冊'}
          </button>
          
          <div className="mt-6">
            <button onClick={handleGoogleSignIn} className="w-full bg-white border border-gray-200 py-3 rounded-xl flex items-center justify-center space-x-3 hover:bg-gray-50 font-bold text-gray-700 shadow-sm transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span>使用 Google 快速登入</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      
      {/* 左側 Sidebar */}
      <div className={`${currentRoom ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white border-r`}>
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80" onClick={() => setIsProfileOpen(true)}>
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
              {userData.photoURL ? <img src={userData.photoURL} className="w-full h-full object-cover" /> : <span className="font-bold text-blue-600">{userData.username[0].toUpperCase()}</span>}
            </div>
            <div>
              <h2 className="font-bold text-gray-800 leading-tight">{userData.username}</h2>
              <p className="text-xs text-gray-500">點擊編輯個人檔案</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="text-xs text-red-500 font-bold hover:bg-red-50 p-2 rounded-lg transition">登出</button>
        </div>

        <div className="flex border-b">
          <button onClick={() => setSidebarTab('chats')} className={`flex-1 py-3 text-sm font-bold ${sidebarTab === 'chats' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>聊天室</button>
          <button onClick={() => setSidebarTab('users')} className={`flex-1 py-3 text-sm font-bold ${sidebarTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>所有用戶 ({allUsers.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarTab === 'chats' ? (
            chatrooms.length > 0 ? chatrooms.map(room => (
              <div key={room.id} onClick={() => setCurrentRoom(room)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition flex items-center gap-3 ${currentRoom?.id === room.id ? 'bg-blue-50' : ''}`}>
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                  {/* 【修正這裡】顯示正確的對方頭貼 */}
                  {getRoomPhoto(room) ? (
                    <img src={getRoomPhoto(room)} className="w-full h-full object-cover" alt="avatar" />
                  ) : (
                    <span className="font-bold text-gray-500">{getRoomName(room)[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 truncate">{getRoomName(room)}</h3>
                  <p className="text-sm text-gray-500 truncate mt-1">{room.lastMessage || '尚無訊息'}</p>
                </div>
              </div>
            )) : <div className="p-6 text-center text-gray-400 mt-10">尚無聊天紀錄<br/><span className="text-sm">請點擊上方「所有用戶」發起私訊</span></div>
          ) : (
            allUsers.length > 0 ? allUsers.map(u => (
              <div key={u.id} className="p-4 border-b flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <span className="font-bold text-gray-500">{u.username[0].toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 truncate">{u.username}</h3>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                </div>
                <button onClick={() => startPrivateChat(u)} className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-sm font-bold hover:bg-blue-100 transition shadow-sm flex-shrink-0">私訊</button>
              </div>
            )) : <div className="p-6 text-center text-gray-400 mt-10">目前沒有其他註冊用戶</div>
          )}
        </div>
      </div>

      {/* 右側 聊天室主體 */}
      <div className={`${!currentRoom ? 'hidden md:flex' : 'flex'} flex-col flex-1 bg-white relative`}>
        {currentRoom ? (
          <>
            <div className="bg-white p-4 border-b flex items-center shadow-sm z-10">
              <button onClick={() => setCurrentRoom(null)} className="md:hidden mr-3 text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded-lg">← 返回</button>
              {/* 聊天室標題旁邊也加上對方頭貼 */}
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden mr-3">
                {getRoomPhoto(currentRoom) ? (
                  <img src={getRoomPhoto(currentRoom)} className="w-full h-full object-cover" alt="avatar" />
                ) : (
                  <span className="font-bold text-gray-500 text-xs">{getRoomName(currentRoom)[0].toUpperCase()}</span>
                )}
              </div>
              <h2 className="text-lg font-bold text-gray-800">{getRoomName(currentRoom)}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.map(msg => {
                const isMe = msg.senderId === user.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 mr-2 flex-shrink-0 overflow-hidden flex items-center justify-center mt-1">
                        {msg.senderPhoto ? <img src={msg.senderPhoto} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-white">{msg.senderName[0].toUpperCase()}</span>}
                      </div>
                    )}
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm border'}`}>
                      {!isMe && <p className="text-xs text-gray-400 mb-1 font-bold">{msg.senderName}</p>}
                      <p className="break-words leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newMessage} 
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="輸入訊息..." 
                  className="flex-1 p-3 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 px-6"
                />
                <button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 text-white p-3 rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-300 transition w-12 h-12 flex items-center justify-center shadow-md">
                  ➤
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <svg className="w-24 h-24 mb-4 opacity-50 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <p className="text-lg font-bold text-gray-500">點擊左側列表開始聊天</p>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">編輯個人檔案</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div><label className="text-sm font-bold text-gray-600">使用者名稱</label><input type="text" value={profileForm.username} onChange={(e) => setProfileForm({...profileForm, username: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required /></div>
              <div><label className="text-sm font-bold text-gray-600">頭像網址</label><input type="url" value={profileForm.photoURL} onChange={(e) => setProfileForm({...profileForm, photoURL: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="圖片連結 (選填)" /></div>
              <div><label className="text-sm font-bold text-gray-600">電話</label><input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-sm font-bold text-gray-600">地址</label><input type="text" value={profileForm.address} onChange={(e) => setProfileForm({...profileForm, address: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsProfileOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition">取消</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">儲存變更</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}